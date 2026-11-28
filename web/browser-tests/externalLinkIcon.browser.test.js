// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/externalLinkIcon.browser.test.js
// A link that opens in a new tab carries the external-link icon, and the full stop after it stays on
// the line of the link's last word, at whatever width the sentence wraps.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

test("the full stop after an external link never wraps onto a line of its own", async ({ page }) => {
  await serveRealSite(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${SITE_ORIGIN}/accessibility.html`, { waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "Equality Advisory Support Service (EASS)" });
  await expect(link).toBeVisible();

  const result = await link.evaluate((anchor) => {
    const icon = getComputedStyle(anchor, "::after");
    const paragraph = anchor.parentElement;
    const stop = anchor.nextSibling;
    const lineTop = (node, start, end) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = [...range.getClientRects()];
      return Math.round(rects[rects.length - 1].top);
    };
    const lastText = [...anchor.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).pop();
    const lonelyAt = [];
    for (let width = 160; width <= 760; width += 2) {
      paragraph.style.width = `${width}px`;
      const wordTop = lineTop(lastText, lastText.textContent.trimEnd().length - 1, lastText.textContent.trimEnd().length);
      const stopTop = lineTop(stop, stop.textContent.indexOf("."), stop.textContent.indexOf(".") + 1);
      if (stopTop !== wordTop) lonelyAt.push(width);
    }
    paragraph.style.width = "";
    return { hasMask: icon.maskImage !== "none", lonelyAt };
  });

  expect(result.hasMask).toBe(true);
  expect(result.lonelyAt).toEqual([]);
});
