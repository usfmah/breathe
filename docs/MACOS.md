# macOS notes

Breathe builds for **macOS 11 (Big Sur) and later** as a universal app
(Apple silicon and Intel), packaged as `Breathe.app` inside a `.dmg`.

> **Status: tested on a Mac.** The macOS code uses only public Apple APIs and
> every item in the checklist at the end has been checked on real hardware.
> An early build panicked during setup because some bundle icons were 16-bit
> PNGs; that is fixed and `npm run check:icons` now guards it in CI.
> Releases after 0.2.0 include `Breathe_<version>_universal.dmg`, built,
> verified and launch-tested by the release workflow; for 0.2.0, use the DMG
> from a successful CI run or build from source. The app is not yet signed or
> notarized (see below).

## What is implemented

| Area | Implementation | Verified |
| --- | --- | --- |
| Build & package | `tauri.macos.conf.json`: `.app` + `.dmg`, minimum macOS 11, `icon.icns` | CI builds a universal DMG and checks architectures, `LSMinimumSystemVersion` and the icons; DMG installed and launched on a Mac |
| Lint & tests | Clippy `-D warnings`, Rust and frontend tests on `macos-15` | CI |
| Quit | ⌘Q from the default app menu stops the scheduler cleanly (`RunEvent::Exit`) | Tested on a Mac |
| Dock icon | Clicking it while the window is hidden brings the window back (`RunEvent::Reopen`) | Tested on a Mac |
| Start at login | Per-user LaunchAgent `~/Library/LaunchAgents/Breathe.plist` via `tauri-plugin-autostart` | Tested on a Mac |
| Menu bar | Monochrome template icon; **live countdown** (`MM:SS`) next to it, "Break" while a reminder waits, nothing when paused | `menu_bar_title` unit-tested on every platform; tested on a Mac |
| Reminder popup | Non-activating `orderFrontRegardless`, floating level, all Spaces incl. full screen, top-right of the work area, rounded window with system shadow | Tested on a Mac |
| Sound | Web Audio chime in the popup (WKWebView autoplay is enabled by wry) | Tested on a Mac |
| Arabic / RTL | Same webview UI as Linux/Windows; Arabic fonts bundled | Tested on a Mac |
| Sleep/wake | `Instant` uses `CLOCK_UPTIME_RAW` on macOS, which stops during sleep, so the existing suspend detection applies | Tested on a Mac |

No private or undocumented API is used. In particular Tauri's
`macos-private-api` feature is **not** enabled: transparent webviews need it,
so the popup is rounded through its window layer instead.

## Installing an unsigned build

There is no Developer ID certificate yet, so the app is only ad-hoc signed and
Gatekeeper blocks the first launch. On macOS 15 and later the old Control-click
bypass is gone:

1. Open the DMG and drag Breathe to Applications.
2. Launch it once; macOS refuses.
3. Open **System Settings → Privacy & Security**, scroll to the Breathe message
   and choose **Open Anyway**, then confirm.

Signing with a Developer ID and notarizing the DMG (hardened runtime,
`notarytool`) will remove these steps; it needs an Apple Developer Program
membership and is not set up yet.

## Live Activities and the notch

* **ActivityKit on macOS** is listed by Apple as **macOS 27.3, beta**. Using it
  would need a separate WidgetKit extension target that Tauri's bundler cannot
  build, a team-signed build, and a minimum OS that almost nobody runs yet.
  Deferred until 27.3 is released and can be tried on hardware.
* **Menu bar countdown** (above) is the supported, always-visible timer on
  every Mac, with or without a notch.
* **Notch-adjacent pill** (a small non-activating panel beside the notch, found
  with `NSScreen.safeAreaInsets` / `auxiliaryTopLeftArea`) is possible with
  public APIs but needs a notched Mac to get right; it is a later step.

## Verification checklist (real Mac, done)

- [x] DMG opens; app launches after "Open Anyway"; Dock icon and menu bar icon appear.
- [x] Menu bar shows the countdown, updates every second, tints correctly in light and dark menu bars.
- [x] Reminder popup appears top-right **without taking focus** from a text editor; buttons work (note whether the first click only activates).
- [x] Popup corners are rounded with a shadow; it shows over a full-screen app and on every Space.
- [x] Chime plays.
- [x] Break / snooze / automatic restart after the break.
- [x] ⌘Q quits; closing the window hides it; clicking the Dock icon restores it.
- [x] Start at login creates and removes the LaunchAgent and works after a restart.
- [x] Sleep across a deadline: no burst of reminders on wake.
- [x] Arabic: RTL layout and phrases render correctly.
