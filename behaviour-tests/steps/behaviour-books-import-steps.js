// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-books-import-steps.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { writeBookJson } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { takeScreenshot, timestamp } from "../helpers/behaviour-helpers.js";

const fixturesDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../mcp/test/fixtures");

/**
 * Write a fixture book (a directory of book.toml and lines.jsonl) as the single JSON file the
 * "Fill from your books" control reads, and return the file's path.
 */
export function writeFixtureBookFile(fixtureName, outputDirectory) {
  const { book, lines } = loadDiyaGlData(path.join(fixturesDirectory, fixtureName));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const bookFile = path.join(outputDirectory, `${fixtureName}.json`);
  fs.writeFileSync(bookFile, writeBookJson(book, lines), "utf8");
  return bookFile;
}

/**
 * Hand a book file to the form's "Fill from your books" control, as a dropped file does, and
 * wait for the control to report the fill.
 */
export async function dropBookOnForm(page, bookFile, expectedStatus, screenshotPath) {
  await test.step("The user drops a book on Fill from your books and the form fills", async () => {
    await expect(page.locator("#booksImportDrop")).toBeVisible();
    await page.locator("#booksImportFile").setInputFiles(bookFile);
    await expect(page.locator("#booksImportStatus")).toContainText(expectedStatus, { timeout: 30_000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-books-import-filled.png` });
  });
}

/**
 * Let a sandbox filing for a period outside the sandbox's own obligations go through, so a
 * book's real periods can be filed on the synthetic account.
 */
export async function allowSyntheticObligationsOnForm(page) {
  await test.step("The user allows filing against the sandbox's obligations", async () => {
    await page.waitForFunction(() => sessionStorage.getItem("hmrcAccount") === "synthetic", { timeout: 10_000 });
    await page.evaluate(() => {
      sessionStorage.setItem("showDeveloperOptions", "true");
      document.body.classList.add("developer-mode");
      window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled: true } }));
    });
    await expect(page.locator("#developerSection")).toBeVisible({ timeout: 5000 });
    await page.locator("#allowSyntheticObligations").check();
  });
}
