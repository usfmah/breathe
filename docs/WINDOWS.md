# Windows notes

Breathe targets **Windows 10 and Windows 11, x64**. The Windows build is an NSIS
installer named `Breathe_<version>_x64-setup.exe`.

## What the CI workflow covers

The Windows job does the following; the first run on 2026-10-19 passed every
step on `windows-2022`:

- compile the Rust code and run the Rust tests for the
  `x86_64-pc-windows-msvc` target on `windows-2022`;
- run the frontend tests and type check on the same runner;
- build the NSIS installer with the expected filename;
- silently install the app, check that
  `%LOCALAPPDATA%\Breathe\breathe.exe`, `uninstall.exe` and the Start Menu
  shortcut exist, add a simulated per-user autostart value, then silently
  uninstall it and check the binary, shortcut, uninstaller and Run value are
  gone.

These are CI checks, not a Windows 10/11 hardware test. **Not verified on real
Windows hardware yet:** toast delivery and attribution, tray interaction,
autostart after a reboot, DPI scaling, multi-monitor behaviour, and interactive
uninstaller cleanup (including the delete-app-data option). A successful build
or a CI install test is not proof that those runtime behaviours work. Use the checklist below before
claiming Windows support is complete.

## Install

1. Download `Breathe_<version>_x64-setup.exe`.
2. Run it as your normal user. The installer uses `currentUser` mode, so it does
   not require administrator rights.
3. The default install directory is:

   ```text
   %LOCALAPPDATA%\Breathe
   ```

4. A Start Menu shortcut is created at:

   ```text
   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Breathe.lnk
   ```

5. Launch Breathe from the Start Menu. The installer can also launch it after a
   normal interactive install.

### WebView2

Breathe uses the system WebView2 runtime. The installer is configured with
Tauri's `downloadBootstrapper` mode:

- If WebView2 is already installed, nothing is downloaded.
- If it is missing, the installer downloads Microsoft's bootstrapper and runs it
  silently. **The first install therefore needs an internet connection** on a
  machine without WebView2.
- If the machine is offline and WebView2 is missing, install the Evergreen
  WebView2 Runtime first, then rerun the Breathe installer.

### SmartScreen and signing

The installer is **not code-signed**. Windows SmartScreen may show "Windows
protected your PC" or an "Unknown publisher" warning. Choose *More info* →
*Run anyway* only if you trust the download source. There is no auto-updater and
no signing key configured in this repository.

### Visual C++ runtime

The installer bundles the Visual C++ runtime DLLs (`bundleVCRuntime: true`), so a
separate Visual C++ Redistributable install is not normally required.

## Notifications

Reminders are delivered through `tauri-plugin-notification`, which uses the
native Windows toast API.

- Installed builds get a proper application identity. The NSIS shortcut is
  tagged with the app's identifier (`dev.breathe.app`) so toasts are attributed
  to Breathe.
- Development builds run from `src-tauri/target/debug` or
  `src-tauri/target/release` may **not** have the proper toast identity. Test
  notification attribution with an installed build, not `tauri dev`.
- Focus Assist / Do Not Disturb, notification permissions, and per-app
  notification settings can suppress toasts. Check Settings → System →
  Notifications.
- Settings → Reminders → *Send test notification* performs a real delivery and
  reports an error if the plugin rejects the message. Windows can still suppress
  a toast through Focus Assist or notification settings without returning an
  error, so the test is not a guarantee that the toast was visibly shown.
- Breathe never creates a blocking full-screen window; reminders are ordinary
  notifications.

## Tray

Breathe uses Tauri's tray icon on Windows. The menu is shown on left click as
well as right click. Menu actions are the same as on Linux: open, pause/resume,
snooze (if enabled), settings, and quit.

Windows 11 hides new tray icons in the overflow area by default. If you do not
see the icon, open the tray overflow or enable Breathe in Settings →
Personalisation → Taskbar → Other system tray icons.

Closing the window hides it; the scheduler keeps running. Quit from the tray
menu or Settings → About.

## Starting with Windows

Settings → Startup → *Start with user session* writes a per-user value under:

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
```

The value launches Breathe with `--autostart`, which starts it hidden.
No administrator rights are required.

To remove it manually:

```powershell
Remove-ItemProperty `
  -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
  -Name 'Breathe' `
  -ErrorAction SilentlyContinue
```

The NSIS uninstaller removes the application files, its shortcut, and the
per-user `Breathe` Run value when it is not performing an in-place update. If you
remove the install directory by hand instead of running the uninstaller, remove
the value with the command above.

## Settings and data

| What | Path |
| --- | --- |
| Settings | `%APPDATA%\dev.breathe.app\settings.json` |
| WebView data | `%LOCALAPPDATA%\dev.breathe.app\` |
| Installed app | `%LOCALAPPDATA%\Breathe\` |
| Uninstaller | `%LOCALAPPDATA%\Breathe\uninstall.exe` |

The identifier remains `dev.breathe.app` on both platforms so settings keep the
same shape and the Linux path does not change.

## Build from source on Windows

### Prerequisites

- Windows 10/11 x64.
- Node.js 24 and npm.
- Rust 1.96.0 with the MSVC toolchain
  (`x86_64-pc-windows-msvc`).
- Visual Studio 2022 Build Tools with the **Desktop development with C++**
  workload (MSVC, Windows SDK, CMake tools).
- WebView2 Runtime (for running the app; the installed build can fetch it).
- Git.

### Commands

```powershell
npm ci
npm run typecheck
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles nsis -- --locked
```

The final `-- --locked` is forwarded by the Tauri CLI to Cargo. The same command
is used in the Windows CI and release jobs.

The installer is written to:

```text
src-tauri\target\release\bundle\nsis\Breathe_<version>_x64-setup.exe
```

Tauri downloads NSIS automatically during the first NSIS bundle; no separate
WiX or NSIS installation is required. `npm run tauri dev` runs the development
app.

The Windows bundle settings live in
`src-tauri/tauri.windows.conf.json`; the common settings are in
`src-tauri/tauri.conf.json`.

## Manual verification checklist

Run this on a clean Windows 10 and a clean Windows 11 machine or VM without
Node.js, Rust, npm or Cargo installed:

- [ ] The installer runs as a normal user without an administrator prompt.
- [ ] SmartScreen behaviour is understood and documented for the unsigned
      installer.
- [ ] A Start Menu shortcut appears and launches Breathe.
- [ ] The main window opens and the countdown runs.
- [ ] Closing the window hides it and the scheduler keeps running.
- [ ] The tray icon appears (including the Windows 11 overflow).
- [ ] Tray menu actions work: open, pause/resume, snooze, settings, quit.
- [ ] A due reminder produces a toast attributed to Breathe.
- [ ] Focus Assist / Do Not Disturb correctly suppresses or allows toasts.
- [ ] Settings → Reminders → *Send test notification* works and reports errors.
- [ ] The settings path is `%APPDATA%\dev.breathe.app\settings.json` and
      settings survive a restart.
- [ ] "Start with user session" creates the Run value and starts Breathe hidden
      after a reboot.
- [ ] Turning autostart off removes the Run value.
- [ ] Uninstall removes the app files, uninstaller, Start Menu shortcut and the
      per-user `Breathe` Run value if autostart was enabled.
- [ ] DPI scaling and multiple monitors behave correctly.
- [ ] An offline machine without WebView2 shows the expected installer
      limitation, and an online machine can fetch it.
- [ ] No Node.js, Rust, npm or Cargo is required on the target machine.

## Known Windows limitations

- No code signing, auto-update, or crash reporting.
- Toast identity only works properly for installed builds.
- Focus Assist can silently suppress reminders.
- Deleting the install directory instead of running the uninstaller can leave
  the per-user autostart Run value behind.
- The suspend/resume heuristic is shared with Linux and has the same short-
  suspend limitation.
- The Windows CI runner is Windows Server 2022, not a Windows 10/11 desktop;
  real-hardware behaviour still needs the checklist above.
