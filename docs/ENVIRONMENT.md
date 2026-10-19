# Environment audit — Stage A

Recorded by inspecting the build machine directly. Re-run the commands below if the
host changes; do not assume these results on another machine.

## Host

| Item | Observed value |
| --- | --- |
| Distribution | Fedora Linux 44 (KDE Plasma Desktop Edition spin data, but the session runs niri) |
| Kernel session | Wayland (`XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-1`) |
| Compositor | niri 26.04 (`niri --version` → `niri 26.04 (8ed0da4)`) |
| `XDG_CURRENT_DESKTOP` | `niri` |
| Display | DP-1, 1920×1080 @ 60 Hz, scale 1 |
| Notification daemon | `swaync` owns `org.freedesktop.Notifications` on the session bus |
| Status bar | `waybar` v0.15.0, `tray` module enabled, owns `org.kde.StatusNotifierWatcher` |
| Autostart path used by this host | niri `spawn-at-startup` / `spawn-sh-at-startup` in `~/.config/niri/config.kdl` |
| Rounded corners | niri global `window-rule { geometry-corner-radius 6 }` |

## Toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | v24.21.0 | via nvm; Vite 8 needs ≥ 20.19 |
| npm | 12.2.0 | also `pnpm 12.8.1`, `yarn` present |
| rustc | 1.96.0 (Fedora) | Tauri 2.12 requires ≥ 1.90 |
| cargo | 1.96.0 (Fedora) | **`rustup` is not installed** — use the distro toolchain |
| rpmbuild / rpm | present | RPM bundling is possible on this host |
| `git` | present | used for source control and audit reproducibility |

## Native libraries (verified with `pkg-config`)

| Library | `pkg-config` name | Version |
| --- | --- | --- |
| GTK 3 | `gtk+-3.0` | 3.24.52 |
| WebKitGTK | `webkit2gtk-4.1` | 2.54.1 |
| JavaScriptCoreGTK | `javascriptcoregtk-4.1` | 2.54.1 |
| libsoup | `libsoup-3.0` | 3.6.6 |
| AppIndicator (tray) | `appindicator3-0.1` | 12.10.0 |
| librsvg | `librsvg-2.0` | 2.62.4 |
| OpenSSL | `openssl` | 3.5.7 |

Runtime check for the tray backend (Tauri dlopens this, it is not link-time):

```sh
ldconfig -p | grep appindicator      # → libappindicator3.so.1
rpm -qf /usr/lib64/libappindicator3.so.1   # → libappindicator-gtk3-12.10.1
```

## What was already installed vs. added

Everything required was already present on this host. The only things the build
added were the project-local Node packages and Cargo crates. On a fresh Fedora 44
box, install:

```sh
# Rust toolchain (distro package is fine, no rustup required)
sudo dnf install cargo rust

# Build dependencies for Tauri 2 on Fedora
sudo dnf install \
  webkit2gtk4.1-devel \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  openssl-devel \
  libxdo-devel \
  rpm-build \
  @development-tools
```

`@development-tools` provides `gcc`, `make` and friends. `libxdo-devel` is only
needed if you later add global-shortcut support.

## Availability checks that matter for this app

```sh
# Notification service (must return a name; empty output = no daemon)
gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
  --method org.freedesktop.DBus.ListNames | tr ',' '\n' | grep Notifications

# Tray host (StatusNotifierWatcher). Empty = no bar will show the icon.
busctl --user list | grep -i statusnotifier
```

Both succeeded on this host, so notification delivery and tray integration can be
verified for real rather than assumed.

## Scope and CI build hosts

This audit covers the **Linux development host** only. It does not prove
anything about Windows, GNOME, KDE, Debian/Ubuntu desktops, or Arch Linux.

The release/CI packaging matrix is separate:

| Target | Runner / container |
| --- | --- |
| Linux RPM/DEB/AppImage build | `ubuntu-22.04` GitHub runner (glibc 2.35 floor; deprecation began 2026-09-17, retirement 2027-04-17) |
| Website build and Pages deployment | `ubuntu-24.04` GitHub runner; does not affect the app glibc floor |
| RPM install smoke test | `fedora:44` container |
| DEB install smoke test | `ubuntu:24.04` and `debian:12` containers |
| AppImage launch smoke test | `ubuntu:24.04` and `fedora:44` containers under Xvfb |
| AUR metadata validation | `archlinux:base-devel` container |
| Windows NSIS build and install smoke test | `windows-2022` GitHub runner |

A locally built AppImage on Fedora 44 is **not** the release AppImage: it
inherits Fedora's newer glibc and will not run on older distributions. See
[`LINUX_PACKAGING.md`](LINUX_PACKAGING.md).
