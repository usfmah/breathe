# Development notes

## Shape of the app

```
src-tauri/src/
  lib.rs            app wiring: plugins, AppState, worker thread, run()
  model.rs          Settings, Snapshot, ScheduleState, wire types (+ tests)
  scheduler.rs      the authoritative state machine (+ tests)
  clock.rs          Clock trait so the scheduler can be tested without waiting
  commands.rs       the entire IPC surface, window lifecycle, tray helpers
  notify.rs         freedesktop notification delivery and a real pre-flight
  settings_store.rs load/save settings (never the countdown)
  autostart.rs      XDG autostart + a session compatibility probe
  tray.rs           StatusNotifierItem + menu
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

`notify::deliver` uses `tauri-plugin-notification`, but first performs a real
`GetServerInformation` round trip through `notify_rust`. This is necessary
because on Linux the plugin dispatches on a background task and returns
`Ok(())` before the daemon answers — without the pre-flight the UI would claim
success on a desktop that has no notification service.

The notification carries no actions, no custom sound and no icon hint beyond the
app icon, so it degrades gracefully on daemons that do not support them.

## Tray

Tauri never emits `TrayIconEvent::Click` on Linux, so every action lives in the
menu. The menu is rebuilt only when a label or enabled state actually changes;
the 500 ms tick therefore does not produce two D-Bus messages per second.

## Testing

- `cargo test --manifest-path src-tauri/Cargo.toml` — scheduler, model,
  validation and settings round-trips.
- `npm test` — presentation mapping and React components with Testing Library.
- `npm run typecheck` — strict TypeScript for the app and the Vite config.

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
