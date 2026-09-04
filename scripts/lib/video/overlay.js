// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/overlay.js
//
// Node-side wrapper around scripts/lib/video/overlay-runtime.js — design section 5.1. The
// runtime is read as text once and installed with `page.addInitScript`, so it runs before page
// scripts on every navigation and survives the tour's page loads without reinstalling (the old
// attempt's `addStyleTag` after load did not).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = fs.readFileSync(path.join(__dirname, "overlay-runtime.js"), "utf8");

export async function installOverlay(page) {
  await page.addInitScript({ content: runtimeSource });
}

export async function svcCall(page, method, ...args) {
  return page.evaluate(
    ([m, a]) => window.__svc[m](...a),
    [method, args],
  );
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

export async function caption(page, text) {
  return svcCall(page, "caption", text);
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
