# Website

The Breathe landing page is a static React + TypeScript site built with the
repository's existing Vite toolchain. It lives in `website/` so it does not
affect the Tauri app build.

- Intended URL: `https://usfmah.github.io/breathe/`
- Repository: `https://github.com/usfmah/breathe`
- Deployment workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
- Build output: `website/dist/`
- Base path: `/breathe/`

## Important: Pages must be enabled by the repository owner

The repository's Pages API currently returns **404 Not Found**, which means a
Pages site has not been enabled yet. The deployment workflow cannot make that
repository setting with the workflow's `GITHUB_TOKEN`; the official
`actions/configure-pages` action documents that its `enablement` option needs a
separate token with administration/pages permissions. This project deliberately
does not use a personal access token for deployment.

Before the first deployment, the owner must set:

1. GitHub repository → **Settings** → **Pages**
2. **Build and deployment** → **Source** → **GitHub Actions**
3. Re-run the `Pages` workflow (or push to `main`).

Until then, the `Pages` workflow may fail at the configure/upload step. The site
must not be described as live until `https://usfmah.github.io/breathe/` has been
fetched successfully over HTTPS.

## Local development

The website reuses the root `node_modules` and lockfile; it has no separate
package installation.

```bash
# Install the app + website toolchain once
npm ci

# Development server
npm run website:dev

# Production build + strict website type check
npm run website:build

# Verify /breathe/ base path, bundled assets, screenshots and 404 page
npm run website:check

# Preview the production build (Vite serves it under /breathe/)
npm run website:preview
```

The development URL is normally `http://localhost:5173/breathe/`. If the port is
occupied, Vite reports the actual URL.

The tests use the repository's Vitest setup:

```bash
npm test
```

`website/src/lib/release.test.ts` covers release metadata parsing, exact asset
selection, missing assets, untrusted URLs, empty releases, API failures and
fallback behavior. `website/src/lib/platform.test.ts` covers the OS hint and the
rule that Linux browsers are not assumed to identify a distribution.

## Base path and asset rules

`website/vite.config.ts` sets `base: "/breathe/"`. Vite writes asset URLs such as
`/breathe/assets/index-*.js`, and the public files are served from
`/breathe/images/` and `/breathe/favicon.png`.

`npm run website:check` fails if:

- the built `index.html` references `/assets/...` without `/breathe/`;
- an image, favicon, icon or internal asset reference is missing;
- the screenshots are absent or empty;
- `404.html` is missing or does not link back to `/breathe/`;
- the JavaScript or CSS bundle is absent.

If the repository moves to a custom domain or a user/organization Pages site,
change the Vite base, the 404 link, the Open Graph image URL, and the Pages
workflow together. Re-run the build and check before deploying.

## Release data

The page deliberately keeps release metadata out of the build. At runtime it
requests:

```text
https://api.github.com/repos/usfmah/breathe/releases/latest
```

GitHub's `/releases/latest` endpoint returns the latest published, non-draft,
non-prerelease release. The client also rejects draft/prerelease payloads that
slip through. No authentication is required, and no token is shipped to the
browser.

The expected assets are matched by exact filename:

```text
Breathe_<version>_x64-setup.exe
Breathe-<version>-1.x86_64.rpm
Breathe_<version>_amd64.deb
Breathe_<version>_amd64.AppImage
Breathe-<version>-source.tar.gz
Breathe-<version>-aur.tar.gz
```

An asset is only shown when:

- its name exactly matches the expected name for the release tag;
- its size is greater than zero;
- its state is absent or `uploaded`;
- its download URL is an HTTPS `github.com/usfmah/breathe/releases/download/...`
  URL whose tag and final filename match the release and asset.

A missing asset hides the download button and leaves the GitHub Releases
fallback. A wrong or unexpected URL is treated as missing; the site never
silently substitutes another file.

### Fallback states

| Situation | UI behavior |
| --- | --- |
| No published release (API 404) | “No stable release published yet”; no download links; GitHub Releases link |
| Complete release | Exact version, date and matched asset downloads |
| Release missing one asset | Other assets remain; the missing platform shows a warning and no download link |
| API/network/rate-limit error | “Release lookup unavailable”; downloads disabled; GitHub Releases link |
| API returns malformed data | Same graceful error/empty path; no link is guessed |
| Latest release is a draft/prerelease | Ignored as a stable release |

The footer shows the app source version from `package.json` through Vite's
`__APP_VERSION__` define. It shows the latest release version/date only when the
API provides a valid stable release.

The AUR selector always says **“AUR package not published yet.”** It may link to
the exact AUR source/metadata asset from a release, but it must not advertise
`yay -S breathe` until the package is actually published and verified.

## Deployment

The Pages workflow:

- runs only on pushes to `main` and `workflow_dispatch`;
- never runs for pull requests, so fork PRs cannot deploy the public site;
- uses `contents: read` for the build job;
- grants `pages: write` and `id-token: write` only to the deploy job;
- uses `concurrency: pages` with `cancel-in-progress: true`;
- runs app/website tests, the website production build and the base-path check;
- uploads `website/dist/` with the official Pages artifact action;
- deploys through the `github-pages` environment.

The release workflow is independent; publishing a `v*` tag does not deploy the
website, and deploying the website does not publish a release.

## Verification after deployment

```bash
curl -fsS -I https://usfmah.github.io/breathe/
curl -fsS https://usfmah.github.io/breathe/ | head
curl -fsS -o /dev/null -w '%{http_code}\n' \
  https://usfmah.github.io/breathe/does-not-exist
```

Check that:

- the HTTPS response is 200;
- the HTML references `/breathe/assets/...`;
- the screenshots load from `/breathe/images/...`;
- the missing-path response serves the custom `404.html`;
- the release selector shows the published version and exact asset names after
  a release exists;
- a release asset URL downloads the expected public file without
  authentication.

Do not claim the site is live, the deployment passed, or a release download
works without these checks.

## Accessibility

The site includes semantic landmarks, a skip link, visible focus styles,
keyboard-operable platform controls, a labelled theme toggle, `aria-live`
feedback for release state and copy actions, and a reduced-motion stylesheet.
The layout is responsive at desktop, tablet and narrow mobile widths. Automated
build and unit checks do not replace manual keyboard, screen-reader, contrast or
zoom testing in a real browser.
