export const GITHUB_REPOSITORY = "usfmah/breathe" as const;
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPOSITORY}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`;

export type AssetKey = "windows" | "rpm" | "deb" | "appimage" | "source" | "aur";

export interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  state?: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export interface SelectedRelease {
  release: GitHubRelease;
  version: string;
  assets: Record<AssetKey, ReleaseAsset | null>;
}

export type LatestReleaseState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; selected: SelectedRelease }
  | { status: "error"; message: string };

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAsset(value: unknown): ReleaseAsset | null {
  if (!isRecord(value)) return null;
  const { name, size, browser_download_url, state } = value;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof size !== "number" ||
    !Number.isFinite(size) ||
    typeof browser_download_url !== "string"
  ) {
    return null;
  }
  return {
    name,
    size,
    browser_download_url,
    ...(typeof state === "string" ? { state } : {}),
  };
}

export function parseGitHubRelease(value: unknown): GitHubRelease | null {
  if (!isRecord(value)) return null;
  const { tag_name, name, published_at, html_url, draft, prerelease, assets } = value;
  if (
    typeof tag_name !== "string" ||
    typeof html_url !== "string" ||
    typeof draft !== "boolean" ||
    typeof prerelease !== "boolean" ||
    !Array.isArray(assets)
  ) {
    return null;
  }

  const parsedAssets = assets
    .map(parseAsset)
    .filter((asset): asset is ReleaseAsset => asset !== null);

  return {
    tag_name,
    name: typeof name === "string" ? name : null,
    published_at: typeof published_at === "string" ? published_at : null,
    html_url,
    draft,
    prerelease,
    assets: parsedAssets,
  };
}

export function releaseVersion(tagName: string): string | null {
  const version = tagName.startsWith("v") ? tagName.slice(1) : tagName;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ? version : null;
}

export function expectedAssetNames(version: string): Record<AssetKey, string> {
  return {
    windows: `Breathe_${version}_x64-setup.exe`,
    rpm: `Breathe-${version}-1.x86_64.rpm`,
    deb: `Breathe_${version}_amd64.deb`,
    appimage: `Breathe_${version}_amd64.AppImage`,
    source: `Breathe-${version}-source.tar.gz`,
    aur: `Breathe-${version}-aur.tar.gz`,
  };
}

function isTrustedAssetUrl(urlValue: string, tagName: string, name: string): boolean {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return false;
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    return (
      parts.length === 6 &&
      parts[0] === "usfmah" &&
      parts[1] === "breathe" &&
      parts[2] === "releases" &&
      parts[3] === "download" &&
      parts[4] === tagName &&
      parts[5] === name
    );
  } catch {
    return false;
  }
}

export function selectReleaseAssets(release: GitHubRelease): SelectedRelease | null {
  if (release.draft || release.prerelease) return null;
  const version = releaseVersion(release.tag_name);
  if (!version) return null;

  const names = expectedAssetNames(version);
  const assets = {} as Record<AssetKey, ReleaseAsset | null>;
  for (const key of Object.keys(names) as AssetKey[]) {
    const expectedName = names[key];
    const asset = release.assets.find((candidate) => candidate.name === expectedName);
    assets[key] =
      asset &&
      asset.size > 0 &&
      (asset.state === undefined || asset.state === "uploaded") &&
      isTrustedAssetUrl(asset.browser_download_url, release.tag_name, expectedName)
        ? asset
        : null;
  }

  return { release, version, assets };
}

export async function fetchLatestRelease(
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<GitHubRelease | null> {
  const init: RequestInit = {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
  if (signal !== undefined) init.signal = signal;

  const response = await fetcher(LATEST_RELEASE_API, init);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub Releases API returned HTTP ${response.status}`);
  }

  const release = parseGitHubRelease(await response.json());
  if (!release || release.draft || release.prerelease) return null;
  return release;
}

export async function loadLatestRelease(
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<LatestReleaseState> {
  try {
    const release = await fetchLatestRelease(fetcher, signal);
    if (!release) return { status: "empty" };
    const selected = selectReleaseAssets(release);
    return selected ? { status: "ready", selected } : { status: "empty" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The latest release information could not be loaded.",
    };
  }
}

export function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = units[0] ?? "B";
  for (const candidate of units) {
    unit = candidate;
    if (value < 1024) break;
    value /= 1024;
  }
  return `${value.toFixed(value >= 10 || unit === "B" ? 0 : 1)} ${unit}`;
}

export function safeReleasePageUrl(release: GitHubRelease): string {
  try {
    const url = new URL(release.html_url);
    if (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(`/${GITHUB_REPOSITORY}/releases/`)
    ) {
      return url.toString();
    }
  } catch {
    // Fall through to the stable releases page.
  }
  return GITHUB_RELEASES_URL;
}
