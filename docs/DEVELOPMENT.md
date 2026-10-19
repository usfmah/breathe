# Development notes

## Shape of the app

```
src-tauri/src/
  lib.rs            app wiring: plugins, AppState, worker thread, run()
  model.rs          Settings, Snapshot, ScheduleState, wire types (+ tests)
  scheduler.rs      the authoritative state machine (+ tests)
  clock.rs          Clock trait so the scheduler can be tested without waiting
  commands.rs       the entire IPC surface, window lifecycle, tray helpers
  notify.rs         platform-isolated notification status/delivery
  settings_store.rs load/save settings (never the countdown)
  autostart.rs      platform-isolated startup integration (XDG / Windows Run key)
  tray.rs           tray menu (StatusNotifierItem on Linux, notification area on Windows)
  theme.rs          window labels, theme preference → Tauri theme
src/
  App.tsx           routes on the Tauri window label
  hooks/useBreathe.ts       one controller shared by both windows
  lib/ipc.ts        typed wrappers around `invoke`, plus a browser mock
  lib/presentation.ts       pure state → copy mapping
  components/       MainWindow, TitleBar, CircularTimer, settings/*
```

There is **one** scheduler, in Rust. React renders `Snapshot` values pushed from
Rust; it never owns a timer. The only `setInterval` in the frontend is inside the
browser-only mock.

## Icons

Functional glyphs come from [`lucide-react`](https://lucide.dev/). Its 24px grid,
rounded joins and 1.7px strokes are the language the original hand-drawn set was
already imitating, so the switch is visually a no-op while giving us one
consistent, tree-shaken catalogue to grow into. `src/components/icons.tsx` keeps
the call-site names (`ClockIcon`, `EyeIcon`, …) and applies the app defaults
(decorative `aria-hidden`, `currentColor`, 1.7px stroke) in one place.

The one bespoke asset is the two-tone **leaf mark**. It is the brand, not a UI
glyph, and is intentionally not replaced by a generic leaf. Add new UI icons by
wrapping a Lucide component with `icon(...)` rather than drawing paths by hand.

## Scheduler policy

The scheduler lives in `scheduler.rs` behind a small API (`tick`, `pause`,
`resume`, `set_interval`, `snooze`, `set_running`, `stop`) and an injectable
`Clock` trait. `SystemClock` uses wall time for the deadline and
`CLOCK_MONOTONIC` for liveness; tests use a manual clock.

States:

| State | Meaning |
| --- | --- |
| `Running` | A deadline is set; the worker delivers when it passes. |
| `Paused` | No deadline; `frozen` holds the remaining time. |
| `Snoozed` | A single one-off reminder is scheduled `snooze` from now. |
| `Stopped` | Only while the process is shutting down. Serialized as `"quit"`. |

Rules, all covered by tests:

- **One deadline, one delivery.** The worker ticks every 500 ms but only fires
  when `now >= deadline`, then immediately schedules the next full interval.
  Re-renders and duplicate listeners cannot produce duplicate reminders.
- **Pause** freezes the remaining time and clears the deadline, so nothing can
  be delivered while paused.
- **Resume** continues from the frozen time; if it has already elapsed, it
  starts a full interval instead.
- **Changing the interval** restarts the countdown from the new value. If the
  schedule was snoozed, the snooze is cancelled.
- **Snooze** replaces the current deadline with `now + 5 min`; snoozing twice
  re-arms one timer, never two.
- **Alternation** is a counter, not random: with both categories on, reminders
  alternate eye → movement → eye. With one category on, that category is always
  used. With both off the schedule is inactive.
- **Hidden is not a state.** Hiding the window only sets
  `Snapshot::window_hidden`; scheduling is unaffected.
- **Suspend/resume.** Each tick compares wall-clock advance with monotonic
  advance. A divergence over 5 s means the machine slept. Missed reminders are
  **dropped, never replayed**, and the next reminder is one full interval from
  the resume. This also avoids a burst of notifications after a long sleep.

## IPC surface

Everything privileged is a Rust command; the webview has no filesystem, process
or D-Bus access (see `src-tauri/capabilities/default.json` — only
`core:default` and `core:window:allow-start-dragging`).

`get_settings`, `get_snapshot`, `get_notification_status`, `get_autostart_status`,
`get_app_info`, `save_settings`, `pause_reminders`, `resume_reminders`,
`snooze_reminders`, `send_test_notification`, `set_autostart`, `hide_window`,
`minimize_window`, `open_settings`, `quit_app`.

`save_settings` validates every field (`SettingsPatch::apply`): the interval is
clamped to 20–60 minutes, unknown themes are rejected, and the tray/theme/window
side effects happen only after the store write succeeds.

Rust pushes `breathe://snapshot` and `breathe://settings`; both windows listen,
so they stay in sync without polling.

## Notifications

`notify.rs` is split by target platform. Both paths use
`tauri-plugin-notification` for delivery.

**Linux:** before dispatching, `deliver` performs a real
`GetServerInformation` round trip through `notify_rust`. The plugin dispatches
on a background task and returns `Ok(())` before the daemon answers; without the
pre-flight the UI would claim success on a desktop with no notification service.
If the pre-flight finds a daemon but the direct delivery fails, the plugin is
used as a fallback and its error is returned to the UI.

**Windows:** delivery goes straight through the plugin's native toast backend.
The status reports the Windows toast platform. The plugin dispatches toast
delivery asynchronously; it can report a preparation error, but Windows can also
suppress a toast (for example with Focus Assist) without returning one. The
plugin sets the application identity only when the app is not running from
`target/debug` or `target/release`, so installed builds have proper toast
attribution while development runs may not.

The notification carries no actions, no custom sound and no icon hint beyond the
app icon, so it degrades gracefully where those are unsupported.

## Autostart

`autostart.rs` reports a platform-neutral `AutostartStatus`:

| Field | Meaning |
| --- | --- |
| `enabled` | The plugin currently has a startup entry. |
| `mechanism` | Human-readable mechanism, e.g. `XDG autostart` or `Windows Run key`. |
| `entry_path` | Linux desktop-entry path, or the Windows Run-key location. |
| `session_reads_startup_entry` | Linux session probe; always true on Windows. |
| `notes` | Platform/session-specific guidance. |

**Linux** writes `~/.config/autostart/Breathe.desktop` through the autostart
plugin. A small probe recognizes sessions (notably niri) that do not read XDG
autostart entries and emits a note suggesting a compositor-specific launch line
instead.

**Windows** writes a per-user value under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; no administrator rights
are needed. The entry launches the app with `--autostart`, which starts hidden.
There is no session probe to perform.

The Settings UI renders `mechanism` and only shows Linux-specific removal
instructions when the mechanism is the XDG one.

## Tray

The menu is rebuilt only when a label or enabled state actually changes; the
500 ms tick therefore does not produce two D-Bus messages per second.

On Linux the tray is a StatusNotifierItem and Tauri never emits
`TrayIconEvent::Click`, so every action lives in the menu. On Windows the menu is
shown on left click as well as right click (`show_menu_on_left_click(true)`), and
the same actions are available. Without a StatusNotifierItem host, the Linux app
still runs; only the tray menu is missing.

## Platform configuration

The common Tauri configuration is `src-tauri/tauri.conf.json`. Platform bundle
metadata is isolated:

| File | Contents |
| --- | --- |
| `src-tauri/tauri.linux.conf.json` | RPM/DEB/AppImage targets, Fedora/Debian dependency names |
| `src-tauri/tauri.windows.conf.json` | NSIS target, `currentUser`, WebView2 bootstrapper, bundled VC runtime, NSIS languages |

The Windows bundle uses `icons/icon.ico`; Linux uses the PNG sizes. The app
identifier stays `dev.breathe.app` on both platforms so settings paths and the
wire format do not change.

## Packaging and versioning

- `scripts/check-version.mjs` checks `package.json`,
  `package-lock.json`, `src-tauri/tauri.conf.json` and the `[package]` version
  in `src-tauri/Cargo.toml`. It optionally checks a release tag.
- `scripts/render-aur.mjs` renders the release copy of the AUR files with the
  real SHA-256 of the generated source tarball. The repository copy uses
  `sha256sums=('SKIP')` until a release exists.
- `.github/workflows/ci.yml` builds and tests on Linux and Windows, builds the
  Linux/NSIS packages, builds and checks the website, validates the AUR metadata,
  and never publishes.
- `.github/workflows/release.yml` runs on `v*` tags, smoke-tests installs, and
  publishes the release with `GITHUB_TOKEN`.
- `.github/workflows/pages.yml` deploys the static landing page to GitHub Pages
  from `main` only, after Pages has been enabled by the repository owner.

The release build host is Ubuntu 22.04, which keeps the glibc floor at 2.35.
Do not publish an AppImage built on a newer host as the release artifact; it
will not run on older distributions.

## Testing

- `cargo test --locked --manifest-path src-tauri/Cargo.toml` — scheduler, model,
  validation, settings round-trips, plus Linux and Windows unit tests for the
  notification and autostart reporting helpers.
- `npm test` — app presentation/component tests and website release-selection
  tests.
- `npm run typecheck` — strict TypeScript for the app and the Vite config.
- `npm run website:build` — website production build and strict website types.
- `npm run website:check` — `/breathe/` base path, bundled asset, screenshot and
  404-page verification.
- `npm run check:version` — keeps `package.json`, `package-lock.json`,
  `tauri.conf.json` and `Cargo.toml` in lockstep.
- `npm run tauri build -- --bundles rpm,deb,appimage -- --locked` — Linux package
  build (the final `-- --locked` is forwarded to Cargo).
- `npm run tauri build -- --bundles nsis -- --locked` — Windows installer build.

`cargo test` compiles `tauri::generate_context!`, so `dist/` must exist. CI runs
`npm run build` before `cargo test` for that reason.

The Rust tests are not a substitute for a real desktop: they cannot prove that a
notification daemon displays a toast, that a Windows toast has the right
identity, or that a tray icon appears. Those are manual checks (and, for Linux
package installation, release-workflow smoke tests).

Interactive checks on a real desktop (used while developing):

```sh
# The tray menu is a D-Bus menu and can be driven without a pointer:
busctl --user get-property org.kde.StatusNotifierWatcher /StatusNotifierWatcher \
  org.kde.StatusNotifierWatcher RegisteredStatusNotifierItems
dbus-send --session --print-reply --dest=<bus> <item>/Menu \
  com.canonical.dbusmenu.GetLayout int32:0 int32:-1 array:string:
# call AboutToShow first, then Event(id, "clicked", ...) to activate an item.
```

For visual states the frontend can be driven in a headless browser against the
Vite dev server: `http://localhost:1420/?window=settings` previews the settings
window (browser mode only; Tauri always uses the real window label).
