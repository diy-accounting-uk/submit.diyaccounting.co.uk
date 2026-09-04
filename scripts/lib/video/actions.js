// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/actions.js
//
// Action dispatch for a scene script's steps — design section 3.3. Resolves a step's `target`
// (CSS selector, {role,name}, or {text}) to a Playwright locator, drives the real page
// interaction, and drives the matching overlay cue. A missing target is a hard failure: the
// error names the scene, the step index and the target, and a still of the failing viewport is
// written to stills/FAILED-<scene>-<step>.png before it throws — the repo rule is throw, don't
// skip, and a silently skipped step is a video that quietly shows the wrong thing.
//
// Steps with no page-level action of their own ("caption" beyond showing the overlay text,
// "hold", "still") are orchestrated directly by site-video-capture.js, which owns pacing.

import fs from "fs";
import path from "path";
import * as overlay from "./overlay.js";

export class SceneStepError extends Error {
  constructor(message, { sceneId, stepIndex, target }) {
    super(message);
    this.name = "SceneStepError";
    this.sceneId = sceneId;
    this.stepIndex = stepIndex;
    this.target = target;
  }
}

export function resolveTarget(page, target) {
  if (typeof target === "string") return page.locator(target).first();
  if (target && typeof target === "object") {
    if ("role" in target) return page.getByRole(target.role, { name: target.name }).first();
    if ("text" in target) return page.getByText(target.text, { exact: false }).first();
  }
  throw new Error(`resolveTarget: unrecognised target shape ${JSON.stringify(target)}`);
}

async function writeFailureStill(page, ctx) {
  try {
    fs.mkdirSync(ctx.stillsDir, { recursive: true });
    const stillPath = path.join(ctx.stillsDir, `FAILED-${ctx.sceneId}-${ctx.stepIndex}.png`);
    await page.screenshot({ path: stillPath });
  } catch {
    // Best-effort: a failure writing the diagnostic still must not mask the real error below.
  }
}

async function requireLocator(page, step, ctx) {
  const locator = resolveTarget(page, step.target);
  const count = await locator.count();
  if (count === 0) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (${step.action}): target not found: ${JSON.stringify(step.target)}`,
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: step.target },
    );
  }
  await locator.scrollIntoViewIfNeeded();
  return locator;
}

async function pointAndReturnRect(page, locator) {
  const rect = await overlay.rectOf(locator);
  await overlay.pointTo(page, rect.left + rect.width / 2, rect.top + rect.height / 2);
  return rect;
}

async function doGoto(page, step, ctx) {
  const url = new URL(step.url, ctx.baseUrl).toString();
  if (step.delayRoutePattern) {
    await page.route(step.delayRoutePattern, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, step.delayRouteMs));
      await route.continue();
    });
  }
  const start = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (step.waitFor) {
    await page.waitForSelector(step.waitFor, { state: "visible", timeout: ctx.timeoutMs });
  }
  const waitMs = Date.now() - start;
  // Deliberately not unrouted here: the delayed request this targets (e.g. a page script's own
  // fetch call) is often dispatched slightly after `waitFor`'s selector already resolves, so an
  // unroute this early can race ahead of the request it exists to delay and remove the handler
  // before it ever matches. It stays registered for the rest of the page's session, which is
  // fine for its one purpose — rehearsing the timer overlay locally, never used in a tour script.
  return { waitMs, rect: null };
}

async function doClick(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator);
  await overlay.click(page, rect);
  const start = Date.now();
  await locator.click();
  return { waitMs: Date.now() - start, rect };
}

async function doPoint(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator);
  if (step.dwellMs) await new Promise((resolve) => setTimeout(resolve, step.dwellMs));
  return { waitMs: 0, rect };
}

async function doType(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator);
  const totalTypingMs = step.text.length * ctx.pacing.perCharMs;
  await overlay.highlight(page, rect, totalTypingMs + 200);
  if (step.clear) await locator.fill("");
  await locator.click();
  for (const char of step.text) {
    await page.keyboard.type(char);
    await overlay.typeChar(page, rect);
    await new Promise((resolve) => setTimeout(resolve, ctx.pacing.perCharMs));
  }
  return { waitMs: 0, rect };
}

async function doPress(page, step) {
  await page.keyboard.press(step.key);
  return { waitMs: 0, rect: null };
}

async function doTab(page) {
  await page.keyboard.press("Tab");
  return { waitMs: 0, rect: null };
}

async function doSelect(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator);
  await overlay.highlight(page, rect, 400);
  await locator.selectOption(step.value);
  return { waitMs: 0, rect };
}

async function doScroll(page, step, ctx) {
  let targetY;
  if (step.target) {
    const locator = resolveTarget(page, step.target);
    const count = await locator.count();
    if (count === 0) {
      await writeFailureStill(page, ctx);
      throw new SceneStepError(
        `scene "${ctx.sceneId}" step ${ctx.stepIndex} (scroll): target not found: ${JSON.stringify(step.target)}`,
        { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: step.target },
      );
    }
    const box = await locator.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { top: window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2 };
    });
    targetY = Math.max(0, box.top);
  } else if (step.to === "top") {
    targetY = 0;
  } else if (step.to === "bottom") {
    targetY = await page.evaluate(() => document.documentElement.scrollHeight);
  } else {
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (scroll): needs "target" or "to"`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: null,
    });
  }
  const currentX = await page.evaluate(() => window.scrollX);
  await overlay.scrollTo(page, currentX, targetY, step.durationMs || ctx.pacing.aroundMotionMs);
  return { waitMs: 0, rect: null };
}

async function doHighlight(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator);
  const holdMs = step.holdMs ?? 1000;
  await overlay.highlight(page, rect, holdMs);
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  return { waitMs: 0, rect };
}

async function doAwait(page, step, ctx) {
  const locator = page.locator(step.until).first();
  const start = Date.now();
  try {
    await locator.waitFor({ state: "visible", timeout: step.timeoutMs || 30000 });
  } catch (err) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (await): "${step.until}" never appeared (${err.message})`,
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: step.until },
    );
  }
  return { waitMs: Date.now() - start, rect: null };
}

const HANDLERS = {
  goto: doGoto,
  click: doClick,
  point: doPoint,
  type: doType,
  press: doPress,
  tab: doTab,
  select: doSelect,
  scroll: doScroll,
  highlight: doHighlight,
  await: doAwait,
};

// Returns { waitMs, rect }. waitMs is the measured backend wait for pacing's wait subtraction
// (design section 4.2); rect is the last-touched element's bounding box, for callers that show a
// caption anchored near the action. Steps with no page action of their own ("caption", "hold",
// "still") are not handled here — the orchestrator drives those directly.
export async function executeAction(page, step, ctx) {
  const handler = HANDLERS[step.action];
  if (!handler) {
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex}: no action handler for "${step.action}"`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: step.target ?? null,
    });
  }
  return handler(page, step, ctx);
}
