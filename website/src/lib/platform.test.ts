import { describe, expect, it } from "vitest";
import { detectPlatform, platformLabel } from "./platform";

describe("platform detection", () => {
  it("recognizes Windows browsers", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ),
    ).toBe("windows");
  });

  it("starts Linux visitors on the distro-neutral AppImage option", () => {
    expect(
      detectPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"),
    ).toBe("appimage");
  });

  it("does not guess a Linux distribution", () => {
    expect(
      detectPlatform("Mozilla/5.0 (X11; Fedora; Linux x86_64)"),
    ).toBe("appimage");
    expect(
      detectPlatform("Mozilla/5.0 (X11; Ubuntu; Linux x86_64)"),
    ).toBe("appimage");
  });

  it("leaves unsupported platforms for manual selection", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBeNull();
    expect(detectPlatform("")).toBeNull();
  });

  it("provides short labels for the install selector", () => {
    expect(platformLabel("windows")).toBe("Windows");
    expect(platformLabel("ubuntu")).toBe("Ubuntu / Debian");
    expect(platformLabel("arch")).toBe("Arch");
  });
});
