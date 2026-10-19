# Breathe

A calm, minimal desktop reminder for people who forget to move.

Breathe sits quietly in the background and nudges you — alternately to rest
your eyes and to stand up and move — on an interval you choose. It never locks
the screen, never steals focus, and never opens a window on top of your work: a
reminder is a desktop notification, and nothing else.

![Breathe main window](docs/images/main-light.png)

## What it does

- **Circular countdown** with the next reminder in `MM:SS`, using muted sage and
  warm cream in light mode, and a soft charcoal version in dark mode.
- **Follow the system theme**, or pin Light / Dark in Settings → Appearance.
- **Reminder interval** of 20, 30, 45 (default) or 60 minutes, changeable from
  the main window or Settings → General.
- **Eye-rest and movement reminders.** When both are on, Breathe alternates.
  With one on, it always uses that one. With both off, nothing is scheduled.
- **Pause / Resume.** Pausing freezes the remaining time; resuming continues it.
- **Optional 5-minute snooze** from the tray or Settings → Reminders.
- **Hides instead of quitting.** Closing the window keeps the scheduler alive.
  Quit from the tray menu or Settings → About.
- **Start with your session** (optional XDG autostart entry).
- A **system-tray menu** on desktops whose bar hosts StatusNotifierItems.

## Requirements

- Fedora Linux (tested on Fedora 44, niri 26.04, Wayland).
- GTK 3, WebKitGTK 4.1, librsvg and libappindicator:

  ```sh
  sudo dnf install gtk3 webkit2gtk4.1 librsvg2 libappindicator-gtk3
  ```

- A **notification daemon** for reminders. Fedora Workstation ships one; on a
  minimal niri/sway setup install `swaynotificationcenter` (swaync), `dunst` or
  `mako`.
- A **StatusNotifierItem host** for the tray icon: waybar's `tray` module, a KDE
  panel, or the GNOME AppIndicator extension. Without one the app still works;
  you just lose the tray menu.

## Run from source

```sh
npm install
npm run tauri dev
```

`npm run dev` alone opens the interface in a browser with a mocked backend —
useful for layout work, but it cannot send real notifications or touch the
scheduler.

## Build and install

```sh
npm run tauri build                 # everything
npm run tauri build -- --bundles rpm  # just the RPM
```

The RPM lands in `src-tauri/target/release/bundle/rpm/`:

```sh
sudo dnf install ./src-tauri/target/release/bundle/rpm/Breathe-0.1.0-1.x86_64.rpm
breathe
```

## Where things live

| What | Where |
| --- | --- |
| Settings | `~/.local/share/dev.breathe.app/settings.json` |
| Autostart entry (if enabled) | `~/.config/autostart/Breathe.desktop` |
| WebKit cache | `~/.local/share/dev.breathe.app/` |

Settings survive restarts. The countdown deliberately does **not**: Breathe
never restores a stale deadline, so after a restart you always get a full
interval instead of a burst of reminders.

## Removing autostart

Turn off Settings → Startup → *Start with user session*, or delete the entry:

```sh
rm ~/.config/autostart/Breathe.desktop
```

If you added Breathe to `~/.config/niri/config.kdl` by hand, remove the matching
`spawn-at-startup` line as well.

## Testing

```sh
npm run typecheck   # strict TypeScript, app + config files
npm test            # frontend unit tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # scheduler, model, settings
```

## Documentation

- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) — the machine this was built and
  verified on.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — architecture, scheduler policy,
  the IPC surface and how to test it.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — notifications, tray,
  autostart and sleep/resume on Fedora + niri, with the exact diagnostic
  commands.

## License

MIT.
