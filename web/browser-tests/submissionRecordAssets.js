// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submissionRecordAssets.js
// Serves the real submission-record stylesheet, helper and VAT record module from disk to a page
// whose other scripts are stubbed out. Register it after the "**/*.js" stub: Playwright tries the
// most recently registered route first.

import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");

function serveFile(page, pattern, relativePath, contentType) {
  return page.route(pattern, async (route) => {
    await route.fulfill({ status: 200, contentType, body: fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8") });
  });
}

export async function serveSubmissionRecordAssets(page) {
  await serveFile(page, "**/submission-record.css", "submission-record.css", "text/css");
  await serveFile(page, "**/lib/submission-record.js", "lib/submission-record.js", "application/javascript");
  await serveFile(page, "**/lib/vat-return-record.js", "lib/vat-return-record.js", "application/javascript");
  await serveFile(page, "**/lib/hmrc-display-format.js", "lib/hmrc-display-format.js", "application/javascript");
}

// The helpers and stylesheet of the record a filing page shows after the authority answers.
export async function serveFilingResultAssets(page) {
  await serveFile(page, "**/submission-record.css", "submission-record.css", "text/css");
  for (const library of ["submission-record.js", "filing-record.js", "filing-result-record.js", "ct600-fields.js"]) {
    await serveFile(page, `**/lib/${library}`, `lib/${library}`, "application/javascript");
  }
}

export function recordScreenshotPath(name, width) {
  return path.join(process.cwd(), "target/browser-test-results/submission-records", `${name}-${width}.png`);
}

// True when the page scrolls sideways: the page itself, not a sheet that scrolls inside itself.
export async function pageScrollsSideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
