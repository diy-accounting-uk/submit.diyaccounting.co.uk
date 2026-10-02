#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/collabora-sheet-spike.js
//
// Proves the spreadsheet video's mechanics against a running scripts/collabora-sheet-host.js:
// opens the Basic Sole Trader workbook in Collabora, enters the accounting video's three sales
// and two purchases, and reads the profit back off the Profit & Loss sheet. Writes stills and a
// webm recording to --out, and exits non-zero unless net profit reads 1200.
//
// Usage: node scripts/collabora-sheet-spike.js [--url http://localhost:8099/] [--out target/collabora-spike] [--scale 2]

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { waitForWorkbook, prepareWorkbook, goToCell, cellCursorRect, enterRow, readNumber } from "./lib/video/collabora.js";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const url = option("--url", "http://localhost:8099/");
const out = path.resolve(option("--out", "target/collabora-spike"));
const deviceScaleFactor = Number(option("--scale", "1"));
fs.mkdirSync(out, { recursive: true });

const PROFIT_AND_LOSS = "$'Profit & Loss Acc'";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor,
  recordVideo: { dir: out, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const still = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

await page.goto(url);
await waitForWorkbook(page);
await prepareWorkbook(page);

const before = await readNumber(page, `${PROFIT_AND_LOSS}.C24`);
await still("1-profit-before");

await page.locator("#spreadsheet-tab8").click();
await goToCell(page, "$SalesApr.A4");
await enterRow(page, ["10/04/2026", "Lawn and hedges, 12 Oak Road", "", "Bank", "", "500"]);
await goToCell(page, "$SalesApr.A5");
await enterRow(page, ["24/04/2026", "Garden tidy, 3 Mill Lane", "", "Bank", "", "300"]);
await goToCell(page, "$SalesApr.F4");
const rect = await cellCursorRect(page);
await page.evaluate((r) => {
  const box = document.createElement("div");
  box.id = "spike-rect";
  Object.assign(box.style, {
    position: "fixed",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    outline: "3px solid red",
    zIndex: 99999,
    pointerEvents: "none",
  });
  document.body.appendChild(box);
}, rect);
await still("2-sales-april");
await page.evaluate(() => document.getElementById("spike-rect")?.remove());

await page.locator("#spreadsheet-tab9").click();
await goToCell(page, "$PurchasesApr.A5");
await enterRow(page, ["15/04/2026", "Plants and compost", "", "Bank", "s", "", "200"]);
await still("3-purchases-april");

await goToCell(page, "$SalesMay.A4");
await enterRow(page, ["08/05/2026", "New border, 7 Elm Close", "", "Bank", "", "700"]);
await goToCell(page, "$PurchasesMay.A5");
await enterRow(page, ["12/05/2026", "Leaflets", "", "Bank", "a", "", "100"]);
await still("4-purchases-may");

const reads = {};
for (const cell of ["C4", "C6", "C17", "C22", "D24", "E24", "C24"]) reads[cell] = await readNumber(page, `${PROFIT_AND_LOSS}.${cell}`);
await goToCell(page, `${PROFIT_AND_LOSS}.C24`);
await page.waitForTimeout(1000);
await still("5-profit-after");

await context.close();
await browser.close();
console.log(JSON.stringify({ before, after: reads, cellRect: rect }, null, 1));
if (reads.C24 !== 1200) {
  console.error(`net profit read ${reads.C24}, expected 1200`);
  process.exit(1);
}
