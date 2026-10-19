# Linux packaging

Breathe publishes four Linux-oriented artifacts:

| Artifact | Format | Intended use |
| --- | --- | --- |
| Fedora RPM | `Breathe-<version>-1.x86_64.rpm` | Fedora and compatible RPM distributions |
| Debian/Ubuntu DEB | `Breathe_<version>_amd64.deb` | Debian and Ubuntu |
| AppImage | `Breathe_<version>_amd64.AppImage` | Portable single-file tryout |
| AUR package | `Breathe-<version>-aur.tar.gz` | Arch Linux source build |

They are all produced from the same Rust binary and frontend. The native RPM
and DEB are the recommended packages; the AppImage is a convenience artifact.

## What is actually tested

| Check | Where it runs | Status |
| --- | --- | --- |
| Linux package builds (RPM/DEB/AppImage) | GitHub Actions CI, `ubuntu-22.04` | Passed on 2026-10-19 |
| RPM install and launch (Fedora 44 build) | Fedora 44 container under Xvfb | Passed during packaging work |
| DEB install and launch (Ubuntu 22.04 build) | Ubuntu 22.04, Ubuntu 24.04 and Debian 12 containers under Xvfb | Passed during packaging work |
| DEB install and launch (Fedora 44 build) | Ubuntu 24.04 and Debian 12 containers under Xvfb | Passed on Ubuntu 24.04; fails on Debian 12 with a `GLIBC_2.39` symbol error, as expected for a newer build host |
| AppImage launch (Ubuntu 22.04 build) | Ubuntu 22.04, Ubuntu 24.04 and Fedora 44 containers under Xvfb | Passed during packaging work |
| RPM install, dependency resolution and launch | GitHub Actions release workflow, `fedora:44` container under Xvfb | Configured; not run yet (tag-only) |
| DEB install, dependency resolution and launch | GitHub Actions release workflow, `ubuntu:24.04` and `debian:12` containers under Xvfb | Configured; not run yet (tag-only) |
| AppImage launch | GitHub Actions release workflow, Ubuntu 24.04 and Fedora 44 under Xvfb | Configured; not run yet (tag-only) |
| AUR metadata (`makepkg --printsrcinfo`) | GitHub Actions CI, `archlinux:base-devel` container | Passed on 2026-10-19 |
| AUR full build/install (`makepkg -si`) | Arch Linux | **Not yet performed here** |
| Fedora Workstation GNOME / KDE | Real desktop | Not individually re-verified for this release |

The oldest Fedora actually tested is **Fedora 44**. The oldest Ubuntu runtime
tested is **Ubuntu 22.04** (glibc 2.35); the Ubuntu 22.04 build also launched on
Debian 12 (2.36), Ubuntu 24.04 (2.39) and Fedora 44 (2.43). The release packages
are built on **Ubuntu 22.04**, which sets the documented glibc floor of **2.35**.
A local Ubuntu 22.04 build referenced GLIBC symbols up to 2.34, but 2.35 remains
the conservative documented floor because the build image and bundled AppImage
libraries can change. Do not claim support for an older distribution solely
because the glibc version is high enough: WebKitGTK 4.1, GTK 3, librsvg and
libappindicator must also be available.

The workflows deliberately pin `ubuntu-22.04` for that glibc floor. GitHub's
`ubuntu-22.04` runner image is on a deprecation path; when it is retired, move to
the oldest available image and re-evaluate the supported distributions rather
than silently raising the glibc requirement.

## Build dependencies

### Fedora

```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  openssl-devel \
  libxdo-devel \
  rpm-build \
  @development-tools

# Node.js 24, npm and Rust 1.96.0 are also required.
```

`libxdo-devel` is only needed if global-shortcut support is added later; it is
listed here to match the CI dependency set.

### Debian / Ubuntu build host

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libappindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  libxdo-dev \
  libglib2.0-bin \
  libgtk-3-bin \
  libfuse2 \
  patchelf \
  rpm \
  binutils \
  file \
  wget \
  desktop-file-utils

# Node.js 24 and Rust 1.96.0 are also required.
```

`libfuse2` and `patchelf` are AppImage-bundling tools; `rpm` is needed to write
the RPM; `libglib2.0-bin`/`libgtk-3-bin` provide helpers used by the GTK
AppImage plugin.

### Arch build dependencies (AUR)

The PKGBUILD declares these:

```text
depends:     webkit2gtk-4.1 gtk3 libappindicator librsvg glibc gcc-libs
makedepends: rust cargo nodejs npm pkgconf git
```

`base-devel` is assumed. The package builds from source, so the build machine
needs the Rust and Node toolchains; the installed package does not.

## Build commands

```bash
npm ci

# All three Linux bundles in one run
npm run tauri build -- --bundles rpm,deb,appimage

# Or select one
npm run tauri build -- --bundles rpm
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles appimage
```

Outputs:

```text
src-tauri/target/release/bundle/rpm/Breathe-0.1.0-1.x86_64.rpm
src-tauri/target/release/bundle/deb/Breathe_0.1.0_amd64.deb
src-tauri/target/release/bundle/appimage/Breathe_0.1.0_amd64.AppImage
```

The platform-specific bundle metadata lives in
`src-tauri/tauri.linux.conf.json`; the common config is
`src-tauri/tauri.conf.json`.

## RPM

### Runtime dependencies

```text
webkit2gtk4.1
gtk3
libappindicator-gtk3
librsvg2
glibc
libgcc
libstdc++
```

The bundler also records the shared-library requirements it detects
(`libwebkit2gtk-4.1.so.0`, `libgtk-3.so.0`, `libappindicator3.so.1`).

### Install

```bash
sudo dnf install ./Breathe-0.1.0-1.x86_64.rpm
breathe
```

No development packages are required on the user's machine.

### Inspect

```bash
rpm -qip Breathe-0.1.0-1.x86_64.rpm
rpm -qpR Breathe-0.1.0-1.x86_64.rpm
rpm -qpl Breathe-0.1.0-1.x86_64.rpm
```

The package installs `/usr/bin/breathe`, a desktop entry at
`/usr/share/applications/Breathe.desktop`, and hicolor icons at 32, 128, 256 and
512 px.

## DEB

### Runtime dependencies

```text
libwebkit2gtk-4.1-0
libgtk-3-0
libappindicator3-1
librsvg2-2
libc6
libgcc-s1
libstdc++6
```

Ubuntu 24.04 and Debian 13 use the `t64` transition for several libraries.
`libgtk-3-0` remains resolvable there (normally through the `t64` package's
provide/transition), and `libappindicator3-1` is available in Ubuntu 24.04 and
Debian 12/13. The package was installed successfully on Ubuntu 24.04 and Debian
12 during this work.

The **local Fedora-built** DEB carries a glibc 2.39 symbol requirement: it
launched on Ubuntu 24.04 but not on Debian 12 (glibc 2.36). The release DEB is
built on Ubuntu 22.04, so it has a 2.35 floor; the release workflow installs and
launches that artifact on both Ubuntu 24.04 and Debian 12.

### Install

```bash
sudo apt install ./Breathe_0.1.0_amd64.deb
breathe
```

### Inspect without installing

```bash
dpkg-deb -I Breathe_0.1.0_amd64.deb
dpkg-deb -c Breathe_0.1.0_amd64.deb
```

The DEB installs `/usr/bin/breathe`, `Breathe.desktop`, and the same hicolor
icons as the RPM.

## AppImage

### Why the build host matters

An AppImage does **not** bundle glibc. It inherits the glibc symbol versions of
the machine that built it. The release workflow builds on Ubuntu 22.04, so the
published AppImage requires **glibc 2.35 or newer**.

A local AppImage built on Fedora 44 requires a much newer glibc and will not run
on older distributions. This was observed directly: a Fedora-built AppImage
launched on Fedora 44 but failed on Ubuntu 24.04 with missing `GLIBC_2.43`
symbols. Do not publish a locally built artifact as if it were the release
AppImage.

### What it bundles

The AppImage bundles the application, WebKitGTK 4.1, GTK 3, libappindicator and
many of their dependencies. It still expects base desktop libraries such as
glibc, fontconfig and fribidi to be present. A normal desktop has them; a bare
container does not.

### Run

```bash
chmod +x Breathe_0.1.0_amd64.AppImage
./Breathe_0.1.0_amd64.AppImage
```

If FUSE 2 is missing:

```bash
./Breathe_0.1.0_amd64.AppImage --appimage-extract-and-run
```

On Fedora, the FUSE 2 compatibility package is typically `fuse-libs`/`fuse`;
on Debian/Ubuntu it is `libfuse2` (or `libfuse2t64` on newer releases). The
extraction fallback avoids the FUSE dependency entirely.

### Limitations

- Not a universal Linux binary: glibc 2.35+ and base desktop libraries are
  required.
- The AppImage does not install a desktop entry, icons, or an autostart entry.
- Notifications and the tray still depend on the running desktop services.
- Use the RPM or DEB if you want a normal system installation and package
  upgrades.

## AUR / Arch Linux

The AUR package is a **source** package named `breathe`. It builds the frontend
with `npm ci && npm run build`, builds the Rust binary with
`cargo build --release`, then installs:

```text
/usr/bin/breathe
/usr/share/applications/Breathe.desktop
/usr/share/icons/hicolor/{32x32,128x128,256x256,512x512}/apps/breathe.png
/usr/share/licenses/breathe/LICENSE
```

The release workflow publishes `Breathe-<version>-aur.tar.gz` containing a
`PKGBUILD` and `.SRCINFO` whose checksum is pinned to the release's
`Breathe-<version>-source.tar.gz`. The repository copy under `packaging/aur/`
is the template and uses `sha256sums=('SKIP')` deliberately; the release copy is
the one to submit to the AUR.

Install from the release tarball:

```bash
mkdir breathe-aur
tar -xzf Breathe-0.1.0-aur.tar.gz -C breathe-aur
cd breathe-aur
makepkg -si
```

The workflow does **not** push to the AUR (that would require AUR credentials).
See [`RELEASE.md`](RELEASE.md) for the manual AUR submission step.

## Linux notifications, tray and autostart

Packaging does not remove the desktop-service requirements:

- Reminders need an `org.freedesktop.Notifications` service. Fedora Workstation
  and mainstream desktops provide one. Minimal niri/sway setups need
  `swaync`, `dunst`, `mako`, or similar.
- The tray icon needs a StatusNotifierItem host. Without one, the app still
  runs; only the tray menu is unavailable.
- "Start with user session" writes
  `~/.config/autostart/Breathe.desktop`. Sessions that never read XDG autostart
  entries will ignore it; the Startup panel detects the common niri case and
  suggests a compositor startup line.
- Removing the RPM or DEB does not delete that per-user autostart file. Turn the
  switch off before uninstalling, or delete the file manually.

See [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) for diagnostics.
