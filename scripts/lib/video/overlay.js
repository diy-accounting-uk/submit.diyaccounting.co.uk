// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/overlay.js
//
// Node-side wrapper around scripts/lib/video/overlay-runtime.js — design section 5.1. The
// runtime is read as text once and installed with `page.addInitScript`, so it runs before page
// scripts on every navigation and survives the tour's page loads without reinstalling (the old
// attempt's `addStyleTag` after load did not).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_HEADLINE_CONFIG, placeHeadline } from "./headlinePlacement.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = fs.readFileSync(path.join(__dirname, "overlay-runtime.js"), "utf8");

const HEADLINE_PADDING_WIDTH = 44;
const HEADLINE_CHAR_WIDTH = 17;
const HEADLINE_CONTROL_SELECTOR = "input, select, textarea, button, a[href]";
const HEADLINE_TEXT_SELECTOR = "label, legend, h1, h2, h3, h4, th, td, p, li";
const HEADLINE_GROUP_SELECTOR = ".form-group, fieldset";

export async function installOverlay(page) {
  await page.addInitScript({ content: runtimeSource });
}

function isExecutionContextDestroyed(err) {
  return err instanceof Error && /Execution context was destroyed/.test(err.message);
}

// A step whose own action navigates (or whose predecessor's did) can still have its overlay
// call in flight against the document being torn down — the "Execution context was destroyed"
// Playwright throws when evaluate races a navigation. Caught here rather than upstream, since
// every overlay call (caption, headline, chapter, click, ...) shares this one path down into
// the page. One retry, after the new document reaches its own load state: overlay-runtime.js
// reinstalls window.__svc via addInitScript on every navigation, so the retry lands once that
// document is ready rather than racing it a second time. Any other error, or a second failure
// on the retry itself, still throws — the repo rule is throw, don't skip.
export async function svcCall(page, method, ...args) {
  try {
    return await page.evaluate(([m, a]) => window.__svc[m](...a), [method, args]);
  } catch (err) {
    if (!isExecutionContextDestroyed(err)) throw err;
    await page.waitForLoadState("domcontentloaded");
    return page.evaluate(([m, a]) => window.__svc[m](...a), [method, args]);
  }
}

export async function pointTo(page, x, y) {
  return svcCall(page, "pointTo", x, y);
}

export async function click(page, rect) {
  return svcCall(page, "click", rect);
}

export async function highlight(page, rect, holdMs) {
  return svcCall(page, "highlight", rect, holdMs);
}

export async function typeChar(page, rect) {
  return svcCall(page, "typeChar", rect);
}

// rect is the step's target box (or null for a step with no target); viewport is the script's
// own {width, height}. The placement — clear of rect, above or below it, inside the frame — is
// computed here in Node (headlinePlacement.js, unit-tested) rather than in overlay-runtime.js,
// which is a self-contained browser-side IIFE with no imports and so cannot be tested directly.
export async function headline(page, text, keyWord, rect, viewport) {
  if (!text) return svcCall(page, "headline", null, null, null);
  if (!rect) return svcCall(page, "headline", text, keyWord || null, placeHeadline(null, viewport));
  const { subject, obstacles } = await probeAroundTarget(page, rect);
  const width = Math.min(DEFAULT_HEADLINE_CONFIG.maxWidth, HEADLINE_PADDING_WIDTH + text.length * HEADLINE_CHAR_WIDTH);
  const placement = placeHeadline(subject, viewport, { ...DEFAULT_HEADLINE_CONFIG, width }, obstacles);
  return svcCall(page, "headline", text, keyWord || null, placement);
}

// What a tag must keep off: the target joined with the field group it belongs to (label, hint,
// control), and the page content near it, each box weighted by how much hiding it costs.
// Controls count more than text.
async function probeAroundTarget(page, rect) {
  const probe = ([box, controlSelector, textSelector, groupSelector]) => {
    const overlayRoot = document.getElementById("svc-overlay");
    const seen = (el) => !overlayRoot.contains(el);
    const boxOf = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const group = centre ? centre.closest(groupSelector) : null;
    let subject = box;
    if (group) {
      const g = boxOf(group);
      const left = Math.min(subject.left, g.left);
      const top = Math.min(subject.top, g.top);
      subject = {
        left,
        top,
        width: Math.max(subject.left + subject.width, g.left + g.width) - left,
        height: Math.max(subject.top + subject.height, g.top + g.height) - top,
      };
    }
    const obstacles = [];
    const collect = (selector, weight) => {
      for (const el of document.querySelectorAll(selector)) {
        if (!seen(el) || (group && group.contains(el))) continue;
        const b = boxOf(el);
        if (b.width === 0 || b.height === 0 || b.top > window.innerHeight || b.top + b.height < 0) continue;
        obstacles.push({ ...b, weight });
      }
    };
    collect(textSelector, 1);
    collect(controlSelector, 4);
    return { subject, obstacles };
  };
  const args = [rect, HEADLINE_CONTROL_SELECTOR, HEADLINE_TEXT_SELECTOR, HEADLINE_GROUP_SELECTOR];
  try {
    return await page.evaluate(probe, args);
  } catch (err) {
    if (!isExecutionContextDestroyed(err)) throw err;
    await page.waitForLoadState("domcontentloaded");
    return page.evaluate(probe, args);
  }
}

export async function chapter(page, text) {
  return svcCall(page, "chapter", text);
}

export async function timerStart(page, label, fullScaleMs) {
  return svcCall(page, "timerStart", label, fullScaleMs);
}

export async function timerSetCompressing(page, active) {
  return svcCall(page, "timerSetCompressing", active);
}

export async function timerStop(page) {
  return svcCall(page, "timerStop");
}

export async function scrollTo(page, x, y, durationMs) {
  return svcCall(page, "scrollTo", x, y, durationMs);
}

export async function suppress(page, selectors) {
  return svcCall(page, "suppress", selectors);
}

export async function mark(page, name, detail) {
  return svcCall(page, "mark", name, detail);
}

export async function readEvents(page) {
  return page.evaluate(() => window.__svc.events);
}

// Bounding box for a Playwright locator, in the shape the runtime's click/highlight/typeChar
// expect. Throws with the locator's own message when nothing matches — the repo rule is throw,
// don't skip, and actions.js turns this into the scene/step/target failure message.
export async function rectOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box (not visible or not in the DOM)");
  return { left: box.x, top: box.y, width: box.width, height: box.height };
}
