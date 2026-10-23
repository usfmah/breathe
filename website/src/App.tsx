import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  CircleAlert,
  Coffee,
  Copy,
  Download,
  Eye,
  HeartPulse,
  Layers,
  Leaf,
  Menu,
  Monitor,
  Moon,
  Package,
  Pause,
  Power,
  Settings,
  ShieldCheck,
  Sun,
  SunMoon,
  Terminal,
  Timer,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  expectedAssetNames,
  formatAssetSize,
  formatReleaseDate,
  safeReleasePageUrl,
  type LatestReleaseState,
  type ReleaseAsset,
  type SelectedRelease,
} from "./lib/release";
import {
  INSTALL_PLATFORMS,
  detectPlatform,
  type InstallPlatform,
} from "./lib/platform";
import { useLatestRelease } from "./lib/useLatestRelease";
import { useTheme } from "./lib/useTheme";

const REPO_DOCS_URL = `${GITHUB_REPO_URL}/tree/main/docs`;

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: ReadonlyArray<Feature> = [
  {
    icon: Timer,
    title: "Breaks on your rhythm",
    body: "Choose a 20, 30, 45, or 60 minute interval. The circular countdown stays visible but never takes over your work.",
  },
  {
    icon: HeartPulse,
    title: "Move and rest your eyes",
    body: "Turn movement reminders and eye-rest reminders on independently. When both are enabled, Breathe alternates between them.",
  },
  {
    icon: Pause,
    title: "Pause without losing your place",
    body: "Pause freezes the remaining time; resume continues from where you stopped. A five-minute snooze is available from the tray when you need it.",
  },
  {
    icon: Monitor,
    title: "Native notifications",
    body: "Reminders arrive through the desktop notification service on Linux and the native toast API on Windows. Settings reports whether the service is available.",
  },
  {
    icon: Power,
    title: "Quietly ready",
    body: "Closing the window hides it instead of quitting. Start with your session on Linux or Windows, then let Breathe wait in the tray.",
  },
  {
    icon: SunMoon,
    title: "At home in your theme",
    body: "Follow the system appearance, or pin light or dark mode. The interface is intentionally small, calm, and keyboard-friendly.",
  },
];

function BreathMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M50.6 13.4C37.2 13 23 18.4 17.1 29.2c-4 7.3-2.1 15.4 4.7 19.6 6.8 4.2 15.5 2.5 19.8-4.1 5.1-7.9 2.9-18.8 9-31.3Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M15.8 51.2c3.1-9.2 9.2-16.7 18.3-22.4"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.3-5.27-1.28-5.27-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.5 3.17-1.18 3.17-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.28 5.69.42.36.79 1.07.79 2.16v3.2c0 .32.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "section-intro section-intro--centered" : "section-intro"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="section-description">{description}</p>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="copy-button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </>
  );
}

function CommandBlock({
  label,
  command,
}: {
  label: string;
  command: string;
}) {
  return (
    <div className="command-block">
      <div className="command-head">
        <span>{label}</span>
        <CopyButton text={command} label={label} />
      </div>
      <pre>
        <code>{command}</code>
      </pre>
    </div>
  );
}

function ReleaseStatus({ state }: { state: LatestReleaseState }) {
  if (state.status === "loading") {
    return (
      <span className="release-status release-status--muted">
        <span className="status-pulse" aria-hidden="true" />
        Checking GitHub Releases
      </span>
    );
  }
  if (state.status === "error") {
    return (
      <span className="release-status release-status--warning">
        <CircleAlert aria-hidden="true" />
        Release lookup unavailable
      </span>
    );
  }
  if (state.status === "empty") {
    return (
      <span className="release-status release-status--muted">
        <CircleAlert aria-hidden="true" />
        No stable release published yet
      </span>
    );
  }
  return (
    <span className="release-status release-status--ready">
      <CheckCircle2 aria-hidden="true" />
      Latest stable release {state.selected.release.tag_name}
    </span>
  );
}

function ReleaseAction({
  state,
  asset,
  kind,
}: {
  state: LatestReleaseState;
  asset: ReleaseAsset | null;
  kind: string;
}) {
  const releaseLink = (
    <a
      className="text-link"
      href={GITHUB_RELEASES_URL}
      target="_blank"
      rel="noreferrer"
    >
      Browse GitHub Releases <ArrowUpRight aria-hidden="true" />
    </a>
  );

  if (state.status === "loading") {
    return (
      <div className="release-action" aria-live="polite">
        <p className="release-note">Looking for a verified {kind}…</p>
        {releaseLink}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="release-action" aria-live="polite">
        <p className="release-note">
          Release information could not be loaded, so downloads are disabled
          rather than pointing at an unverified file.
        </p>
        {releaseLink}
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="release-action" aria-live="polite">
        <p className="release-note">
          No stable release is published yet. Installation instructions are
          shown below and become active when the release assets exist.
        </p>
        {releaseLink}
      </div>
    );
  }
  if (!asset) {
    return (
      <div className="release-action" aria-live="polite">
        <p className="release-note">
          The latest release does not contain the expected {kind} asset. No
          download link is shown instead of guessing.
        </p>
        {releaseLink}
      </div>
    );
  }

  return (
    <div className="release-action" aria-live="polite">
      <a
        className="button button--primary download-button"
        href={asset.browser_download_url}
        target="_blank"
        rel="noreferrer"
      >
        <Download aria-hidden="true" />
        Download {kind}
      </a>
      <p className="asset-line">
        <code>{asset.name}</code>
        {asset.size > 0 ? <span>{formatAssetSize(asset.size)}</span> : null}
      </p>
      {releaseLink}
    </div>
  );
}

function InstallAside({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <aside className="install-aside">
      <h4>{title}</h4>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function InstallPanel({
  platform,
  state,
}: {
  platform: InstallPlatform;
  state: LatestReleaseState;
}) {
  const selected: SelectedRelease | null =
    state.status === "ready" ? state.selected : null;
  const version = selected?.version ?? null;
  const names = expectedAssetNames(version ?? "<version>");
  const assetFor = (key: keyof typeof names) => selected?.assets[key] ?? null;

  if (platform === "windows") {
    return (
      <div className="install-panel" role="region" aria-label="Windows installation">
        <div className="install-main">
          <div className="install-heading">
            <div>
              <h3>Windows 10/11 x64</h3>
              <p>Per-user NSIS installer. No administrator rights required.</p>
            </div>
            <ReleaseStatus state={state} />
          </div>
          <ReleaseAction
            state={state}
            asset={assetFor("windows")}
            kind="Windows installer"
          />
          <ol className="install-steps">
            <li>Download the installer and run it as your normal user.</li>
            <li>
              Breathe installs to <code>%LOCALAPPDATA%\Breathe</code> and adds a
              Start Menu shortcut.
            </li>
            <li>Launch Breathe from the Start Menu.</li>
          </ol>
          <p className="install-note">
            WebView2 is required at runtime. If it is missing, the installer
            downloads Microsoft’s bootstrapper, so the first install needs an
            internet connection.
          </p>
          {selected && !selected.windowsSigned && (
            <p className="install-note">
              This Windows installer is unsigned. Windows may show an “Unknown
              publisher” or SmartScreen warning before it runs.
            </p>
          )}
          <InstallAside
            title="What to expect"
            items={[
              { label: "Package", value: names.windows },
              { label: "Install type", value: "Per-user NSIS" },
              { label: "Runtime", value: "WebView2 Evergreen" },
              {
                label: "Signing",
                value: selected?.windowsSigned ? "Authenticode verified" : "Unsigned",
              },
            ]}
          />
        </div>
      </div>
    );
  }

  if (platform === "fedora") {
    return (
      <div className="install-panel" role="region" aria-label="Fedora installation">
        <div className="install-main">
          <div className="install-heading">
            <div>
              <h3>Fedora / RPM</h3>
              <p>Native package with dependencies resolved by DNF.</p>
            </div>
            <ReleaseStatus state={state} />
          </div>
          <ReleaseAction state={state} asset={assetFor("rpm")} kind="RPM package" />
          <CommandBlock
            label="Install with DNF"
            command={`sudo dnf install ./${names.rpm}\nbreathe`}
          />
          <p className="body-note">
            The RPM declares GTK 3, WebKitGTK 4.1, librsvg, libappindicator,
            glibc and the C++ runtime. No Node.js, Rust, npm or Cargo is needed
            on the target machine.
          </p>
          <InstallAside
            title="Release matrix"
            items={[
              { label: "Package", value: names.rpm },
              { label: "Release smoke target", value: "Fedora 44 under Xvfb" },
              { label: "Oldest Fedora tested", value: "Fedora 44" },
              { label: "Tray", value: "StatusNotifier host required" },
            ]}
          />
        </div>
      </div>
    );
  }

  if (platform === "ubuntu") {
    return (
      <div className="install-panel" role="region" aria-label="Ubuntu and Debian installation">
        <div className="install-main">
          <div className="install-heading">
            <div>
              <h3>Ubuntu / Debian / DEB</h3>
              <p>Release DEB built on Ubuntu 22.04 for the glibc 2.35 floor.</p>
            </div>
            <ReleaseStatus state={state} />
          </div>
          <ReleaseAction state={state} asset={assetFor("deb")} kind="DEB package" />
          <CommandBlock
            label="Install with APT"
            command={`sudo apt install ./${names.deb}\nbreathe`}
          />
          <p className="body-note">
            APT resolves the declared WebKitGTK, GTK 3, libappindicator,
            librsvg and C/C++ runtime dependencies. The release workflow
            smoke-tests this package on Ubuntu 24.04 and Debian 12; other
            releases may work but are not individually verified.
          </p>
          <InstallAside
            title="Release matrix"
            items={[
              { label: "Package", value: names.deb },
              { label: "Release smoke targets", value: "Ubuntu 24.04 and Debian 12" },
              { label: "glibc floor", value: "2.35" },
              { label: "Tray", value: "StatusNotifier host required" },
            ]}
          />
        </div>
      </div>
    );
  }

  if (platform === "arch") {
    return (
      <div className="install-panel" role="region" aria-label="Arch Linux installation">
        <div className="install-main">
          <div className="install-heading">
            <div>
              <h3>Arch Linux / AUR</h3>
              <p>A source package; build tools are needed on the build machine.</p>
            </div>
            <span className="release-status release-status--warning">
              <CircleAlert aria-hidden="true" />
              AUR package not published yet
            </span>
          </div>
          <ReleaseAction
            state={state}
            asset={assetFor("aur")}
            kind="AUR build files"
          />
          <div className="callout">
            <Terminal aria-hidden="true" />
            <div>
              <strong>Do not use <code>yay -S breathe</code> yet.</strong>
              <p>
                The release contains AUR source and metadata archives, but the
                package has not been submitted to the AUR. Build the released
                source locally for now.
              </p>
            </div>
          </div>
          <CommandBlock
            label="Build the release source"
            command={`mkdir breathe-aur\ntar -xzf ${names.aur} -C breathe-aur\ncd breathe-aur\nmakepkg -si`}
          />
          <p className="body-note">
            The PKGBUILD assumes <code>base-devel</code> and declares Rust,
            Cargo, Node.js, npm, pkgconf, git, WebKitGTK 4.1, GTK 3,
            libappindicator and librsvg. A full <code>makepkg -si</code> install
            is still a manual validation step.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="install-panel" role="region" aria-label="AppImage installation">
      <div className="install-main">
        <div className="install-heading">
          <div>
            <h3>Other Linux / AppImage</h3>
            <p>A portable single file for a quick try; not a universal Linux binary.</p>
          </div>
          <ReleaseStatus state={state} />
        </div>
        <ReleaseAction state={state} asset={assetFor("appimage")} kind="AppImage" />
        <CommandBlock
          label="Run the AppImage"
          command={`chmod +x ${names.appimage}\n./${names.appimage}`}
        />
        <p className="body-note">
          If FUSE 2 is unavailable, use{" "}
          <code>./{names.appimage} --appimage-extract-and-run</code>. The
          release AppImage is built on Ubuntu 22.04 and requires glibc 2.35 or
          newer plus base desktop libraries such as fontconfig and fribidi.
          Minimal containers are not the target.
        </p>
        <InstallAside
          title="Portability"
          items={[
            { label: "Package", value: names.appimage },
            { label: "Release smoke targets", value: "Ubuntu 24.04 and Fedora 44" },
            { label: "glibc", value: "2.35 or newer" },
            { label: "Desktop libraries", value: "GTK 3 / WebKitGTK 4.1" },
          ]}
        />
      </div>
    </div>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const releaseState = useLatestRelease();
  const [platform, setPlatform] = useState<InstallPlatform | null>(() => detectPlatform());
  const detectedPlatform = detectPlatform();
  const [menuOpen, setMenuOpen] = useState(false);
  const selected =
    releaseState.status === "ready" ? releaseState.selected : null;
  const version = selected?.version ?? null;
  const releaseDate =
    selected === null ? null : formatReleaseDate(selected.release.published_at);
  const releasePage =
    selected === null
      ? GITHUB_RELEASES_URL
      : safeReleasePageUrl(selected.release);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const scrollToInstall = () => {
    const target = document.getElementById("install");
    if (!target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    setMenuOpen(false);
  };

  const downloadLabel =
    selected && platform
      ? platform === "windows"
        ? "Download for Windows"
        : platform === "fedora"
          ? "Download the RPM"
          : platform === "ubuntu"
            ? "Download the DEB"
            : platform === "appimage"
              ? "Download the AppImage"
              : "Get the AUR build files"
      : "Choose your installation";

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#main-content" aria-label="Breathe home">
            <BreathMark className="brand-mark" />
            <span>Breathe</span>
          </a>

          <nav
            id="site-nav"
            className={menuOpen ? "site-nav site-nav--open" : "site-nav"}
            aria-label="Primary"
          >
            <a href="#features" onClick={() => setMenuOpen(false)}>
              Features
            </a>
            <a href="#install" onClick={() => setMenuOpen(false)}>
              Install
            </a>
            <a href="#requirements" onClick={() => setMenuOpen(false)}>
              Requirements
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              GitHub <ArrowUpRight aria-hidden="true" />
            </a>
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="icon-button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="button button--small button--primary header-download"
              onClick={scrollToInstall}
            >
              Download
            </button>
            <button
              type="button"
              className="icon-button menu-button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="site-nav"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="hero container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow eyebrow--hero">
              <span className="eyebrow-dot" aria-hidden="true" />
              A quiet desktop companion
            </p>
            <h1 id="hero-title">
              A calmer way
              <br />
              to work.
            </h1>
            <p className="hero-lede">
              Breathe schedules short movement breaks and eye-rest reminders, then
              gets out of the way. No blocking overlays. No streak to maintain. Just
              a gentle nudge to look away and move.
            </p>
            <div className="hero-actions">
              <button type="button" className="button button--primary" onClick={scrollToInstall}>
                <Download aria-hidden="true" />
                {downloadLabel}
              </button>
              <a
                className="button button--secondary"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                <GitHubMark />
                View on GitHub
              </a>
            </div>
            <div className="hero-meta">
              <span><CheckCircle2 aria-hidden="true" /> Open source · MIT</span>
              <span><CheckCircle2 aria-hidden="true" /> Linux & Windows</span>
              <span><CheckCircle2 aria-hidden="true" /> Local settings</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-orbit hero-orbit--one" aria-hidden="true" />
            <div className="hero-orbit hero-orbit--two" aria-hidden="true" />
            <figure className="window-card">
              <div className="window-topline" aria-hidden="true">
                <span />
                <span />
                <span />
                <em>Breathe</em>
              </div>
              <img
                src={`${import.meta.env.BASE_URL}images/main-${theme}.png`}
                alt={`Breathe main window showing a countdown and reminders in ${theme} mode`}
                width="400"
                height="540"
              />
              <figcaption>Actual Breathe window · {theme} theme</figcaption>
            </figure>
            <div className="floating-note floating-note--one">
              <Eye aria-hidden="true" />
              <span>Rest your eyes</span>
            </div>
            <div className="floating-note floating-note--two">
              <Coffee aria-hidden="true" />
              <span>Time to move</span>
            </div>
          </div>
        </section>

        <section className="quiet-strip" aria-label="Breathe at a glance">
          <div className="container quiet-strip-inner">
            <span><Timer aria-hidden="true" /> 20–60 minute intervals</span>
            <span><Eye aria-hidden="true" /> Eye-rest reminders</span>
            <span><HeartPulse aria-hidden="true" /> Movement reminders</span>
            <span><Leaf aria-hidden="true" /> Hides instead of quitting</span>
          </div>
        </section>

        <section id="features" className="section container">
          <SectionIntro
            eyebrow="A quieter rhythm"
            title="Small reminders. Room to think."
            description="Breathe is built around a simple idea: a reminder should help you return to your body, not interrupt your day. Every feature is quiet by default."
          />
          <div className="feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article className="feature-card" key={title}>
                <span className="feature-icon">
                  <Icon aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--tinted">
          <div className="container preview-grid">
            <div className="preview-copy">
              <p className="eyebrow">Set it once</p>
              <h2>Leave it running. That is the point.</h2>
              <p>
                Breathe keeps the countdown in a small window, hides when you close
                it, and stays available from the tray. You can pause for a meeting,
                resume with the time you had left, snooze for five minutes, or let
                the rhythm continue.
              </p>
              <ul className="check-list">
                <li><Check aria-hidden="true" /> Choose 20, 30, 45, or 60 minutes</li>
                <li><Check aria-hidden="true" /> Use movement, eye rest, or both</li>
                <li><Check aria-hidden="true" /> See notification availability in Settings</li>
                <li><Check aria-hidden="true" /> Start with your session, only if you want to</li>
              </ul>
              <a className="text-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                Read how it works on GitHub <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
            <figure className="settings-figure">
              <img
                src={`${import.meta.env.BASE_URL}images/settings-reminders.png`}
                alt="Breathe settings window showing reminder interval, eye-rest, movement, and notification controls"
                width="780"
                height="600"
              />
              <figcaption>Actual Breathe settings window in light mode</figcaption>
            </figure>
          </div>
        </section>

        <section id="install" className="section container">
          <SectionIntro
            eyebrow="Install"
            title="Choose your platform."
            description="Downloads point only to verified assets in the latest stable GitHub Release. If the release is unavailable, the site shows the fallback instead of guessing."
            centered
          />
          <div className="install-status-row">
            <ReleaseStatus state={releaseState} />
            {releaseDate ? <span className="release-date">Published {releaseDate}</span> : null}
          </div>

          <div className="platform-picker" role="group" aria-label="Choose a platform">
            {INSTALL_PLATFORMS.map((item) => {
              const Icon =
                item.id === "windows"
                  ? Monitor
                  : item.id === "fedora"
                    ? Package
                    : item.id === "ubuntu"
                      ? Layers
                      : item.id === "arch"
                        ? Terminal
                        : Box;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={platform === item.id ? "platform-button is-selected" : "platform-button"}
                  onClick={() => setPlatform(item.id)}
                  aria-pressed={platform === item.id}
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{item.shortLabel}</strong>
                    <small>{item.label}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {detectedPlatform === "appimage" ? (
            <p className="detected-note">
              <Monitor aria-hidden="true" />
              Linux detected. Browser detection cannot identify your distribution,
              so choose RPM, DEB, AUR, or AppImage manually.
            </p>
          ) : null}

          {platform ? (
            <InstallPanel platform={platform} state={releaseState} />
          ) : (
            <div className="install-empty">
              <Monitor aria-hidden="true" />
              <div>
                <h3>Select your platform</h3>
                <p>
                  Breathe targets Linux and Windows. Choose an option above for
                  verified downloads and honest compatibility notes.
                </p>
              </div>
            </div>
          )}

          <p className="install-footnote">
            Looking for an older version?{" "}
            <a href={releasePage} target="_blank" rel="noreferrer">
              Open the GitHub Releases page <ArrowUpRight aria-hidden="true" />
            </a>
            . Release metadata is read from GitHub’s public API at runtime.
          </p>
        </section>

        <section id="requirements" className="section section--tinted">
          <div className="container">
            <SectionIntro
              eyebrow="Requirements and limits"
              title="Honest about what runs where."
              description="Breathe uses native desktop services. Core Windows controls have been checked in a Windows 10 VM; notifications, tray behavior, and device-specific details still need broader testing."
            />
            <div className="requirement-grid">
              <article className="requirement-card">
                <Monitor aria-hidden="true" />
                <h3>Windows 10/11 x64</h3>
                <p>
                  WebView2 Evergreen Runtime. The installer can fetch it when
                  missing. Notification permissions and Focus Assist can suppress
                  reminders.
                </p>
              </article>
              <article className="requirement-card">
                <Package aria-hidden="true" />
                <h3>Fedora / RPM</h3>
                <p>
                  Fedora 44 is the oldest tested release. A notification daemon and
                  a StatusNotifier host are needed for reminders and the tray. The
                  RPM resolves GTK, WebKitGTK, librsvg and libappindicator.
                </p>
              </article>
              <article className="requirement-card">
                <Layers aria-hidden="true" />
                <h3>Ubuntu / Debian / DEB</h3>
                <p>
                  Release smoke targets are Ubuntu 24.04 and Debian 12. The DEB is
                  built on Ubuntu 22.04 with a glibc 2.35 floor; other distributions
                  are not assumed.
                </p>
              </article>
              <article className="requirement-card">
                <Box aria-hidden="true" />
                <h3>AppImage</h3>
                <p>
                  glibc 2.35 or newer plus base desktop libraries. It is a portable
                  tryout, not a universal Linux binary, and it does not install a
                  desktop entry, icons, or autostart.
                </p>
              </article>
            </div>

          </div>
        </section>

        <section id="open-source" className="section container">
          <div className="open-source-card">
            <div className="open-source-copy">
              <p className="eyebrow">Open source</p>
              <h2>Built in the open, on purpose.</h2>
              <p>
                Breathe is a small MIT-licensed desktop app. The source, issue
                tracker, documentation, and release history are all public. There is
                no cloud dependency and no account to create.
              </p>
              <div className="open-source-actions">
                <a className="button button--primary" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                  <GitHubMark />
                  Browse the source
                </a>
                <a className="button button--secondary" href={releasePage} target="_blank" rel="noreferrer">
                  Release history <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="source-panel">
              <div className="source-row">
                <ShieldCheck aria-hidden="true" />
                <span><strong>MIT license</strong><small>Use, study, and share</small></span>
              </div>
              <div className="source-row">
                <Settings aria-hidden="true" />
                <span><strong>Local by default</strong><small>Settings stay on your machine</small></span>
              </div>
              <div className="source-row">
                <ArrowUpRight aria-hidden="true" />
                <span><strong>Documented limits</strong><small>No universal compatibility claims</small></span>
              </div>
              <a className="source-link" href={REPO_DOCS_URL} target="_blank" rel="noreferrer">
                Read the documentation <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <a className="brand" href="#main-content" aria-label="Breathe home">
              <BreathMark className="brand-mark" />
              <span>Breathe</span>
            </a>
            <p>A calm reminder to move and look away.</p>
          </div>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#install">Install</a>
            <a href="#requirements">Requirements</a>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
            <a href={releasePage} target="_blank" rel="noreferrer">Releases</a>
          </div>
          <div className="footer-meta">
            <p>
              Version {__APP_VERSION__}
              {version ? ` · Latest release v${version}` : ""}
            </p>
            {releaseDate ? <p>Published {releaseDate}</p> : null}
            <p>
              {releaseState.status === "error"
                ? "Release status unavailable"
                : releaseState.status === "empty"
                  ? "No stable release published yet"
                  : null}
            </p>
            <p>MIT · No analytics · Hosted on GitHub Pages</p>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
