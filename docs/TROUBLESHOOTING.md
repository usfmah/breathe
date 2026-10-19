# Troubleshooting (Fedora + niri)

Breathe is a normal freedesktop application: it talks to
`org.freedesktop.Notifications` for reminders and to
`org.kde.StatusNotifierWatcher` for its tray icon. Almost every problem on a
minimal Wayland setup is one of those two services missing, not Breathe itself.

## Reminders never appear

1. **Is a notification daemon running?**

   ```sh
   busctl --user status org.freedesktop.Notifications
   ```

   If that says the name has no owner, nothing can display notifications. On
   niri/sway install one, for example:

   ```sh
   sudo dnf install swaynotificationcenter   # swaync
   systemctl --user enable --now swaync
   ```

   `dunst` and `mako` work too. Do not run two daemons at once — the second one
   will not be able to own the name.

2. **Can anything else notify?**

   ```sh
   notify-send "Breathe" "If you can read this, notifications work."
   ```

   If `notify-send` also fails, the problem is the session, not Breathe.

3. **Is Do Not Disturb on?** In swaync: `swaync-client -D` (and `swaync-client
   -df` to turn it off). Breathe honours the daemon's own DND setting.

4. **Check what Breathe thinks.** Settings → Reminders shows a banner when no
   service is reachable, and the *Send test notification* button performs a real
   delivery. The status comes from an actual `GetServerInformation` round trip,
   so it does not guess.

5. **Watch the bus while a reminder is due:**

   ```sh
   dbus-monitor --session "interface='org.freedesktop.Notifications'"
   ```

   You should see a `Notify` call with summary *"Time to rest your eyes"* or
   *"Time to move a little"*.

6. **Read the app's stderr.** `breathe` logs one line per delivery:

   ```
   [breathe] reminder delivered: Eyes
   [breathe] could not deliver the Movement reminder: ...
   ```

   Start it from a terminal to see them.

## Tray icon or tray menu missing

- The tray is a StatusNotifierItem. It only appears if a bar hosts one:

  ```sh
  busctl --user status org.kde.StatusNotifierWatcher
  busctl --user get-property org.kde.StatusNotifierWatcher /StatusNotifierWatcher \
    org.kde.StatusNotifierWatcher RegisteredStatusNotifierItems
  ```

  The second command should list an item whose path contains
  `tray_icon_tray_app_breathe_tray`.

- On waybar, enable the `tray` module in your config.
- **Clicking the icon will not do anything special.** Tauri never emits
  `TrayIconEvent::Click` on Linux; all actions live in the menu, which opens on
  both left and right click. This is a Tauri/AppIndicator limitation, not a bug
  in Breathe.
- If there is no bar at all, use the window: Settings → About also has **Quit
  Breathe**, so the tray is never the only way out.

## Closing the window does not quit

That is intentional. Closing (or `Esc`) hides the window and keeps the
scheduler running, so reminders continue. To really stop Breathe:

- Tray menu → **Quit**, or
- Settings → About → **Quit Breathe**, or
- `pkill -x breathe`.

## Starting with the session

Settings → Startup writes `~/.config/autostart/Breathe.desktop` and launches the
app with `--autostart`, which starts it hidden in the tray.

- Some minimal sessions do not run XDG autostart at all. Check:

  ```sh
  systemctl --user is-active xdg-desktop-autostart.target
  ```

  If it is not active, add Breathe to `~/.config/niri/config.kdl` instead:

  ```kdl
  spawn-at-startup "breathe" "--hidden"
  ```

- Remove autostart by turning the switch off, or:

  ```sh
  rm ~/.config/autostart/Breathe.desktop
  ```

## After sleep or suspend

Breathe detects suspend by comparing wall-clock and monotonic time. Missed
reminders are **dropped**, never replayed, and the next reminder is one full
interval after the machine wakes. That is deliberate: waking up to a stack of
"stand up" notifications would be worse than missing one.

Limitation: the detection happens on the next 500 ms tick, so a very short
suspend (under ~5 s) is treated as normal elapsed time.

## Two copies?

A second launch does not start a second scheduler. The single-instance plugin
forwards the launch to the running copy and simply shows its window. If you ever
suspect a stray process: `pgrep -a breathe`.

## Window size or position on niri

Breathe's windows are fixed-size (400×540 main, 780×600 settings) and niri
floats fixed-size windows. If you have a `window-rule` that forces everything
tiled, add an exception:

```kdl
window-rule {
    match app-id=r#"^breathe$"#
    open-floating true
}
```

## Development problems

- `npm run tauri dev` shows a blank window: the Vite dev server must be on
  `http://localhost:1420` (the dev CSP allows exactly that origin).
- Inline scripts are blocked by the CSP; the first-paint theme hint lives in
  `public/boot-theme.js`.
- `npm run dev` alone runs against the mock backend and cannot send real
  notifications — that is expected.
