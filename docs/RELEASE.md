# Release process

Breathe has two separate automation paths:

| Workflow | Trigger | Publishes? |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | Push to `main`, pull request, manual dispatch | No |
| [`release.yml`](../.github/workflows/release.yml) | Push of a tag matching `v*` | Yes |

Pushing to `main` never creates a GitHub Release. Only a tag does.

## Version sources

The application version must match in all of these files:

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml          # [package] version only
```

The lockfile's root version should match too; it is updated by npm:

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

Wait for the `CI` workflow on `main` to pass. Then tag the exact commit that
passed:

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
   - runs `npm ci`, frontend tests, type check, Rust tests,
   - builds RPM, DEB and AppImage,
   - verifies the exact filenames,
   - uploads each artifact.
3. **Windows** — on `windows-2022`:
   - runs the same tests,
   - builds the NSIS installer,
   - silently installs, checks the binary/Start Menu shortcut/uninstaller, creates
     a simulated autostart Run value, and uninstalls while checking cleanup,
   - uploads the installer.
4. **Smoke tests** — installs and launches the RPM in a Fedora 44 container,
   installs and launches the DEB in Ubuntu 24.04 and Debian 12 containers, and
   launches the AppImage under Xvfb on Ubuntu 24.04 and Fedora 44.
5. **Publish** — downloads every artifact, fails if any required file is missing,
   creates the source tarball, renders the AUR files with a real checksum,
   validates the rendered AUR metadata in an Arch container, and creates or
   updates the GitHub Release.

The publish job requests `contents: write`; every other job has read-only
permissions. The workflow uses `GITHUB_TOKEN`, not a personal access token. No
repository secret is required.

### Idempotent reruns

The publish job checks whether the release already exists:

- first run: `gh release create --verify-tag`
- rerun: `gh release edit`, then `gh release upload --clobber`

Re-running a failed release run is designed not to create duplicate releases.
It does rewrite assets, so a force-moved tag would change the source tarball and
AUR checksum; avoid moving published tags.

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

## Manual validation checklist

Automation does not replace a desktop:

- [ ] `CI` is green on the release commit.
- [ ] `npm run check:version` passes.
- [ ] The release workflow is green end to end.
- [ ] Download every asset and confirm the filenames above.
- [ ] Install the RPM on Fedora 44 and launch it.
- [ ] Install the DEB on Ubuntu 24.04 and Debian 12 and launch it.
- [ ] Run the AppImage on Ubuntu 24.04 and Fedora 44.
- [ ] Install the NSIS installer on Windows 10 x64 and Windows 11 x64.
- [ ] Run the Windows checklist in [`WINDOWS.md`](WINDOWS.md) (toasts, tray,
      autostart, DPI, uninstall).
- [ ] Run `makepkg -si` on Arch and launch the package.
- [ ] Submit the AUR files and confirm the AUR package builds.

## Signing and trust

- The Windows installer is **not code-signed**; SmartScreen may warn.
- The RPM and DEB are **not signed** with a repository key. Users install local
  files, so `dnf`/`apt` may ask for confirmation.
- No auto-update channel is configured.

If signing is added later, it must be a separate change with its own secret
management; do not put signing keys in a workflow triggered by pull requests.
