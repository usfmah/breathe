#!/usr/bin/env node
/**
 * Keeps the application version sources in lockstep and, optionally, compares
 * them with the release tag that triggered the workflow.
 *
 *   node scripts/check-version.mjs            # consistency only
 *   node scripts/check-version.mjs v0.1.0     # also require this tag
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(file) {
  return readFileSync(resolve(root, file), "utf8");
}

const pkg = JSON.parse(read("package.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const lock = JSON.parse(read("package-lock.json"));
const cargo = read("src-tauri/Cargo.toml");

// Cargo.toml has several tables; only the [package] table owns this version.
const packageTable = cargo
  .split(/^\[/m)
  .map((section) => section.trimStart())
  .find((section) => section.startsWith("package]"));
const cargoVersion = packageTable?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (!cargoVersion) {
  console.error("Could not read the [package] version from src-tauri/Cargo.toml.");
  process.exit(1);
}

const versions = {
  "package.json": pkg.version,
  "package-lock.json": lock.version,
  "package-lock.json (root package)": lock.packages?.[""]?.version,
  "src-tauri/tauri.conf.json": tauri.version,
  "src-tauri/Cargo.toml": cargoVersion,
};

const missing = Object.entries(versions).filter(([, version]) => !version);
if (missing.length > 0) {
  console.error("Missing version metadata:");
  for (const [file] of missing) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  console.error("Version mismatch:");
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version ?? "(missing)"}`);
  }
  process.exit(1);
}

const tag = process.argv[2];
if (tag) {
  if (!tag.startsWith("v")) {
    console.error(`Release tag ${tag} must start with "v" (for example v0.1.0).`);
    process.exit(1);
  }
  const expected = tag.slice(1);
  if (expected !== pkg.version) {
    console.error(
      `Release tag ${tag} does not match the application version ${pkg.version}.`,
    );
    process.exit(1);
  }
}

console.log(
  `Version ${pkg.version} is consistent across package.json, package-lock.json, tauri.conf.json and Cargo.toml${tag ? ` (tag ${tag})` : ""}.`,
);
