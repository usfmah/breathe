# Troubleshooting

Breathe is a normal desktop application. On Linux it talks to
`org.freedesktop.Notifications` for reminders and to
`org.kde.StatusNotifierWatcher` for its tray icon; almost every problem on a
minimal Wayland setup is one of those two services missing, not Breathe itself.
On Windows it uses the native toast API and the notification area. Package and
AppImage problems are covered separately below.

The Linux examples use Fedora and niri. The same D-Bus checks apply to other
distributions; substitute your package manager and notification daemon.

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

## Packages and AppImage

### RPM will not install

Install the local file with dependency resolution, not `rpm -i`:

```bash
sudo dnf install ./Breathe-0.1.0-1.x86_64.rpm
```

If a dependency is reported, inspect what the package asks for:

```bash
rpm -qpR Breathe-0.1.0-1.x86_64.rpm
dnf repoquery --whatprovides 'libwebkit2gtk-4.1.so.0()(64bit)'
```

The RPM expects Fedora package names (`webkit2gtk4.1`, `gtk3`,
`libappindicator-gtk3`, `librsvg2`, `glibc`, `libgcc`, `libstdc++`). The oldest
Fedora actually tested is Fedora 44.

### DEB will not install

```bash
sudo apt install ./Breathe_0.1.0_amd64.deb
```

Inspect the control metadata without installing:

```bash
dpkg-deb -I Breathe_0.1.0_amd64.deb
```

The package declares `libwebkit2gtk-4.1-0`, `libgtk-3-0`,
`libappindicator3-1`, `librsvg2-2`, `libc6`, `libgcc-s1` and `libstdc++6`.
An Ubuntu 22.04-built DEB installed and launched on Ubuntu 22.04, Ubuntu 24.04
and Debian 12 during this work. The local Fedora-built DEB launches on Ubuntu
24.04 but fails on Debian 12 because its binary needs glibc 2.39; the Ubuntu
22.04 release build targets glibc 2.35.

### AppImage says FUSE is missing

Install FUSE 2, or bypass it:

```bash
./Breathe_0.1.0_amd64.AppImage --appimage-extract-and-run
```

On Debian/Ubuntu the package may be `libfuse2` or `libfuse2t64`; on Fedora look
for the FUSE 2 compatibility package.

### AppImage fails with a GLIBC error

The AppImage does not bundle glibc. The published AppImage is built on Ubuntu
22.04 and needs **glibc 2.35 or newer**. An AppImage built locally on a newer
distribution needs a glibc at least as new as that build host. Use the RPM/DEB,
or rebuild on an older base.

### AppImage fails on a minimal container

The AppImage bundles WebKitGTK/GTK and the app, but still expects base desktop
libraries such as fontconfig and fribidi. Install the normal GTK/WebKit runtime
packages, or use a normal desktop. This is not a fully static container.

### AUR build fails

Use the AUR tarball from the release page, not the `SKIP`-checksum template in
the repository:

```bash
mkdir breathe-aur
tar -xzf Breathe-0.1.0-aur.tar.gz -C breathe-aur
cd breathe-aur
makepkg -si
```

Make sure `base-devel`, `rust`, `cargo`, `nodejs`, `npm`, `pkgconf`,
`webkit2gtk-4.1`, `gtk3`, `libappindicator` and `librsvg` are installed. A full
`makepkg` build on Arch has not yet been exercised in this environment; report a
failure with the full `makepkg` output and the Arch version.

## Windows

### No toast notification appears

1. Open **Settings → System → Notifications** and make sure notifications are
   enabled for Breathe.
2. Turn off **Focus Assist / Do Not Disturb**, or allow Breathe through it.
3. Use **Settings → Reminders → Send test notification**. It performs a real
   delivery and reports an error if the plugin rejects the message. Focus Assist
   can still suppress the toast without returning an error.
4. Test with an **installed** build. Development runs from
   `target/debug`/`target/release` may not get the proper toast identity.
5. Breathe is not a full-screen blocker and does not force a window on top;
   check the notification centre if the toast disappeared quickly.

### Tray icon is missing

Windows 11 hides new tray icons in the overflow area. Open the overflow, or
enable Breathe under **Settings → Personalisation → Taskbar → Other system tray
icons**. The tray menu can also be reached by right-clicking the icon.

### Breathe does not start with Windows

- Check Settings → Startup → *Start with user session*.
- Inspect the per-user Run value:

  ```powershell
  Get-ItemProperty `
    -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
    -Name 'Breathe'
  ```

- Task Manager → Startup apps should list Breathe.
- The entry starts the app with `--autostart`, which keeps it hidden. Look in
  the notification area rather than expecting a window.

### Autostart entry after a manual removal

The NSIS uninstaller removes the `Breathe` Run value when it is not performing an
in-place update. If you deleted the install directory by hand, remove a leftover
value with:

```powershell
Remove-ItemProperty `
  -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
  -Name 'Breathe' `
  -ErrorAction SilentlyContinue
```

### WebView2 is missing or the installer is offline

The installer uses Tauri's `downloadBootstrapper` mode, so it needs an internet
connection if WebView2 is not already installed. On an offline machine, install
the Microsoft Evergreen WebView2 Runtime first, then rerun the Breathe
installer.

### SmartScreen warns about an unknown publisher

The installer is not code-signed. Verify the download source, then use
*More info → Run anyway* if you trust it. There is no auto-updater and no
signing key in this repository.

## Manual verification still required

Package builds and CI smoke tests do not cover the full desktop experience:

- Windows toast delivery, tray interaction, autostart after reboot, DPI and
  multi-monitor behaviour: see [`WINDOWS.md`](WINDOWS.md).
- Fedora Workstation GNOME/KDE, Ubuntu desktop, and Arch AUR installation on a
  real desktop.
- AppImage launch on each distribution and FUSE/no-FUSE paths.
- Linux notification daemon and StatusNotifier host combinations.

Do not claim universal Linux or Windows compatibility from a successful build.

## Development problems

- `npm run tauri dev` shows a blank window: the Vite dev server must be on
  `http://localhost:1420` (the dev CSP allows exactly that origin).
- Inline scripts are blocked by the CSP; the first-paint theme hint lives in
  `public/boot-theme.js`.
- `npm run dev` alone runs against the mock backend and cannot send real
  notifications — that is expected.
- `cargo test` needs `dist/` to exist because of `tauri::generate_context!`; run
  `npm run build` first.
- Windows CI uses `x86_64-pc-windows-msvc`; a GNU toolchain is not supported by
  this build setup.
- The Linux build expects `libappindicator3-dev`; the app dynamically loads
  `libayatana-appindicator3.so.1` first and falls back to
  `libappindicator3.so.1` at runtime.
