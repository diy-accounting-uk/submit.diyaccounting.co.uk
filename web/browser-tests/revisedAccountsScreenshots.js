// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/revisedAccountsScreenshots.js
// Screenshots of the revised accounts journey at the desktop and phone widths, for the look pass.

import fs from "fs";
import path from "path";

const DIRECTORY = path.join(process.cwd(), "target/screenshots/revised-accounts");

export async function screenshotAtBothWidths(page, state) {
  fs.mkdirSync(DIRECTORY, { recursive: true });
  // The consent banner the test leaves unanswered and the focus it leaves behind are not part of any state.
  await page.evaluate(() => {
    document.getElementById("consent-banner")?.remove();
    document.activeElement?.blur();
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(DIRECTORY, `${state}-${width}.png`), fullPage: true });
  }
}
