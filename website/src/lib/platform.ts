export type InstallPlatform = "windows" | "fedora" | "ubuntu" | "arch" | "appimage";

export const INSTALL_PLATFORMS: ReadonlyArray<{
  id: InstallPlatform;
  label: string;
  shortLabel: string;
}> = [
  { id: "windows", label: "Windows 10/11 x64", shortLabel: "Windows" },
  { id: "fedora", label: "Fedora / RPM", shortLabel: "Fedora" },
  { id: "ubuntu", label: "Ubuntu / Debian / DEB", shortLabel: "Ubuntu / Debian" },
  { id: "arch", label: "Arch Linux / AUR", shortLabel: "Arch" },
  { id: "appimage", label: "Other Linux / AppImage", shortLabel: "AppImage" },
];

export function detectPlatform(userAgent?: string): InstallPlatform | null {
  const value =
    userAgent ??
    (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const normalized = value.toLowerCase();
  if (normalized.includes("windows")) return "windows";
  // Browser detection can identify Linux, but not the distribution. Start with
  // the distro-neutral AppImage option and let the visitor choose RPM, DEB or AUR.
  if (normalized.includes("linux") || normalized.includes("x11")) return "appimage";
  return null;
}

export function platformLabel(platform: InstallPlatform): string {
  return (
    INSTALL_PLATFORMS.find((candidate) => candidate.id === platform)?.shortLabel ??
    "your platform"
  );
}
