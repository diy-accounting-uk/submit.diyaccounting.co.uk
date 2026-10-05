// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
import {
  waitForWorkbook,
  prepareWorkbook,
  setZoom,
  goToCell,
  libreOfficeReference,
  cellCursorRect,
  typeIntoCell,
  pressKey,
} from "./collabora.js";

// The journey actions (login, consent, ensureBundle, hmrcAuthorise) run the behaviour tests' own
// step functions. Loading that bridge registers a process-wide module resolution hook and pulls
// in the app's data layer, so an unauthenticated script never pays for it: the import happens the
// first time a journey action actually runs.
let behaviourStepsModule = null;
function behaviourSteps() {
  if (!behaviourStepsModule) behaviourStepsModule = import("./behaviourSteps.js");
  return behaviourStepsModule;
}

// Behaviour steps write debug screenshots (each with a `path`) that a capture never reads; on CI
// they can hang against the running screencast, so they become no-ops. Methods bind to the real
// page so Playwright's private fields resolve.
export function withoutDebugScreenshots(page) {
  return new Proxy(page, {
    get(target, prop) {
      if (prop === "screenshot") {
        return async (options = {}) => (options && options.path ? undefined : target.screenshot(options));
      }
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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

// onRect, when given, fires once the target's real (post-scroll) box is known and the pointer
// has arrived there — the earliest moment a headline overlay can be placed clear of it, since
// placing one off the rect resolved before requireLocator's scrollIntoViewIfNeeded would anchor
// it to wherever the element used to be, not where the viewer is about to see it acted on.
async function pointAndReturnRect(page, locator, onRect) {
  const rect = await overlay.rectOf(locator);
  await overlay.pointTo(page, rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (onRect) await onRect(rect);
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
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
  await overlay.click(page, rect);
  // The pointer animation and the ripple above already took at least 450ms of on-screen motion;
  // the wait phase brackets only the click itself, or the pill would arm during that motion
  // rather than during an actual wait on the site.
  const start = Date.now();
  await ctx.waitPhase(async () => {
    if (!step.expectsNavigation) {
      await locator.click();
      return;
    }
    // A button whose onclick assigns window.location.href, rather than a real <a href>, has no
    // browser-native navigation to fall back on: Playwright's own click resolves as soon as the
    // event dispatches, which is before the resulting navigation is guaranteed to have started.
    // Racing the click against the URL actually changing turns a dropped or delayed navigation
    // into an immediate, named failure here, instead of a following "await" step timing out
    // minutes later with no clue that the click never left the page.
    const startUrl = page.url();
    await Promise.all([
      page.waitForURL((url) => url.toString() !== startUrl, { timeout: step.timeoutMs || ctx.timeoutMs }),
      locator.click(),
    ]);
  });
  return { waitMs: Date.now() - start, rect };
}

async function doPoint(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
  if (step.dwellMs) await new Promise((resolve) => setTimeout(resolve, step.dwellMs));
  return { waitMs: 0, rect };
}

async function doType(page, step, ctx) {
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
  const text = substituteValues(step.text, ctx.values, ctx.now);
  const totalTypingMs = text.length * ctx.pacing.perCharMs;
  await overlay.highlight(page, rect, totalTypingMs + 200);
  if (step.clear) await locator.fill("");
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    // An off-camera or fast-forward scene types at zero pacing; its keystrokes carry no cadence,
    // so they leave no typeChar event for checkTypingCadence to average in.
    if (ctx.pacing.perCharMs > 0) await overlay.typeChar(page, rect);
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
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
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
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
  await overlay.highlight(page, rect, 400);
  await locator.selectOption(step.value);
  return { waitMs: 0, rect };
}

const MIME_TYPES = {
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

// Finds the file input a drop target stands for: the target itself, the control of a label, or a
// descendant. Returns null when the target has no file input, so the caller dispatches a drop.
async function fileInputFor(page, locator) {
  const isFileInput = await locator.evaluate((el) => el instanceof HTMLInputElement && el.type === "file");
  if (isFileInput) return locator;
  const labelledId = await locator.evaluate((el) =>
    el instanceof HTMLLabelElement && el.control instanceof HTMLInputElement && el.control.type === "file" ? el.control.id : null,
  );
  if (labelledId) return page.locator(`[id="${labelledId}"]`);
  const nested = locator.locator('input[type="file"]');
  if ((await nested.count()) > 0) return nested.first();
  return null;
}

async function doDropFile(page, step, ctx) {
  const filePath = path.resolve(process.cwd(), step.file);
  if (!fs.existsSync(filePath)) {
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (dropFile): file not found: ${step.file}`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: step.target,
    });
  }
  const buffer = fs.readFileSync(filePath);
  const name = step.name || path.basename(filePath);
  const mimeType = MIME_TYPES[path.extname(name).toLowerCase()] || "application/octet-stream";
  const locator = await requireLocator(page, step, ctx);
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
  await overlay.highlight(page, rect, 400);
  const input = await fileInputFor(page, locator);
  if (input) {
    await input.setInputFiles({ name, mimeType, buffer });
  } else {
    const dataTransfer = await page.evaluateHandle(
      ({ base64, name, mimeType }) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, { type: mimeType }));
        return transfer;
      },
      { base64: buffer.toString("base64"), name, mimeType },
    );
    for (const type of ["dragenter", "dragover", "drop"]) {
      await locator.dispatchEvent(type, { dataTransfer });
    }
  }
  return { waitMs: 0, rect };
}

// HMRC's sandbox answers "no data found" for a VAT read unless the request carries a
// Gov-Test-Scenario header naming the sample data to return. The pages carry a select for it
// inside the developer section, which a recording never shows, so the value is set on the
// hidden select directly: the form submits it with the rest, the page keeps it through the
// authorise redirect, and nothing about the developer panel reaches the frame. An option the
// page does not offer fails the step, so a renamed scenario cannot quietly record "no data".
async function doTestScenario(page, step, ctx) {
  const selector = step.target || "#testScenario";
  const outcome = await page.evaluate(
    ({ selector, value }) => {
      const select = document.querySelector(selector);
      if (!select) return "missing";
      if (![...select.options].some((option) => option.value === value)) return "no-option";
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return "set";
    },
    { selector, value: step.value },
  );
  if (outcome !== "set") {
    await writeFailureStill(page, ctx);
    const reason = outcome === "missing" ? `"${selector}" is not on the page` : `"${selector}" has no option "${step.value}"`;
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (testScenario): ${reason}`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: selector,
    });
  }
  return { waitMs: 0, rect: null };
}

// The synthetic-obligations option sits in the developer section, which a recording never shows.
// The box is ticked on the hidden element directly, so the form submits it with the rest and no
// developer panel reaches the frame. A target the page does not have fails the step.
async function doCheckHidden(page, step, ctx) {
  const outcome = await page.evaluate((selector) => {
    const box = document.querySelector(selector);
    if (!box) return "missing";
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return "set";
  }, step.target);
  if (outcome !== "set") {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (checkHidden): "${step.target}" is not on the page`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: step.target,
    });
  }
  return { waitMs: 0, rect: null };
}

async function doScroll(page, step, ctx) {
  let targetY;
  if (step.target) {
    const locator = resolveTarget(page, step.target);
    const count = await locator.count();
    if (count === 0) {
      await writeFailureStill(page, ctx);
      throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (scroll): target not found: ${JSON.stringify(step.target)}`, {
        sceneId: ctx.sceneId,
        stepIndex: ctx.stepIndex,
        target: step.target,
      });
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
  const rect = await pointAndReturnRect(page, locator, ctx.onTargetRect);
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
    throw new SceneStepError(`scene "${ctx.sceneId}" step ${ctx.stepIndex} (await): "${step.until}" never appeared (${err.message})`, {
      sceneId: ctx.sceneId,
      stepIndex: ctx.stepIndex,
      target: step.until,
    });
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
  const capturePage = withoutDebugScreenshots(page);
  const start = Date.now();
  // Entering credentials is on-camera content, a person filling in a form, not a wait. Only the
  // round trip back to the app once they are submitted has nothing to show on screen.
  await steps.loginWithCognitoOrMockAuth(
    capturePage,
    journey.authProvider,
    journey.authUsername,
    ctx.stepScreenshotDir,
    journey.authPassword,
  );
  await ctx.waitPhase(() => steps.verifyLoggedInStatus(capturePage, ctx.stepScreenshotDir));
  return { waitMs: Date.now() - start, rect: null };
}

async function doConsent(page, step, ctx) {
  const steps = await behaviourSteps();
  const capturePage = withoutDebugScreenshots(page);
  const start = Date.now();
  await ctx.waitPhase(() => steps.consentToDataCollection(capturePage, ctx.stepScreenshotDir));
  return { waitMs: Date.now() - start, rect: null };
}

async function doEnsureBundle(page, step, ctx) {
  const steps = await behaviourSteps();
  const capturePage = withoutDebugScreenshots(page);
  const start = Date.now();
  // The whole call is the pass-granting round trip (create pass, redeem, poll for allocation) —
  // there is no on-camera interaction ahead of it to protect the pill from.
  await ctx.waitPhase(() =>
    steps.ensureBundlePresent(capturePage, step.bundle, ctx.stepScreenshotDir, {
      testPass: step.testPass === true,
      isHidden: step.hidden === true,
    }),
  );
  return { waitMs: Date.now() - start, rect: null };
}

// The redirect to HMRC's own authorise pages, followed by cookies, continue, sign in, grant
// permission, back to the app. Shared by doHmrcAuthorise and doSubmitReturn, which each trigger
// their own scope's redirect with a preceding click but walk HMRC's pages the same way. Only the
// redirect wait has nothing on screen yet; the behaviour steps that follow put HMRC's own pages
// on camera — a person signing in and granting access, not a wait.
async function waitForHmrcRedirectAndAuthorise(page, step, ctx, journey, actionName, tokenDescription) {
  const steps = await behaviourSteps();
  const capturePage = withoutDebugScreenshots(page);
  const appOrigin = new URL(ctx.baseUrl).origin;
  try {
    await ctx.waitPhase(() => page.waitForURL((url) => new URL(url).origin !== appOrigin, { timeout: step.timeoutMs || ctx.timeoutMs }));
  } catch (err) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (${actionName}): the browser stayed on ${appOrigin}, so HMRC never asked for authority. ` +
        `A run whose account already holds ${tokenDescription} skips the authorise pages; record with an account that has not granted authority yet (${err.message})`,
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: null },
    );
  }
  await steps.acceptCookiesHmrc(capturePage, ctx.stepScreenshotDir);
  await steps.goToHmrcAuth(capturePage, ctx.stepScreenshotDir);
  await steps.initHmrcAuth(capturePage, ctx.stepScreenshotDir);
  await steps.fillInHmrcAuth(capturePage, journey.hmrcUser.username, journey.hmrcUser.password, ctx.stepScreenshotDir);
  await steps.submitHmrcAuth(capturePage, ctx.stepScreenshotDir);
  await steps.grantPermissionHmrcAuth(capturePage, ctx.stepScreenshotDir);
}

async function doHmrcAuthorise(page, step, ctx) {
  const journey = requireJourney(step, ctx);
  const start = Date.now();
  await waitForHmrcRedirectAndAuthorise(page, step, ctx, journey, "hmrcAuthorise", "an HMRC token");
  return { waitMs: Date.now() - start, rect: null };
}

// The redirect to Companies House's own sign-in-and-permission page, then the one form that
// grants it (userId, password, company authentication code) — one screen, unlike HMRC's four.
// The simulator lane's canned user and code come from resolveCompaniesHouseSignInCredentials
// itself; a real lane needs TEST_COMPANIES_HOUSE_USER_ID and TEST_COMPANIES_HOUSE_PASSWORD in
// the run's environment, the same variables the behaviour tests read.
async function doCompaniesHouseAuthorise(page, step, ctx) {
  const steps = await behaviourSteps();
  const capturePage = withoutDebugScreenshots(page);
  const start = Date.now();
  const appOrigin = new URL(ctx.baseUrl).origin;
  try {
    await ctx.waitPhase(() => page.waitForURL((url) => new URL(url).origin !== appOrigin, { timeout: step.timeoutMs || ctx.timeoutMs }));
  } catch (err) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (companiesHouseAuthorise): the browser stayed on ${appOrigin}, so Companies House never asked for authority. ` +
        `A run whose account already holds Companies House authority skips the authorise page; record with a fresh filing (${err.message})`,
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: null },
    );
  }
  const credentials = steps.resolveCompaniesHouseSignInCredentials(undefined, process.env.DIY_SUBMIT_ENV_FILEPATH);
  await steps.authoriseWithCompaniesHouse(capturePage, credentials, ctx.stepScreenshotDir);
  return { waitMs: Date.now() - start, rect: null };
}

// Reads the period the submit form is about to file and publishes it to the run's placeholder
// values. Read from the form rather than taken from the step, so it is the period actually
// filed and not one the script hoped for.
async function publishSubmittedPeriod(page, ctx) {
  const periodStart = await page.locator("#periodStart").inputValue();
  const periodEnd = await page.locator("#periodEnd").inputValue();
  if (!periodStart || !periodEnd) {
    await writeFailureStill(page, ctx);
    throw new SceneStepError(
      `scene "${ctx.sceneId}" step ${ctx.stepIndex} (submitReturn): the submit form has no period dates, ` +
        "so no later scene could name the period this return was filed for",
      { sceneId: ctx.sceneId, stepIndex: ctx.stepIndex, target: "#periodStart" },
    );
  }
  ctx.values.submittedPeriodStart = periodStart;
  ctx.values.submittedPeriodEnd = periodEnd;
  console.log(`Submitting a VAT return for ${periodStart} to ${periodEnd}`);
}

// Submits a VAT return for whatever period the account's own obligations resolve, off camera,
// the same way getVatReturn.behaviour.test.js does: the home nav, the submit form's own date
// fields, allowSyntheticObligations so the server resolves the open period from HMRC's
// obligations — never a hard-coded period key — the write:vat scope authorise with HMRC, and the
// receipt.
//
// The period the form ends up with is published as {{submittedPeriodStart}} and
// {{submittedPeriodEnd}}, so a later scene can ask to see this return by naming the same period.
// Any other period reads back a different return, or none: the period key HMRC files under is
// derived from these dates, and the sandbox holds data only for a key it has been sent.
async function doSubmitReturn(page, step, ctx) {
  const steps = await behaviourSteps();
  const journey = requireJourney(step, ctx);
  const capturePage = withoutDebugScreenshots(page);
  const start = Date.now();

  await steps.goToHomePageUsingMainNav(capturePage, ctx.stepScreenshotDir);
  await steps.initSubmitVat(capturePage, ctx.stepScreenshotDir);
  await steps.fillInVat(capturePage, journey.hmrcUser.vatNumber, undefined, "1000.00", null, false, ctx.stepScreenshotDir, true);
  await publishSubmittedPeriod(page, ctx);
  await steps.submitFormVat(capturePage, ctx.stepScreenshotDir);

  await waitForHmrcRedirectAndAuthorise(page, step, ctx, journey, "submitReturn", "a write:vat token");

  await steps.completeVat(capturePage, ctx.baseUrl, null, ctx.stepScreenshotDir);
  await steps.verifyVatSubmission(capturePage, null, ctx.stepScreenshotDir);
  await disableDeveloperMode(page);

  return { waitMs: Date.now() - start, rect: null };
}

// fillInVat turns developer mode on in sessionStorage so the synthetic obligations option is
// available, and sessionStorage outlives the scene. Off camera that is fine; the next scene on
// camera must not show the developer panel and the debug header.
async function disableDeveloperMode(page) {
  await page.evaluate(() => {
    sessionStorage.removeItem("showDeveloperOptions");
    document.body.classList.remove("developer-mode");
    window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled: false } }));
  });
}

// Collabora draws the grid on a canvas, so a cell has no element to locate: the cell cursor's box
// stands in for one. Moving the cursor and reading its box are separate round trips to the
// server, so the box is read once the cursor has settled.
const CURSOR_SETTLE_MS = 300;

async function currentCellRect(page) {
  await page.waitForTimeout(CURSOR_SETTLE_MS);
  return cellCursorRect(page);
}

async function pointAtCellRect(page, rect, onRect) {
  await overlay.pointTo(page, rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (onRect) await onRect(rect);
}

// Off camera, once per load: waits for the workbook, then clears the welcome panel, recalculates
// and turns spelling underlines off.
async function doSheetPrepare(page, step, ctx) {
  await waitForWorkbook(page, { timeoutMs: step.timeoutMs || 180000 });
  await prepareWorkbook(page);
  return { waitMs: 0, rect: null };
}

async function doSheetZoom(page, step) {
  await setZoom(page, step.percent);
  return { waitMs: 0, rect: null };
}

async function doSheetCell(page, step, ctx) {
  await goToCell(page, libreOfficeReference(step.cell));
  const rect = await currentCellRect(page);
  await pointAtCellRect(page, rect, ctx.onTargetRect);
  if (step.dwellMs) await new Promise((resolve) => setTimeout(resolve, step.dwellMs));
  return { waitMs: 0, rect };
}

// Types into the cell the cursor is on, through Collabora's socket messages, then presses the
// key that leaves the cell. Empty text presses the key alone, to step over a column.
async function doSheetType(page, step, ctx) {
  const text = substituteValues(step.text, ctx.values, ctx.now);
  const rect = await currentCellRect(page);
  await pointAtCellRect(page, rect, ctx.onTargetRect);
  if (text) {
    await overlay.highlight(page, rect, text.length * ctx.pacing.perCharMs + 200);
    for (const character of text) {
      await typeIntoCell(page, character, { perCharMs: ctx.pacing.perCharMs });
      if (ctx.pacing.perCharMs > 0) await overlay.typeChar(page, rect);
    }
  }
  if (step.then) await pressKey(page, step.then);
  return { waitMs: 0, rect };
}

const HANDLERS = {
  sheetPrepare: doSheetPrepare,
  sheetZoom: doSheetZoom,
  sheetCell: doSheetCell,
  sheetType: doSheetType,
  sheetPoint: (page, step, ctx) => doSheetCell(page, { ...step, dwellMs: step.dwellMs ?? 600 }, ctx),
  goto: doGoto,
  click: doClick,
  point: doPoint,
  type: doType,
  fill: doFill,
  press: doPress,
  tab: doTab,
  select: doSelect,
  dropFile: doDropFile,
  testScenario: doTestScenario,
  checkHidden: doCheckHidden,
  scroll: doScroll,
  highlight: doHighlight,
  await: doAwait,
  login: doLogin,
  consent: doConsent,
  ensureBundle: doEnsureBundle,
  hmrcAuthorise: doHmrcAuthorise,
  companiesHouseAuthorise: doCompaniesHouseAuthorise,
  submitReturn: doSubmitReturn,
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
