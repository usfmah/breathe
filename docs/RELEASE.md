# Release process

Breathe has three separate automation paths:

| Workflow | Trigger | Publishes? |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | Push to `main`, pull request, manual dispatch | No |
| [`release.yml`](../.github/workflows/release.yml) | Push of a tag matching `v*` | Yes |
| [`pages.yml`](../.github/workflows/pages.yml) | Push to `main`, manual dispatch | Deploys the website only |

Pushing to `main` never creates a GitHub Release. Only a tag does. The release
workflow does not deploy the website, and the Pages workflow does not publish a
release.

GitHub Pages must be enabled by the repository owner with **Settings → Pages →
Source: GitHub Actions** before the first website deployment. The workflow's
`GITHUB_TOKEN` cannot change that repository setting. See
[`WEBSITE.md`](WEBSITE.md).

## Version sources

The application version must match in all of these files:

```text
package.json
package-lock.json             # root and packages[""] version
src-tauri/tauri.conf.json
src-tauri/Cargo.toml          # [package] version only
```

The lockfile's root version must match too; update it with npm:

```bash
npm install --package-lock-only --ignore-scripts
```

Check consistency at any time:

```bash
npm run check:version

# Also require a specific release tag, e.g. v0.1.0
node scripts/check-version.mjs v0.1.0
```

The release workflow runs the tag check before building. A mismatch fails before
any artifact is published.

## Bump and tag

Start from a clean `main` whose CI run is green:

```bash
git switch main
git pull --ff-only
git status

# Edit the version in:
#   package.json
#   src-tauri/tauri.conf.json
#   src-tauri/Cargo.toml
npm install --package-lock-only --ignore-scripts
npm run check:version

git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "release: v0.1.0"
git push origin main
```

Wait for the `CI` workflow on `main` to pass. If the website changed, also wait
for the `Pages` workflow and verify the site; Pages must already be enabled as
described above. Then tag the exact commit that passed:

```bash
git tag -a v0.1.0 -m "Breathe v0.1.0"
git push origin v0.1.0
```

The tag push starts the release workflow. Use an annotated tag; the workflow
accepts the tag name `v<version>` and rejects a mismatch with `package.json`.

### If the release is wrong

Do not force-move a tag that has already produced a public release. The AUR
checksum and the source tarball are tied to the tag's tree. Publish a new patch
version instead:

```bash
# fix the issue on main, bump to the next patch, then:
git tag -a v0.1.1 -m "Breathe v0.1.1"
git push origin v0.1.1
```

If the workflow failed **before** creating the release, you may delete and
recreate the tag, but prefer a new patch version to avoid ambiguity.

## What the release workflow does

1. **Validate** — checks that `v<tag>` matches `package.json`.
2. **Linux** — on `ubuntu-22.04`:
   - installs Node 24 and Rust 1.96.0,
   - runs `npm ci`, frontend tests, type check, Rust tests with `--locked`,
   - builds RPM, DEB and AppImage with Cargo's `--locked` passed through the
     Tauri CLI,
   - verifies the exact filenames,
   - uploads each artifact.
3. **Windows** — on `windows-2022`:
   - runs the same tests with `--locked`,
   - builds the NSIS installer with Cargo's `--locked`,
   - silently installs, checks the binary/Start Menu shortcut/uninstaller, creates
     a simulated autostart Run value, and uninstalls while checking cleanup,
   - uploads the installer.
4. **Smoke tests** — installs and launches the tag-built RPM in a Fedora 44
   container, installs and launches the tag-built DEB in Ubuntu 24.04 and Debian
   12 containers, and launches the tag-built AppImage under Xvfb on Ubuntu 24.04
   and Fedora 44.
5. **Publish** — downloads every artifact, fails if any required file is missing,
   creates the source tarball, renders the AUR files with a real checksum,
   validates the rendered AUR metadata in an Arch container, creates or updates
   the GitHub Release, removes any unexpected stale release assets, and uploads
   exactly the six expected files.

The v0.1.0 workflow completed successfully on 2026-10-19 UTC. It published all
six expected assets. The live site detected v0.1.0 and the published asset URLs
returned HTTP 200. See the [release](https://github.com/usfmah/breathe/releases/tag/v0.1.0)
and [workflow run](https://github.com/usfmah/breathe/actions/runs/39341987369).

The publish job requests `contents: write`; every other job has read-only
permissions. The workflow uses `GITHUB_TOKEN`, not a personal access token. No
repository secret is required.

### Idempotent reruns

The publish job checks whether the release already exists:

- first run: `gh release create --verify-tag`
- rerun: `gh release edit`, then `gh release upload --clobber`

Re-running a failed release run is designed not to create duplicate releases.
It also removes release assets whose names are not in the six expected filenames
and uploads the expected files with `--clobber`. It does rewrite assets, so a
force-moved tag would change the source tarball and AUR checksum; avoid moving
published tags.

## Artifacts

A successful release attaches these stable filenames:

```text
Breathe-<version>-1.x86_64.rpm
Breathe_<version>_amd64.deb
Breathe_<version>_amd64.AppImage
Breathe_<version>_x64-setup.exe
Breathe-<version>-source.tar.gz
Breathe-<version>-aur.tar.gz
```

- Release assets: the repository's **Releases** page.
- Per-run build artifacts: the **Actions** run page, retained for 7 days.
- The source tarball is generated with `git archive` from the tag and is what the
  AUR PKGBUILD downloads.
- The AUR tarball contains `PKGBUILD` and `.SRCINFO` with a pinned SHA-256.

The release notes include Fedora, Debian/Ubuntu, AppImage, Arch and Windows
install commands and the known limitations.

## AUR submission

The workflow does **not** publish to the AUR; that requires an AUR account and an
SSH key. After a release:

```bash
git clone ssh://aur@aur.archlinux.org/breathe.git aur-breathe
cd aur-breathe

mkdir -p /tmp/breathe-aur
tar -xzf /path/to/Breathe-0.1.0-aur.tar.gz -C /tmp/breathe-aur
cp /tmp/breathe-aur/PKGBUILD /tmp/breathe-aur/.SRCINFO .

git add PKGBUILD .SRCINFO
git commit -m "breathe 0.1.0-1"
git push
```

Before pushing, build it locally on Arch:

```bash
makepkg --printsrcinfo > .SRCINFO   # must match the checked-in file
makepkg -si
```

The repository template under `packaging/aur/` uses
`sha256sums=('SKIP')`; only the release-rendered copy is suitable for the AUR.

## Rerunning a failed workflow

From the Actions UI, use **Re-run failed jobs**, or:

```bash
gh run list --workflow=release.yml
gh run rerun <run-id> --failed
```

If the failure requires a code change, make the change on `main`, bump the
version, and create a new tag. Do not reuse a tag whose source has changed.

## Release and manual validation checklist

The first items were verified for v0.1.0. Automation does not replace a desktop:

- [x] `CI` is green on the release commit.
- [x] `npm run check:version v0.1.0` passes.
- [x] The `Pages` workflow is green and `https://usfmah.github.io/breathe/` serves the site over HTTPS.
- [x] The release workflow is green end to end.
- [x] The release workflow installed and launched Linux packages in its Fedora, Ubuntu and Debian containers, and passed the Windows Server installer/uninstaller smoke test.
- [x] All six assets are published with the filenames above; their public URLs return HTTP 200.
- [ ] Install the RPM on Fedora 44 and launch it.
- [ ] Install the DEB on Ubuntu 24.04 and Debian 12 and launch it.
- [ ] Run the AppImage on Ubuntu 24.04 and Fedora 44.
- [ ] Install the NSIS installer on Windows 10 x64 and Windows 11 x64.
- [ ] Run the Windows checklist in [`WINDOWS.md`](WINDOWS.md) (toasts, tray,
      autostart, DPI, uninstall).
- [ ] Run `makepkg -si` on Arch and launch the package.
- [ ] Submit the AUR files and confirm the AUR package builds.
- [x] The landing page detects v0.1.0 and enables the verified platform download.
- [ ] Check each platform selector in a browser and confirm it links the matching asset.
- [ ] Confirm a missing-asset/API-failure fallback still points to GitHub Releases
      rather than an unverified file.

## Signing and trust

- The Windows installer is **not code-signed**; SmartScreen may warn.
- The RPM and DEB are **not signed** with a repository key. Users install local
  files, so `dnf`/`apt` may ask for confirmation.
- No auto-update channel is configured.

If signing is added later, it must be a separate change with its own secret
management; do not put signing keys in a workflow triggered by pull requests.
