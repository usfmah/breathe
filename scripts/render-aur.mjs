#!/usr/bin/env node
/**
 * Renders the release-ready AUR files.
 *
 * The repository copy uses a SKIP checksum because the release assets do not
 * exist until the tag is published. The release workflow computes the real
 * checksum of Breathe-<version>-source.tar.gz and calls this script:
 *
 *   node scripts/render-aur.mjs 0.1.0 <sha256> dist/aur
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [version, sha256, outDir = "dist/aur"] = process.argv.slice(2);

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: render-aur.mjs <x.y.z> <sha256> [outDir]");
  process.exit(1);
}
if (!/^[a-f0-9]{64}$/i.test(sha256 ?? "")) {
  console.error("The checksum must be a 64-character hex sha256.");
  process.exit(1);
}

const releaseUrl = `https://github.com/usfmah/breathe/releases/download/v${version}`;

const pkgbuild = readFileSync(resolve(root, "packaging/aur/PKGBUILD"), "utf8")
  .replace(/^pkgver=.*$/m, `pkgver=${version}`)
  .replace(/^sha256sums=.*$/m, `sha256sums=('${sha256.toLowerCase()}')`);

// .SRCINFO uses tab-indented fields, so preserve the leading whitespace.
const srcinfo = readFileSync(resolve(root, "packaging/aur/.SRCINFO"), "utf8")
  .replace(/^(\s*)pkgver = .*$/m, `$1pkgver = ${version}`)
  .replace(
    /^(\s*)source = .*$/m,
    `$1source = breathe-${version}.tar.gz::${releaseUrl}/Breathe-${version}-source.tar.gz`,
  )
  .replace(
    /^(\s*)sha256sums = .*$/m,
    `$1sha256sums = ${sha256.toLowerCase()}`,
  );

if (
  !pkgbuild.includes(sha256.toLowerCase()) ||
  !srcinfo.includes(sha256.toLowerCase())
) {
  console.error("Could not inject the checksum into PKGBUILD/.SRCINFO.");
  process.exit(1);
}
if (!srcinfo.includes(`Breathe-${version}-source.tar.gz`)) {
  console.error("Could not inject the source URL/version into .SRCINFO.");
  process.exit(1);
}

const target = resolve(root, outDir);
mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, "PKGBUILD"), pkgbuild);
writeFileSync(resolve(target, ".SRCINFO"), srcinfo);

console.log(`Rendered AUR metadata for ${version} in ${target}`);
