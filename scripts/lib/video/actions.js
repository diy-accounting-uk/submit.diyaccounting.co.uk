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
import { substituteValues } from "./values.js";

// The journey actions (login, consent, ensureBundle, hmrcAuthorise) run the behaviour tests' own
// step functions. Loading that bridge registers a process-wide module resolution hook and pulls
// in the app's data layer, so an unauthenticated script never pays for it: the import happens the
// first time a journey action actually runs.
let behaviourStepsModule = null;
function behaviourSteps() {
  if (!behaviourStepsModule) behaviourStepsModule = import("./behaviourSteps.js");
  return behaviourStepsModule;
}

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
  // A goto's own wait is the navigation itself, with nothing on screen to animate first, so the
  // whole body is the wait phase.
  await ctx.waitPhase(async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (step.waitFor) {
      await page.waitForSelector(step.waitFor, { state: "visible", timeout: ctx.timeoutMs });
    }
  });
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
  // The pointer animation and the ripple above already took at least 450ms of on-screen motion;
  // the wait phase brackets only the click itself, or the pill would arm during that motion
  // rather than during an actual wait on the site.
  const start = Date.now();
  await ctx.waitPhase(() => locator.click());
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
  const text = substituteValues(step.text, ctx.values, ctx.now);
  const totalTypingMs = text.length * ctx.pacing.perCharMs;
  await overlay.highlight(page, rect, totalTypingMs + 200);
  if (step.clear) await locator.fill("");
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await overlay.typeChar(page, rect);
    await new Promise((resolve) => setTimeout(resolve, ctx.pacing.perCharMs));
  }
  return { waitMs: 0, rect };
}

// A date picker and a masked field take their value whole: typing "2026-08-01" into a date input
// lands digit by digit in the browser's own segment order and produces a different date. The
// pointer moves to the field and the highlight fires as usual, so it still reads as a person
// filling the form in.
async function doFill(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator);
  const value = substituteValues(step.value, ctx.values, ctx.now);
  const holdMs = step.holdMs ?? 600;
  await overlay.highlight(page, rect, holdMs);
  await locator.fill(value);
  await new Promise((resolve) => setTimeout(resolve, holdMs));
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
    await ctx.waitPhase(() => locator.waitFor({ state: "visible", timeout: step.timeoutMs || 30000 }));
  } catch (err) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (await): "${step.until}" never appeared (${err.message})`,
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: step.until },
    );
  }
  return { waitMs: Date.now() - start, rect: null };
}

function requireJourney(step, ctx) {
  if (!ctx.journey) {
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (${step.action}): the run has no signed-in journey context`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: null,
    });
  }
  return ctx.journey;
}

// The identity provider comes from the run, not the script. Credentials are typed by the
// behaviour test's own step function, so they never appear in the scene script, the timeline or
// the transcript.
async function doLogin(page, step, ctx) {
  const steps = await behaviourSteps();
  const journey = requireJourney(step, ctx);
  const start = Date.now();
  // Entering credentials is on-camera content, a person filling in a form, not a wait. Only the
  // round trip back to the app once they are submitted has nothing to show on screen.
  await steps.loginWithCognitoOrMockAuth(page, journey.authProvider, journey.authUsername, ctx.stepScreenshotDir, journey.authPassword);
  await ctx.waitPhase(() => steps.verifyLoggedInStatus(page, ctx.stepScreenshotDir));
  return { waitMs: Date.now() - start, rect: null };
}

async function doConsent(page, step, ctx) {
  const steps = await behaviourSteps();
  const start = Date.now();
  await ctx.waitPhase(() => steps.consentToDataCollection(page, ctx.stepScreenshotDir));
  return { waitMs: Date.now() - start, rect: null };
}

async function doEnsureBundle(page, step, ctx) {
  const steps = await behaviourSteps();
  const start = Date.now();
  // The whole call is the pass-granting round trip (create pass, redeem, poll for allocation) —
  // there is no on-camera interaction ahead of it to protect the pill from.
  await ctx.waitPhase(() =>
    steps.ensureBundlePresent(page, step.bundle, ctx.stepScreenshotDir, {
      testPass: step.testPass === true,
      isHidden: step.hidden === true,
    }),
  );
  return { waitMs: Date.now() - start, rect: null };
}

// HMRC's own authorise pages: cookies, continue, sign in, grant permission, back to the app. The
// step waits for the browser to leave the site's origin first, because the click that triggers
// the redirect is a separate scene step and returns as soon as the click lands.
async function doHmrcAuthorise(page, step, ctx) {
  const steps = await behaviourSteps();
  const journey = requireJourney(step, ctx);
  const appOrigin = new URL(ctx.baseUrl).origin;
  const start = Date.now();
  try {
    // Only this redirect is a wait with nothing on screen yet. The behaviour steps that follow
    // put HMRC's own pages on camera — a person signing in and granting access, not a wait.
    await ctx.waitPhase(() => page.waitForURL((url) => new URL(url).origin !== appOrigin, { timeout: step.timeoutMs || ctx.timeoutMs }));
  } catch (err) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (hmrcAuthorise): the browser stayed on ${appOrigin}, so HMRC never asked for authority. ` +
        `A run whose account already holds an HMRC token skips the authorise pages; record with an account that has not granted authority yet (${err.message})`,
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: null },
    );
  }
  await steps.acceptCookiesHmrc(page, ctx.stepScreenshotDir);
  await steps.goToHmrcAuth(page, ctx.stepScreenshotDir);
  await steps.initHmrcAuth(page, ctx.stepScreenshotDir);
  await steps.fillInHmrcAuth(page, journey.hmrcUser.username, journey.hmrcUser.password, ctx.stepScreenshotDir);
  await steps.submitHmrcAuth(page, ctx.stepScreenshotDir);
  await steps.grantPermissionHmrcAuth(page, ctx.stepScreenshotDir);
  return { waitMs: Date.now() - start, rect: null };
}

const HANDLERS = {
  goto: doGoto,
  click: doClick,
  point: doPoint,
  type: doType,
  fill: doFill,
  press: doPress,
  tab: doTab,
  select: doSelect,
  scroll: doScroll,
  highlight: doHighlight,
  await: doAwait,
  login: doLogin,
  consent: doConsent,
  ensureBundle: doEnsureBundle,
  hmrcAuthorise: doHmrcAuthorise,
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
