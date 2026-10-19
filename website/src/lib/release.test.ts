import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_RELEASES_URL,
  LATEST_RELEASE_API,
  expectedAssetNames,
  fetchLatestRelease,
  formatAssetSize,
  loadLatestRelease,
  parseGitHubRelease,
  releaseVersion,
  safeReleasePageUrl,
  selectReleaseAssets,
  type GitHubRelease,
  type ReleaseAsset,
} from "./release";

const version = "0.1.0";
const names = expectedAssetNames(version);

function asset(name: string, overrides: Partial<ReleaseAsset> = {}): ReleaseAsset {
  return {
    name,
    size: 12_345,
    browser_download_url: `https://github.com/usfmah/breathe/releases/download/v${version}/${name}`,
    state: "uploaded",
    ...overrides,
  };
}

function release(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tag_name: `v${version}`,
    name: `Breathe ${version}`,
    published_at: "2026-10-20T12:00:00Z",
    html_url: `https://github.com/usfmah/breathe/releases/tag/v${version}`,
    draft: false,
    prerelease: false,
    assets: Object.values(names).map((name) => asset(name)),
    ...overrides,
  };
}

describe("release metadata", () => {
  it("recognizes a version tag and builds the exact asset names", () => {
    expect(releaseVersion("v0.1.0")).toBe("0.1.0");
    expect(releaseVersion("0.1.0")).toBe("0.1.0");
    expect(releaseVersion("v1.2.3-beta.1")).toBe("1.2.3-beta.1");
    expect(releaseVersion("release-0.1.0")).toBeNull();
    expect(names).toEqual({
      windows: "Breathe_0.1.0_x64-setup.exe",
      rpm: "Breathe-0.1.0-1.x86_64.rpm",
      deb: "Breathe_0.1.0_amd64.deb",
      appimage: "Breathe_0.1.0_amd64.AppImage",
      source: "Breathe-0.1.0-source.tar.gz",
      aur: "Breathe-0.1.0-aur.tar.gz",
    });
  });

  it("selects every expected asset from a complete release", () => {
    const selected = selectReleaseAssets(release());
    expect(selected?.version).toBe(version);
    for (const name of Object.values(names)) {
      expect(selected?.assets).toBeDefined();
      if (!selected) throw new Error("release should be selected");
      expect(Object.values(selected.assets).map((item) => item?.name)).toContain(name);
    }
  });

  it("treats a missing expected asset as unavailable without changing the others", () => {
    const incomplete = release({
      assets: Object.values(names)
        .filter((name) => name !== names.windows)
        .map((name) => asset(name)),
    });
    const selected = selectReleaseAssets(incomplete);
    expect(selected?.assets.windows).toBeNull();
    expect(selected?.assets.rpm?.name).toBe(names.rpm);
    expect(selected?.assets.deb?.name).toBe(names.deb);
  });

  it("rejects untrusted, empty, and non-uploaded assets", () => {
    const unsafe = release({
      assets: [
        asset(names.windows, {
          browser_download_url: `https://example.com/${names.windows}`,
        }),
        asset(names.rpm, { size: 0 }),
        asset(names.deb, { state: "new" }),
      ],
    });
    const selected = selectReleaseAssets(unsafe);
    expect(selected?.assets.windows).toBeNull();
    expect(selected?.assets.rpm).toBeNull();
    expect(selected?.assets.deb).toBeNull();
  });

  it("does not select draft or prerelease data", () => {
    expect(selectReleaseAssets(release({ draft: true }))).toBeNull();
    expect(selectReleaseAssets(release({ prerelease: true }))).toBeNull();
  });

  it("parses only well-formed release payloads", () => {
    const parsed = parseGitHubRelease(release());
    expect(parsed?.tag_name).toBe("v0.1.0");
    expect(parseGitHubRelease({ tag_name: "v0.1.0" })).toBeNull();
    expect(parseGitHubRelease(null)).toBeNull();
  });

  it("removes malformed assets while keeping valid metadata", () => {
    const parsed = parseGitHubRelease({
      ...release(),
      assets: [
        asset(names.windows),
        { name: 12, size: "large", browser_download_url: 9 },
      ],
    });
    expect(parsed?.assets).toHaveLength(1);
    expect(parsed?.assets[0]?.name).toBe(names.windows);
  });

  it("falls back to the releases page for an untrusted release URL", () => {
    expect(
      safeReleasePageUrl(release({ html_url: "https://example.com/release" })),
    ).toBe(GITHUB_RELEASES_URL);
    expect(
      safeReleasePageUrl(release({ html_url: "https://github.com/other/repo/releases/tag/v0.1.0" })),
    ).toBe(GITHUB_RELEASES_URL);
  });

  it("formats asset sizes without inventing precision", () => {
    expect(formatAssetSize(512)).toBe("512 B");
    expect(formatAssetSize(2048)).toBe("2.0 KB");
    expect(formatAssetSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatAssetSize(0)).toBe("");
  });
});

describe("release API loading", () => {
  it("fetches the latest release with the public GitHub API", async () => {
    const fetcher = vi.fn(
      async (_input: string, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify(release()), { status: 200 }),
    );
    const result = await fetchLatestRelease(fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      LATEST_RELEASE_API,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result?.tag_name).toBe("v0.1.0");
  });

  it("returns empty for a repository with no published release", async () => {
    const fetcher = async (): Promise<Response> =>
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    await expect(fetchLatestRelease(fetcher)).resolves.toBeNull();
    await expect(loadLatestRelease(fetcher)).resolves.toEqual({ status: "empty" });
  });

  it("returns a graceful error state when the network fails", async () => {
    const fetcher = async (): Promise<Response> => {
      throw new Error("offline");
    };
    await expect(loadLatestRelease(fetcher)).resolves.toEqual({
      status: "error",
      message: "offline",
    });
  });

  it("returns a graceful error state for a non-success response", async () => {
    const fetcher = async (): Promise<Response> =>
      new Response("rate limited", { status: 403 });
    const result = await loadLatestRelease(fetcher);
    expect(result.status).toBe("error");
  });

  it("returns ready with unavailable assets when the release is incomplete", async () => {
    const incomplete = release({
      assets: Object.values(names)
        .filter((name) => name !== names.windows)
        .map((name) => asset(name)),
    });
    const fetcher = async (): Promise<Response> =>
      new Response(JSON.stringify(incomplete), { status: 200 });
    const result = await loadLatestRelease(fetcher);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected a ready release");
    expect(result.selected.assets.windows).toBeNull();
    expect(result.selected.assets.rpm?.name).toBe(names.rpm);
  });
});
