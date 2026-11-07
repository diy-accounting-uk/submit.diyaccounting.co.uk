// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/build-og-pass.mjs
// Renders two 1200x630 preview images in web/public/images/social/: og-pass.png (the week offer card of
// bundles.html) and og-pass-link.png (the neutral card of pass.html, true for every pass).
// Run: node scripts/build-og-pass.mjs

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const socialDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../web/public/images/social");

const baseStyle = `
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { box-sizing: border-box; padding: 56px 64px; background: #2a59a0; color: #fff;
    font-family: "Helvetica Neue", Arial, sans-serif; display: flex; flex-direction: column; justify-content: space-between; }
  .brand { font-size: 30px; font-weight: 700; }
  h1 { font-size: 84px; line-height: 1.05; margin: 0; font-weight: 800; }
  .offer { display: inline-block; background: #fff; color: #1d3f73; font-size: 40px; font-weight: 800;
    padding: 18px 32px; border-radius: 14px; }
  .terms { font-size: 30px; margin: 18px 0 0; }
  .url { font-size: 28px; font-weight: 700; }
`;

const page = (body) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${baseStyle}</style></head><body>
  <div class="brand">DIY Accounting Submit™</div>
${body}
  <div class="url">submit.diyaccounting.co.uk</div>
</body></html>`;

const cards = [
  {
    file: "og-pass.png",
    html: page(`  <div>
    <h1>VAT returns to HMRC<br>for 99p a month</h1>
  </div>
  <div>
    <span class="offer">Try 3 VAT returns free for 7 days</span>
    <p class="terms">Then £0.99 a month or £9.99 a year. Cancel any time.</p>
  </div>`),
  },
  {
    file: "og-pass-link.png",
    html: page(`  <div>
    <h1>You have a pass for<br>DIY Accounting Submit</h1>
  </div>
  <div>
    <p class="terms">Open this link to see what your pass gives you, and add it to your account.</p>
  </div>`),
  },
];

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const card of cards) {
  const outputPath = path.join(socialDir, card.file);
  await tab.setContent(card.html);
  await tab.screenshot({ path: outputPath, type: "png" });
  console.log(`Wrote ${outputPath}`);
}
await browser.close();
