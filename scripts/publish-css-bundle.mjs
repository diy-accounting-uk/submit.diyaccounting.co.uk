#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-162 Bundle submit.css at publish time
// - **Use when:** a deployed web root must serve one stylesheet in place of the @import list in submit.css.
// - **Does:** publish-css-bundle.mjs replaces the @import list in a web root's submit.css with the imported files, in order, and rewrites relative url() references to resolve from submit.css's directory. The source files stay as they are, so local development and the tests serve the @import form.
// - **Run:** `node scripts/publish-css-bundle.mjs <web-root>`
// - **Entry:** `scripts/publish-css-bundle.mjs`
// - **Files:** scripts/publish-css-bundle.mjs, app/unit-tests/scripts/publishCssBundle.test.js, scripts/deploy-app.js, .github/workflows/deploy-app.yml, .github/workflows/deploy-stacks.yml
// - **Keywords:** css bundle, submit.css, import chain, first paint, publish step
// - **Related:** OPS-143
// @end-capability

// Replaces the @import list in a web root's submit.css with the imported files, in order, so a
// page loads one stylesheet instead of one stylesheet and then 37 more after it. The source files
// under web/public/css stay as they are, and local development and the tests still serve the
// @import form. Relative url() references are rewritten to resolve from submit.css's directory.
// Usage: node scripts/publish-css-bundle.mjs <web-root>   (the deploy workflows and deploy-app.js)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IMPORT_RULE = /^@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;[ \t]*\n?/gm;
const URL_REFERENCE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]+))\s*\)/g;

/**
 * @param {string} cssText the text of an imported file
 * @param {string} importDirectory the directory of that file, relative to the stylesheet that imports it, in posix form
 * @returns {string} the text with each relative url() rewritten to resolve from the importing stylesheet's directory
 */
export function rebaseUrls(cssText, importDirectory) {
  return cssText.replace(URL_REFERENCE, (whole, doubleQuoted, singleQuoted, bare) => {
    const reference = doubleQuoted ?? singleQuoted ?? bare;
    if (/^(data:|https?:|\/|#)/i.test(reference)) return whole;
    return `url("${posix.normalize(posix.join(importDirectory, reference))}")`;
  });
}

/**
 * @param {string} entryText the text of the entry stylesheet
 * @param {(importPath: string) => string} readImported the text of an imported file, by the path its @import names
 * @returns {string} the entry text with each @import rule replaced by the imported file's rebased text
 */
export function bundleImports(entryText, readImported) {
  return entryText.replace(IMPORT_RULE, (_whole, importPath) => {
    const text = readImported(importPath);
    return `/* ${importPath} */\n${rebaseUrls(text, posix.dirname(importPath))}\n`;
  });
}

/**
 * @param {string} webRoot directory whose contents are served at the site root
 * @returns {string} the path written
 */
export function publishCssBundle(webRoot) {
  const entryPath = join(webRoot, "submit.css");
  const bundled = bundleImports(readFileSync(entryPath, "utf8"), (importPath) => readFileSync(join(webRoot, importPath), "utf8"));
  if (/@import/.test(bundled.replace(/\/\*[\s\S]*?\*\//g, ""))) throw new Error("submit.css still holds an @import after bundling");
  writeFileSync(entryPath, bundled);
  return entryPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webRoot = process.argv[2];
  if (!webRoot) {
    console.error("Usage: node scripts/publish-css-bundle.mjs <web-root>");
    process.exit(1);
  }
  console.log(`Bundled ${publishCssBundle(webRoot)}`);
}
