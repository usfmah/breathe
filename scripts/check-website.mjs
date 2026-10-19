#!/usr/bin/env node
/**
 * Verifies the production Pages build after `npm run website:build`.
 *
 * GitHub Pages serves this site from /breathe/, so root-relative asset URLs
 * that omit the repository base would 404 in production. This check also
 * catches missing copied screenshots and a missing custom 404 page.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "website/dist");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function regularFile(path) {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
}

check(existsSync(dist), "website/dist does not exist; run the website build first.");

const indexPath = resolve(dist, "index.html");
const notFoundPath = resolve(dist, "404.html");
check(regularFile(indexPath), "website/dist/index.html is missing or empty.");
check(regularFile(notFoundPath), "website/dist/404.html is missing or empty.");

if (regularFile(indexPath)) {
  const html = readFileSync(indexPath, "utf8");
  check(
    /(?:src|href)="\/breathe\/assets\//.test(html),
    "index.html does not reference assets under /breathe/assets/.",
  );
  check(
    !/(?:src|href)="\/assets\//.test(html) &&
      !/(?:src|href)="\/(?:images|favicon\.png|icon\.png)/.test(html),
    "index.html contains root-relative assets that omit the /breathe/ base path.",
  );
  check(!html.includes("http://localhost"), "index.html contains a localhost URL.");

  const localReferences = [...html.matchAll(/(?:src|href)="(\/breathe\/[^"?#]*)/g)].map(
    (match) => match[1],
  );
  for (const reference of new Set(localReferences)) {
    const relative = reference.slice("/breathe/".length);
    const file = relative.endsWith("/") || relative === ""
      ? resolve(dist, "index.html")
      : resolve(dist, relative);
    check(regularFile(file), `index.html references a missing local file: ${reference}`);
  }
}

for (const image of [
  "images/main-light.png",
  "images/main-dark.png",
  "images/settings-reminders.png",
  "favicon.png",
  "icon.png",
]) {
  check(regularFile(resolve(dist, image)), `website/dist/${image} is missing or empty.`);
}

if (regularFile(notFoundPath)) {
  const html = readFileSync(notFoundPath, "utf8");
  check(html.includes('href="/breathe/"'), "404.html does not link back to /breathe/.");
}

const assetsDir = resolve(dist, "assets");
check(existsSync(assetsDir), "website/dist/assets/ is missing.");
if (existsSync(assetsDir)) {
  const assets = readdirSync(assetsDir);
  check(
    assets.some((file) => /\.js$/.test(file)),
    "website/dist/assets/ contains no JavaScript bundle.",
  );
  check(
    assets.some((file) => /\.css$/.test(file)),
    "website/dist/assets/ contains no CSS bundle.",
  );
}

if (failures.length > 0) {
  console.error("Website build check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Website build check passed: /breathe/ base path, assets, images and 404 page.");
