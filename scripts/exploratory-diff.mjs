#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/exploratory-diff.mjs
//
// The week-on-week pass over two crawls. It pairs the PNGs of two `exploratory-crawl` folders by
// lane, role, viewport, theme and page, compares each pair with the pixelmatch comparator that
// Playwright ships, and writes a contact sheet of the pairs that differ (before, diff, after) and
// a JSON summary. It finds; the reader of the sheet judges.
//
// A page is named by its screenshot file name without the leading sequence number, because the
// number shifts when a page appears or goes. A name that repeats inside one folder takes an
// occurrence suffix in crawl order.
//
// Usage: node scripts/exploratory-diff.mjs --before <crawl-dir> --after <crawl-dir>
//   [--out target/exploratory-diff] [--threshold 0.2]

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const DEFAULT_OUT_DIR = "target/exploratory-diff";
export const DEFAULT_THRESHOLD = 0.2;

const SEQUENCE_PREFIX = /^\d+-/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function parseArguments(argv) {
  const options = { before: undefined, after: undefined, outDir: DEFAULT_OUT_DIR, threshold: DEFAULT_THRESHOLD };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--before") options.before = value;
    else if (flag === "--after") options.after = value;
    else if (flag === "--out") options.outDir = value;
    else if (flag === "--threshold") options.threshold = Number(value);
    else throw new Error(`Unknown argument ${flag}`);
    index += 1;
  }
  if (!options.before || !options.after) throw new Error("Both --before and --after are required");
  if (!(options.threshold >= 0 && options.threshold <= 1)) throw new Error("--threshold must be between 0 and 1");
  return options;
}

// The page name of a screenshot file: the file name without its sequence number and extension.
export function pageNameForFile(fileName) {
  return fileName.replace(/\.png$/i, "").replace(SEQUENCE_PREFIX, "");
}

// Lists the screenshots of one crawl folder as { key, file } with the key
// <lane>/<role>/<viewport>-<theme>/<page>. The folder layout is <lane>/<role>/<viewport>-<theme>/.
export function listScreenshots(rootDir) {
  const entries = [];
  const subdirectories = (dir) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : [];
  for (const lane of subdirectories(rootDir)) {
    for (const role of subdirectories(path.join(rootDir, lane))) {
      for (const variant of subdirectories(path.join(rootDir, lane, role))) {
        const dir = path.join(rootDir, lane, role, variant);
        const files = fs
          .readdirSync(dir)
          .filter((name) => name.toLowerCase().endsWith(".png"))
          .sort();
        const occurrences = new Map();
        for (const name of files) {
          const page = pageNameForFile(name);
          const count = (occurrences.get(page) ?? 0) + 1;
          occurrences.set(page, count);
          const suffix = count > 1 ? `~${count}` : "";
          entries.push({ key: `${lane}/${role}/${variant}/${page}${suffix}`, file: path.join(dir, name) });
        }
      }
    }
  }
  return entries;
}

// Pairs two listings by key. Returns { pairs: [{ key, before, after }], onlyBefore, onlyAfter }.
export function pairScreenshots(beforeEntries, afterEntries) {
  const afterByKey = new Map(afterEntries.map((entry) => [entry.key, entry.file]));
  const beforeKeys = new Set(beforeEntries.map((entry) => entry.key));
  const pairs = [];
  const onlyBefore = [];
  for (const entry of beforeEntries) {
    if (afterByKey.has(entry.key)) pairs.push({ key: entry.key, before: entry.file, after: afterByKey.get(entry.key) });
    else onlyBefore.push(entry.key);
  }
  const onlyAfter = afterEntries.filter((entry) => !beforeKeys.has(entry.key)).map((entry) => entry.key);
  return { pairs, onlyBefore, onlyAfter };
}

export function pngSize(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

let comparatorFor;
function loadComparator() {
  if (!comparatorFor) {
    const require = createRequire(import.meta.url);
    comparatorFor = require("playwright-core/lib/coreBundle").utils.getComparator;
  }
  return comparatorFor("image/png");
}

// Compares two PNG buffers. A size difference is padded by the comparator and reported.
// Returns { equal, differingPixels, ratio, sizeChanged, beforeSize, afterSize, diff }.
export function compareScreenshots(beforeBuffer, afterBuffer, threshold = DEFAULT_THRESHOLD) {
  const beforeSize = pngSize(beforeBuffer);
  const afterSize = pngSize(afterBuffer);
  const sizeChanged = beforeSize.width !== afterSize.width || beforeSize.height !== afterSize.height;
  const result = loadComparator()(afterBuffer, beforeBuffer, { threshold });
  const area = Math.max(beforeSize.width, afterSize.width) * Math.max(beforeSize.height, afterSize.height);
  if (!result) return { equal: true, differingPixels: 0, ratio: 0, sizeChanged, beforeSize, afterSize, diff: null };
  const match = /(\d+) pixels/.exec(result.errorMessage);
  const differingPixels = match ? Number(match[1]) : 0;
  return {
    equal: false,
    differingPixels,
    ratio: area > 0 ? differingPixels / area : 0,
    sizeChanged,
    beforeSize,
    afterSize,
    diff: result.diff ?? null,
  };
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function fileNameForKey(key) {
  return key.replace(/[^A-Za-z0-9._~-]+/g, "__");
}

export function renderContactSheet({ beforeLabel, afterLabel, differing, counts }) {
  const cards = differing
    .map((row) => {
      const size = row.sizeChanged
        ? ` size ${row.beforeSize.width}x${row.beforeSize.height} to ${row.afterSize.width}x${row.afterSize.height}`
        : "";
      const percent = (row.ratio * 100).toFixed(2);
      const image = (src, caption) =>
        `<figure><a href="${escapeHtml(src)}"><img loading="lazy" src="${escapeHtml(src)}" alt=""></a><figcaption>${caption}</figcaption></figure>`;
      return `<section class="pair"><h2>${escapeHtml(row.key)}</h2><p>${row.differingPixels} pixels (${percent}%)${escapeHtml(size)}</p>
<div class="triple">${image(row.beforeImage, "before")}${image(row.diffImage, "diff")}${image(row.afterImage, "after")}</div></section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crawl diff</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1b1b;--line:#c9c9c9}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--line:#444}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
a{color:inherit}
.pair{border:1px solid var(--line);padding:8px;margin:0 0 16px;overflow-wrap:anywhere}
.pair h2{font-size:15px;margin:0}
.triple{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}
figure{margin:0}
img{width:100%;height:auto;max-height:520px;object-fit:cover;object-position:top;border:1px solid var(--line)}
</style></head><body>
<h1>Crawl diff</h1>
<p>before ${escapeHtml(beforeLabel)}, after ${escapeHtml(afterLabel)}</p>
<p>${counts.pairs} pairs, ${counts.equal} equal, ${counts.differing} differing, ${counts.onlyBefore} only before, ${counts.onlyAfter} only after</p>
${cards}
</body></html>
`;
}

export function runDiff({ before, after, outDir, threshold }) {
  const { pairs, onlyBefore, onlyAfter } = pairScreenshots(listScreenshots(before), listScreenshots(after));
  const imagesDir = path.join(outDir, "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const differing = [];
  let equal = 0;
  for (const pair of pairs) {
    const beforeBuffer = fs.readFileSync(pair.before);
    const afterBuffer = fs.readFileSync(pair.after);
    const result = compareScreenshots(beforeBuffer, afterBuffer, threshold);
    if (result.equal) {
      equal += 1;
      continue;
    }
    const stem = fileNameForKey(pair.key);
    fs.writeFileSync(path.join(imagesDir, `${stem}.before.png`), beforeBuffer);
    fs.writeFileSync(path.join(imagesDir, `${stem}.after.png`), afterBuffer);
    if (result.diff) fs.writeFileSync(path.join(imagesDir, `${stem}.diff.png`), result.diff);
    differing.push({
      key: pair.key,
      differingPixels: result.differingPixels,
      ratio: result.ratio,
      sizeChanged: result.sizeChanged,
      beforeSize: result.beforeSize,
      afterSize: result.afterSize,
      beforeImage: `images/${stem}.before.png`,
      diffImage: `images/${stem}.diff.png`,
      afterImage: `images/${stem}.after.png`,
    });
  }
  differing.sort((left, right) => right.ratio - left.ratio);
  const counts = { pairs: pairs.length, equal, differing: differing.length, onlyBefore: onlyBefore.length, onlyAfter: onlyAfter.length };
  fs.writeFileSync(
    path.join(outDir, "contact-sheet.html"),
    renderContactSheet({ beforeLabel: before, afterLabel: after, differing, counts }),
  );
  const summary = { before, after, threshold, counts, differing, onlyBefore, onlyAfter };
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const summary = runDiff(options);
  console.log(JSON.stringify(summary.counts));
  console.log(`Wrote ${path.join(options.outDir, "contact-sheet.html")} and summary.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
