#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 DIY Accounting Limited
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * WCAG 2.2 manual-review support: measures the two criteria that a script
 * can check mechanically across every page.
 *
 * 2.5.8 Target Size (Minimum): every interactive element's bounding box is
 * measured at two viewport widths against the 24x24 CSS px minimum, the
 * spacing exception (24px clearance to the nearest other target), and the
 * inline-text exception (target sits inline within a run of text).
 *
 * 2.4.11 Focus Not Obscured (Minimum): the page is tabbed through from a
 * fresh (no stored consent) state, and each focused element's centre point
 * is compared against document.elementFromPoint to detect a fixed-position
 * overlay (cookie banner, sticky header/footer) sitting on top of it.
 *
 * Usage:
 *   node scripts/wcag22-manual-review.js --url http://localhost:PORT [--output FILE]
 */

import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
};

const baseUrl = getArg("--url", null);
const outputFile = getArg("--output", "target/wcag22-manual-review.json");

if (!baseUrl) {
  console.error("Error: --url is required");
  console.error("Usage: node scripts/wcag22-manual-review.js --url http://localhost:PORT [--output FILE]");
  process.exit(1);
}

// Same 25 pages as scripts/text-spacing-test.js
const PAGES = [
  "/",
  "/about.html",
  "/privacy.html",
  "/terms.html",
  "/accessibility.html",
  "/auth/login.html",
  "/bundles.html",
  "/hmrc/vat/submitVat.html",
  "/hmrc/vat/vatObligations.html",
  "/hmrc/vat/viewVatReturn.html",
  "/hmrc/receipt/receipts.html",
  "/guide.html",
  "/help.html",
  "/mcp.html",
  "/diy-accounting-spreadsheets.html",
  "/diy-accounting-limited.html",
  "/spreadsheets.html",
  "/errors/404-error-distribution.html",
  "/errors/404-error-origin.html",
  "/errors/403.html",
  "/errors/404.html",
  "/errors/500.html",
  "/errors/502.html",
  "/errors/503.html",
  "/errors/504.html",
];

const VIEWPORTS = [
  { width: 1280, height: 800, label: "1280" },
  { width: 375, height: 667, label: "375" },
];

const TARGET_SELECTOR = 'a[href], button, input, select, textarea, [role="button"], [tabindex]';
const MIN_SIZE = 24;
const MAX_TAB_STEPS = 100;

async function measureTargetSizes(page) {
  return await page.evaluate(
    ({ selector, minSize }) => {
      function isRendered(el) {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (el.hasAttribute("disabled")) return false;
        if (el.tabIndex < 0 && el.getAttribute("tabindex") === "-1" && el.tagName !== "A") {
          // negative tabindex still counts as a target if it's a real control (e.g. roving tabindex),
          // but skip pure programmatic sinks with no visible box.
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function isInlineInText(el) {
        const style = window.getComputedStyle(el);
        if (style.display !== "inline") return false;
        const parent = el.parentElement;
        if (!parent) return false;
        // Exempt when the element sits among sibling text nodes carrying real words
        // (e.g. an inline <a> inside a sentence in a <p> or <li>).
        for (const node of parent.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return true;
        }
        return false;
      }

      const els = Array.from(document.querySelectorAll(selector)).filter(isRendered);
      const rects = els.map((el) => el.getBoundingClientRect());

      function selectorFor(el) {
        let s = el.tagName.toLowerCase();
        if (el.id) s += `#${el.id}`;
        else if (el.className && typeof el.className === "string" && el.className.trim()) {
          s += `.${el.className.trim().split(/\s+/).join(".")}`;
        }
        const text = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().substring(0, 40);
        return text ? `${s} "${text}"` : s;
      }

      function gapBetween(a, b) {
        const dx = Math.max(a.left - b.right, b.left - a.right, 0);
        const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
        if (dx === 0 && dy === 0) return 0; // overlapping or touching
        return Math.sqrt(dx * dx + dy * dy);
      }

      const results = [];
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const rect = rects[i];
        const meetsMinimum = rect.width >= minSize && rect.height >= minSize;
        const inline = !meetsMinimum && isInlineInText(el);

        let minGap = Infinity;
        if (!meetsMinimum && !inline) {
          for (let j = 0; j < els.length; j++) {
            if (i === j) continue;
            const gap = gapBetween(rect, rects[j]);
            if (gap < minGap) minGap = gap;
          }
        }
        const spacingException = !meetsMinimum && !inline && minGap >= minSize;
        const pass = meetsMinimum || inline || spacingException;

        results.push({
          selector: selectorFor(el),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          pass,
          reason: meetsMinimum ? "meets-minimum" : inline ? "inline-text-exception" : spacingException ? "spacing-exception" : "fail",
          nearestGap: Number.isFinite(minGap) ? Math.round(minGap * 10) / 10 : null,
        });
      }
      return results;
    },
    { selector: TARGET_SELECTOR, minSize: MIN_SIZE },
  );
}

async function tabThroughAndCheckFocus(page) {
  const violations = [];
  const visited = [];
  await page.evaluate(() => document.body.focus());

  let lastSelector = null;
  let repeatCount = 0;

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;

      function selectorFor(node) {
        let s = node.tagName.toLowerCase();
        if (node.id) s += `#${node.id}`;
        const text = (node.textContent || node.getAttribute("aria-label") || "").trim().substring(0, 40);
        return text ? `${s} "${text}"` : s;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return { selector: selectorFor(el), obscured: false, skipped: true };
      }

      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const atPoint = document.elementFromPoint(cx, cy);

      const isSameOrDescendant = atPoint && (atPoint === el || el.contains(atPoint) || atPoint.contains(el));
      if (isSameOrDescendant) {
        return { selector: selectorFor(el), obscured: false };
      }

      // Only in-viewport centre points count: off-screen (e.g. skip link
      // targets scrolled out) aren't a focus-obscuring case.
      if (cy < 0 || cy > window.innerHeight || cx < 0 || cx > window.innerWidth) {
        return { selector: selectorFor(el), obscured: false, offscreen: true };
      }

      let coveringSelector = atPoint ? selectorFor(atPoint) : "(nothing)";
      let coveringPosition = null;
      let node = atPoint;
      while (node && node !== document.body) {
        const pos = window.getComputedStyle(node).position;
        if (pos === "fixed" || pos === "sticky") {
          coveringPosition = pos;
          coveringSelector = selectorFor(node);
          break;
        }
        node = node.parentElement;
      }

      return {
        selector: selectorFor(el),
        obscured: true,
        coveringSelector,
        coveringPosition,
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
      };
    });

    if (!info) break; // wrapped back to body / nothing focusable left
    visited.push(info.selector);
    if (info.obscured) violations.push(info);

    if (info.selector === lastSelector) {
      repeatCount++;
      if (repeatCount > 2) break; // stuck on the same element
    } else {
      repeatCount = 0;
      lastSelector = info.selector;
    }
  }

  return { visited, violations };
}

async function main() {
  console.log("WCAG 2.2 manual review support (2.5.8 Target Size, 2.4.11 Focus Not Obscured)");
  console.log("================================================================================");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Output: ${outputFile}`);
  console.log("");

  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--no-sandbox"] });
  const results = {
    testName: "WCAG 2.2 manual review support",
    baseUrl,
    timestamp: new Date().toISOString(),
    pages: [],
    summary: {
      targetSize: { total: 0, pass: 0, fail: 0 },
      focusNotObscured: { total: 0, pass: 0, fail: 0 },
    },
  };

  try {
    for (const pagePath of PAGES) {
      const url = baseUrl.replace(/\/$/, "") + pagePath;
      console.log(`Testing: ${pagePath}`);
      const pageEntry = { path: pagePath, viewports: {} };

      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(400); // let submit.js append the consent banner

          const targetSizes = await measureTargetSizes(page);
          const focus = await tabThroughAndCheckFocus(page);

          pageEntry.viewports[viewport.label] = { targetSizes, focus };

          for (const t of targetSizes) {
            results.summary.targetSize.total++;
            if (t.pass) results.summary.targetSize.pass++;
            else results.summary.targetSize.fail++;
          }
          results.summary.focusNotObscured.total += focus.visited.length;
          results.summary.focusNotObscured.fail += focus.violations.length;
          results.summary.focusNotObscured.pass += focus.visited.length - focus.violations.length;

          const sizeFails = targetSizes.filter((t) => !t.pass);
          if (sizeFails.length || focus.violations.length) {
            console.log(`  [${viewport.label}px] target-size fails: ${sizeFails.length}, focus-obscured: ${focus.violations.length}`);
            for (const f of sizeFails) console.log(`    size: ${f.selector} (${f.width}x${f.height})`);
            for (const v of focus.violations) console.log(`    focus: ${v.selector} covered by ${v.coveringSelector} (${v.coveringPosition})`);
          } else {
            console.log(`  [${viewport.label}px] OK (${targetSizes.length} targets, ${focus.visited.length} tab stops)`);
          }
        } catch (error) {
          pageEntry.viewports[viewport.label] = { error: error.message };
          console.log(`  [${viewport.label}px] ERROR: ${error.message}`);
        } finally {
          await context.close();
        }
      }

      results.pages.push(pageEntry);
    }
  } finally {
    await browser.close();
  }

  const outputPath = join(projectRoot, outputFile);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`Target size: ${results.summary.targetSize.pass}/${results.summary.targetSize.total} pass`);
  console.log(`Focus not obscured: ${results.summary.focusNotObscured.pass}/${results.summary.focusNotObscured.total} pass`);
  console.log(`Written: ${outputFile}`);

  process.exit(results.summary.targetSize.fail || results.summary.focusNotObscured.fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
