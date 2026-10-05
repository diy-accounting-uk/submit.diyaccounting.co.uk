#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/site-video-capture.js
//
// Records a scene script (videos/*.json) against a running instance of the site and produces a
// constant-60fps H.264 mp4, a .vtt, a .transcript.md and per-scene stills. See the site-video-
// capture design for the full write-up: CDP screencast capture with per-frame timestamps, an
// ffmpeg concat-demuxer encode, the pacing model (three groups, wait subtraction, time
// compression for long waits), and the in-page overlay (pointer, trail, captions, timer).
//
// Usage:
//   node scripts/site-video-capture.js --script videos/tour.json --base-url http://localhost:8080 --out target/videos/tour
//
// A missing scene-script target is a hard failure (repo rule: throw, don't skip) — the error
// names the scene, the step and the target, and a still of the failing viewport is written to
// stills/FAILED-<scene>-<step>.png.

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

import { validateScript, effectiveScaleFactor } from "./lib/video/scriptSchema.js";
import { groupFor, pauseForGroup, residualAfterWait, captionMinMs, compressionFor, remainingFinalHoldMs } from "./lib/video/pacing.js";
import {
  installOverlay,
  headline as overlayHeadline,
  chapter as overlayChapter,
  suppress as overlaySuppress,
  readEvents,
} from "./lib/video/overlay.js";
import { executeAction, SceneStepError } from "./lib/video/actions.js";
import { createWaitPhase } from "./lib/video/waitPhase.js";
import { isFastForward } from "./lib/video/fastForward.js";
import { createCapture } from "./lib/video/capture.js";
import { writeManifest, resolveFfmpegBinary, encodeVideo, buildContactSheet, mixNarrationTrack, muxNarration } from "./lib/video/encode.js";
import { writeVtt, writeTranscript, writeTimeline, captionTextForStep } from "./lib/video/captions.js";
import { substituteValues } from "./lib/video/values.js";
import { buildCaptureManifest, writeCaptureManifest } from "./lib/video/pipelineVersion.js";
import { collectSecrets, assertNoSecrets } from "./lib/video/secrets.js";
import { synthesizeSpeech, audioDurationMs } from "./lib/video/narration.js";

const ANALYTICS_URL_FRAGMENTS = ["google-analytics", "googletagmanager", "analytics.js", "gtag/js", "client.rum"];

function parseArgs(argv) {
  const args = {
    script: null,
    baseUrl: process.env.DIY_SUBMIT_BASE_URL || null,
    out: null,
    fps: null,
    speed: 1,
    scene: null,
    capture: "screencast",
    stillsOnly: false,
    noEncode: false,
    keepFrames: false,
    headed: false,
    narration: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--script":
        args.script = argv[++i];
        break;
      case "--base-url":
        args.baseUrl = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "--fps":
        args.fps = Number(argv[++i]);
        break;
      case "--speed":
        args.speed = Number(argv[++i]);
        break;
      case "--scene":
        args.scene = argv[++i].split(",").map((s) => s.trim());
        break;
      case "--capture":
        args.capture = argv[++i];
        break;
      case "--stills-only":
        args.stillsOnly = true;
        break;
      case "--no-encode":
        args.noEncode = true;
        break;
      case "--keep-frames":
        args.keepFrames = true;
        break;
      case "--headed":
        args.headed = true;
        break;
      case "--no-narration":
        args.narration = false;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument "${arg}". Run with --help for usage.`);
    }
  }
  if (!args.script) throw new Error("--script <path> is required");
  // --base-url is otherwise required, but a scene script that declares "localApp" supplies its
  // own base url once that app is up (see main()'s localApp handling below), so the check for
  // that case waits until the script itself has been read.
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/site-video-capture.js --script videos/tour.json --base-url http://localhost:8080 [options]

Options:
  --script <path>      scene script JSON (required)
  --base-url <url>     site to record (required, or DIY_SUBMIT_BASE_URL, unless the script declares "localApp")
  --out <dir>           output directory (default: target/videos/<name>)
  --fps <n>              override the output frame rate
  --speed <x>           scale all three pacing groups (default 1.0)
  --scene <ids>          comma-separated scene ids to run at full pace; others run fast
  --capture <mode>      screencast (default) or screenshot
  --stills-only          run the script and write stills; skip capture and encode
  --no-encode            capture frames but skip the ffmpeg encode
  --keep-frames          do not delete frames/ after encode
  --headed               watch it run locally
  --no-narration         skip Amazon Polly narration (default: on, unless --stills-only)
  --help                 this message`);
}

function scalePacing(cfg, factor) {
  return {
    ...cfg,
    perCharMs: cfg.perCharMs * factor,
    betweenActionsMs: cfg.betweenActionsMs * factor,
    aroundMotionMs: cfg.aroundMotionMs * factor,
    minResidualMs: cfg.minResidualMs * factor,
  };
}

function describeTarget(target) {
  if (typeof target === "string") return `"${target}"`;
  if (target && "role" in target) return `the ${target.role} "${target.name}"`;
  if (target && "text" in target) return `"${target.text}"`;
  return String(target);
}

// The transcript is a published artefact, so a step marked secret is described by what it did,
// never by what it typed. Everything else is described with its placeholders already resolved,
// so a reader sees the VAT registration number the run actually used.
function describeValue(step, field, values, now) {
  if (step.secret) return "a hidden value";
  return `"${substituteValues(step[field], values, now)}"`;
}

function describeStep(step, waitMs, values, now) {
  const waitSuffix = waitMs && waitMs > 500 ? ` (waits ${(waitMs / 1000).toFixed(1)}s)` : "";
  switch (step.action) {
    case "goto":
      return `loads ${step.url}${waitSuffix}`;
    case "click":
      return `clicks ${describeTarget(step.target)}${waitSuffix}`;
    case "point":
      return `points at ${describeTarget(step.target)}`;
    case "type":
      return `types ${describeValue(step, "text", values, now)} into ${describeTarget(step.target)}`;
    case "fill":
      return `fills ${describeTarget(step.target)} with ${describeValue(step, "value", values, now)}`;
    case "press":
      return `presses ${step.key}`;
    case "tab":
      return "moves focus with Tab";
    case "select":
      return `selects "${step.value}" in ${describeTarget(step.target)}`;
    case "dropFile":
      return `drops ${step.name || path.basename(step.file)} onto ${describeTarget(step.target)}`;
    case "scroll":
      return step.target ? `scrolls to ${describeTarget(step.target)}` : `scrolls to the ${step.to}`;
    case "highlight":
      return `highlights ${describeTarget(step.target)}`;
    case "sheetPrepare":
      return "opens the workbook";
    case "sheetZoom":
      return `zooms the sheet to ${step.percent}%`;
    case "sheetCell":
    case "sheetPoint":
      return `points at ${step.cell}`;
    case "sheetType":
      return `types ${describeValue(step, "text", values, now)} into the current cell${step.then ? ` and presses ${step.then}` : ""}`;
    case "await":
      return `waits for ${step.label || step.until}${waitSuffix}`;
    case "hold":
      return "pauses";
    case "still":
      return "captures a still";
    case "login":
      return `signs in${waitSuffix}`;
    case "consent":
      return "answers the analytics consent prompt";
    case "ensureBundle":
      return `takes out the ${step.bundle} bundle${waitSuffix}`;
    case "hmrcAuthorise":
      return `signs in at HMRC and grants authority${waitSuffix}`;
    case "companiesHouseAuthorise":
      return `signs in at Companies House and grants authority${waitSuffix}`;
    case "submitReturn":
      return `submits a VAT return${waitSuffix}`;
    default:
      return step.action;
  }
}

const WAIT_CAPABLE_ACTIONS = new Set([
  "goto",
  "click",
  "await",
  "login",
  "consent",
  "ensureBundle",
  "hmrcAuthorise",
  "companiesHouseAuthorise",
]);

// Journey actions end wherever the identity provider or HMRC sent them, which can be the URL they
// started on. Every other action is judged by whether the URL moved. Either way the overlay was
// reinstalled from scratch by the navigation, so the chapter label and the suppressed elements
// have to be put back.
const ALWAYS_NAVIGATING_ACTIONS = new Set([
  "goto",
  "login",
  "consent",
  "ensureBundle",
  "hmrcAuthorise",
  "companiesHouseAuthorise",
  "submitReturn",
]);

// Actions whose handler resolves a real target and moves the pointer to it (actions.js's
// pointAndReturnRect) — the only ones that can hand a headline its target's actual box through
// ctx.onTargetRect. Every other action's headline, if it has one, places against no target at
// all (headlinePlacement.js's "default" anchor).
const TARGET_RECT_ACTIONS = new Set([
  "click",
  "point",
  "type",
  "fill",
  "select",
  "dropFile",
  "highlight",
  "sheetCell",
  "sheetType",
  "sheetPoint",
]);

// The ordered list of (text, sceneId) pairs the scene loop's three resolveCaptionHold call
// sites will ask Polly for: a "caption" action step names its own text; any other step with a
// caption names that, unless the step is a goto whose caption is instead resolved after
// navigation (site-video-capture design, the doGoto branch) — from resolveCaptionHold's point
// of view the same one call either way. offCamera and fastForward scenes hold nothing, so they
// call it for neither.
function narrationRequestsFor(script, selectedSceneIds) {
  const requests = [];
  for (const scene of script.scenes) {
    if (scene.offCamera === true) continue;
    for (const step of scene.steps) {
      if (isFastForward(scene, step, selectedSceneIds)) continue;
      if (step.action === "caption") requests.push({ text: step.text, sceneId: scene.id });
      else if (step.caption) requests.push({ text: step.caption, sceneId: scene.id });
    }
  }
  return requests;
}

// Synthesises every caption's narration up front, each into the exact numbered file
// resolveCaptionHold would otherwise request live (caption-0.mp3, caption-1.mp3, ...), so the
// scene loop finds them already there. One at a time, and before this run's own browser, local
// server and dynalite start — see the call site for why.
async function prefetchNarration(script, selectedSceneIds, narrationDir) {
  const requests = narrationRequestsFor(script, selectedSceneIds);
  let index = 0;
  for (const { text, sceneId } of requests) {
    const outputPath = path.join(narrationDir, `caption-${index++}.mp3`);
    if (!fs.existsSync(outputPath)) await synthesizeSpeech({ text, outputPath, sceneId });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptPath = path.resolve(args.script);
  const rawScript = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const script = validateScript(rawScript);

  // A scene script whose target is not the submit site at all (an MCP Inspector session, say)
  // names the local app it needs in "localApp": a command, the url its web UI serves once it is
  // ready, and a pattern to match against the command's own output before treating it as ready.
  // Its url becomes this run's base url when --base-url was not given explicitly, exactly like
  // journey.js's startLocalServices does for a logged-in submit scene, generalised to any command.
  let localApp = { stop: async () => {} };
  if (script.localApp) {
    const { startLocalApp } = await import("./lib/video/localApp.js");
    localApp = await startLocalApp(script.localApp);
    args.baseUrl = args.baseUrl || localApp.url;
  }
  if (!args.baseUrl) {
    throw new Error('--base-url <url> is required (or set DIY_SUBMIT_BASE_URL, or declare "localApp" in the scene script)');
  }

  const outDir = path.resolve(args.out || path.join("target/videos", script.name));
  const framesDir = path.join(outDir, "frames");
  const stillsDir = path.join(outDir, "stills");
  const narrationDir = path.join(outDir, "narration");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(stillsDir, { recursive: true });

  // Narration reaches only a real recording: --stills-only never encodes a video, so there is
  // nothing to hold a scene open for and nothing to mux the audio onto.
  const narrationEnabled = args.narration && !args.stillsOnly;
  const narrationClips = [];
  let narrationFfmpegBin = null;
  let narrationIndex = 0;
  const selectedSceneIds = args.scene ? new Set(args.scene) : null;
  if (narrationEnabled) {
    fs.mkdirSync(narrationDir, { recursive: true });
    narrationFfmpegBin = resolveFfmpegBinary();
    // Every Polly call this run will make, before the browser, the local server and dynalite
    // start: alongside that concurrent work the same call has failed outright (an HTTP/2
    // protocol error) or hung with no response at all, while the identical call made here,
    // before any of it is running, has not. Captions carry no {{...}} placeholder (only typed
    // and filled field values do — see values.js), so every caption's final text is already
    // known from the script alone; this mirrors the fastForward/offCamera/caption-action
    // selection the scene loop below applies at its own three resolveCaptionHold call sites, in
    // the same order, so the numbered files it writes are the ones resolveCaptionHold finds
    // already there and does not re-request.
    await prefetchNarration(script, selectedSceneIds, narrationDir);
  }
  // Falls back to the reading-speed estimate (pacing.js's captionMinMs) when narration is off,
  // or for a fastForward/off-camera step, which never calls this at all (see the call sites
  // below) -- a sped-through preamble has no line to hold for. Every other captioned step's
  // hold becomes the real spoken duration of its own caption text: "held until its line has
  // been spoken", not a reading-speed guess of how long that would take.
  async function resolveCaptionHold(text, sceneId) {
    if (!narrationEnabled) return { minMs: captionMinMs(text, script.captions), audioPath: null };
    const audioPath = path.join(narrationDir, `caption-${narrationIndex++}.mp3`);
    if (!fs.existsSync(audioPath)) await synthesizeSpeech({ text, outputPath: audioPath, sceneId });
    const minMs = audioDurationMs(narrationFfmpegBin, audioPath);
    return { minMs, audioPath };
  }

  const fps = args.fps || script.fps;
  const unscaledPacing = script.pacing;
  const scaledPacing = scalePacing(script.pacing, args.speed);
  // The CSS layout stays at the script's viewport; only the backing store renders denser, so a
  // 1920x1080 layout captures as 3840x2160 frames at the default scale factor and every caption
  // and overlay pixel stays crisp once YouTube re-encodes.
  const scaleFactor = effectiveScaleFactor(script);
  const frameWidth = script.viewport.width * scaleFactor;
  const frameHeight = script.viewport.height * scaleFactor;

  // One clock for the whole run, so a date placeholder resolves to the same day in the browser,
  // the transcript and the timeline even if the recording straddles midnight.
  const now = new Date();
  const stepScreenshotDir = path.resolve("target/behaviour-test-results/screenshots", `video-${script.name}`);

  const needsUser = script.auth === "user";
  // submitReturn drives its own HMRC authorise sequence internally, so it needs the same test
  // user hmrcAuthorise does.
  const usesHmrcTestUser = script.scenes.some((scene) =>
    scene.steps.some((step) => step.action === "hmrcAuthorise" || step.action === "submitReturn"),
  );
  let localServices = { stop: async () => {} };
  let journey = null;
  let installCredentialFieldMask = null;
  // The browser's own console and page errors are what the behaviour tests always capture
  // (addOnPageLogging), sanitised the same way, so a page-side throw (e.g. a script the page
  // never loaded) shows up in this run's log instead of only as a downstream step timeout. Only
  // loaded for a signed-in script: journey.js already pulls in the same module tree, so this
  // costs nothing extra there, and an unauthenticated script keeps paying nothing for it.
  let addOnPageLogging = null;
  if (needsUser) {
    const journeyModule = await import("./lib/video/journey.js");
    installCredentialFieldMask = journeyModule.installCredentialFieldMask;
    ({ addOnPageLogging } = await import("./lib/video/behaviourSteps.js"));
    localServices = await journeyModule.startLocalServices(process.env);
    journey = {
      authProvider: journeyModule.authProviderFrom(process.env),
      authUsername: journeyModule.authUsernameFrom(process.env),
      authPassword: process.env.TEST_AUTH_PASSWORD || null,
      hmrcUser: usesHmrcTestUser ? await journeyModule.resolveHmrcTestUser(process.env, script.hmrcServices || ["mtd-vat"]) : null,
    };
    console.log(`Signing in with the ${journey.authProvider} identity provider as ${journey.authUsername}`);
  }

  const values = { hmrcVatNumber: journey?.hmrcUser?.vatNumber, hmrcNino: journey?.hmrcUser?.nino };
  const secrets = collectSecrets(process.env, [journey?.hmrcUser?.password, journey?.hmrcUser?.username].filter(Boolean));

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: script.viewport,
    locale: "en-GB",
    timezoneId: "Europe/London",
    deviceScaleFactor: scaleFactor,
    // Same marker playwright.config.js appends for every behaviour-test and probe run
    // (app/lib/visitorClassifier.js), so a recording against a real deployment tags as
    // synthetic rather than a human visitor.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 DIYAccountingProbe/1",
  });
  if (script.consentAnswer) {
    await context.addInitScript((answer) => {
      try {
        localStorage.setItem("consent.rum", answer);
        localStorage.setItem("consent.analytics", answer);
      } catch {
        // A document that denies storage has no consent banner to hide either.
      }
    }, script.consentAnswer);
  }
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (ANALYTICS_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  const page = await context.newPage();
  // Raises the default action timeout (Playwright's own default is 30000ms) for this
  // capture-only page alone — playwright.config.js's timeout for the real behaviour-test and
  // probe suites is untouched. deviceScaleFactor 2 makes every page.screenshot() call in the
  // shared behaviour-tests/steps files (reused here via behaviourSteps.js) capture 4x the
  // pixels of the old 1x default, and a concurrent CDP screencast capture competes for the same
  // renderer on a loaded CI runner — seen for real as a page.screenshot() timeout in
  // verifyLoggedInStatus on the ci itsa-year capture.
  page.setDefaultTimeout(60000);
  if (addOnPageLogging) addOnPageLogging(page);
  await installOverlay(page);
  if (installCredentialFieldMask) await installCredentialFieldMask(page);

  const captureEnabled = !args.stillsOnly;
  const encodeEnabled = !args.stillsOnly && !args.noEncode;
  const capture = captureEnabled
    ? createCapture(args.capture, {
        page,
        framesDir,
        maxWidth: frameWidth,
        maxHeight: frameHeight,
      })
    : null;
  if (capture) await capture.start();

  const stepRecords = [];
  const captionEvents = [];
  const sceneRecords = [];
  let elapsedMs = 0;
  // The overlay's event log lives on the page and is wiped by every navigation (a new document,
  // a fresh window.__svc), so reading it once at the end would only ever return what the very
  // last document logged. Reading it after every step instead, and keeping only what is new
  // since the last read, carries each document's events across into a run-long record before
  // the next navigation can erase them.
  const overlayEvents = [];
  let lastReadEventCount = 0;
  async function collectNewOverlayEvents() {
    const events = await readEvents(page).catch(() => null);
    if (!events) return;
    if (events.length > lastReadEventCount) overlayEvents.push(...events.slice(lastReadEventCount));
    lastReadEventCount = events.length;
  }
  const wallStart = Date.now();
  // An off-camera scene (scriptSchema's "offCamera") is paused out of the capture, but the real
  // time it takes still passes on the wall clock. pausedMs is the running total of that time,
  // subtracted everywhere the timeline measures elapsed time so the recording and the timeline
  // both skip forward as if the scene took no time at all — see capture.js's own pause/resume.
  let pausedMs = 0;
  const elapsed = () => Date.now() - wallStart - pausedMs;
  // The overlay only exists once a document has actually loaded — addInitScript does not run
  // against the initial about:blank page. Every overlay call before the tour's first `goto` is
  // deferred to just after that navigation instead of guarded with a timeout, so a scene script
  // that (wrongly) opens with anything other than a goto fails loudly rather than silently
  // skipping its first overlay cue.
  let hasNavigated = false;

  try {
    for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
      const scene = script.scenes[sceneIndex];
      const offCamera = scene.offCamera === true;
      // A script can mark a scene fastForward: true so it always runs sped up on every
      // recording (a repeated preamble such as sign-in and day pass) — the same zero-pacing
      // treatment --scene gives an unselected scene, but never turned off by omitting --scene.
      const sceneFastForward = isFastForward(scene, {}, selectedSceneIds);

      let offCameraStartedAt = null;
      if (offCamera) {
        offCameraStartedAt = Date.now();
        if (capture) capture.pause();
      }

      if (!offCamera && hasNavigated) await overlayChapter(page, scene.chapter);
      console.log(
        `\n=== scene "${scene.id}" (${scene.chapter}) ${offCamera ? "[off-camera]" : sceneFastForward ? "[fast-forward]" : ""} ===`,
      );

      const entries = [];

      for (let stepIndex = 0; stepIndex < scene.steps.length; stepIndex++) {
        const step = scene.steps[stepIndex];
        // A step can also be fast-forwarded on its own (a repeated HMRC authorisation inside a
        // scene that otherwise plays at full pace), so the pacing is chosen per step.
        const fastForward = isFastForward(scene, step, selectedSceneIds);
        const pacing = offCamera || fastForward ? scalePacing(script.pacing, 0) : scaledPacing;
        const waitPhaseCtl = createWaitPhase(page, step, unscaledPacing, capture, WAIT_CAPABLE_ACTIONS.has(step.action));
        const ctx = {
          baseUrl: args.baseUrl,
          pacing,
          stillsDir,
          stepScreenshotDir,
          sceneId: scene.id,
          stepIndex,
          timeoutMs: 30000,
          values,
          now,
          journey,
          waitPhase: waitPhaseCtl.run,
          onTargetRect: null,
        };
        const startMs = elapsed();
        const frameStart = capture?.frames.length ?? null;
        const group = groupFor(step.action);
        // A step's caption is never burned into the frame: the uploaded .vtt track carries the
        // words. Its hold and narration still run here. A goto's caption describes the page it
        // lands on, so its hold starts after navigation (see the doGoto branch below).
        // An off-camera scene has no caption at all — nothing here reaches a viewer.
        const showCaptionBeforeAction = !offCamera && step.caption && step.action !== "goto";

        let captionHideAt = null;
        if (showCaptionBeforeAction) {
          const hold = fastForward ? { minMs: 0, audioPath: null } : await resolveCaptionHold(step.caption, scene.id);
          if (hold.audioPath) narrationClips.push({ path: hold.audioPath, startMs });
          const minMs = hold.minMs;
          captionHideAt = () => elapsed() + minMs;
          captionEvents.push({
            startMs,
            text: step.caption,
            maxCharsPerLine: script.captions.maxCharsPerLine,
            maxLines: script.captions.maxLines,
            _minMs: minMs,
          });
        }

        // A step with no headline shows no burned-in line — never a fallback to the caption
        // text. For a step that resolves a real target (TARGET_RECT_ACTIONS), the headline waits
        // for onTargetRect below, which fires once the pointer has actually arrived there — the
        // earliest point its real, post-scroll box is known, so the tag can sit clear of it.
        // Every other step's headline (if it has one) shows immediately against no target at
        // all, the same as goto's own caption does after its navigation lands.
        let headlineHideAt = null;
        const holdHeadline = (text, keyWord, rect) => {
          const minMs = fastForward ? 0 : captionMinMs(text, script.captions);
          headlineHideAt = () => elapsed() + minMs;
          return overlayHeadline(page, text, keyWord, rect, script.viewport);
        };
        const showHeadlineBeforeAction = !offCamera && step.headline && step.action !== "goto" && !TARGET_RECT_ACTIONS.has(step.action);
        if (showHeadlineBeforeAction) {
          await holdHeadline(step.headline, step.keyWord, null);
        } else if (!offCamera && step.headline && TARGET_RECT_ACTIONS.has(step.action)) {
          ctx.onTargetRect = (rect) => holdHeadline(step.headline, step.keyWord, rect);
        }

        let waitMs = 0;
        let navigated = false;
        let timerShown = false;
        if (step.action === "caption") {
          if (!offCamera) {
            // narration replaces the author's own holdMs guess with the real spoken duration
            // when it is on; holdMs is the fallback only when narration is off (or the scene is
            // fast-forwarded), the same as pacing.js's reading-speed estimate is elsewhere.
            const hold = fastForward
              ? { minMs: 0, audioPath: null }
              : narrationEnabled
                ? await resolveCaptionHold(step.text, scene.id)
                : { minMs: step.holdMs || captionMinMs(step.text, script.captions), audioPath: null };
            if (hold.audioPath) narrationClips.push({ path: hold.audioPath, startMs });
            const minMs = hold.minMs;
            await new Promise((resolve) => setTimeout(resolve, minMs));
            captionEvents.push({
              startMs,
              text: step.text,
              maxCharsPerLine: script.captions.maxCharsPerLine,
              maxLines: script.captions.maxLines,
              _minMs: minMs,
            });
          }
        } else if (step.action === "hold") {
          await new Promise((resolve) => setTimeout(resolve, fastForward || offCamera ? 0 : step.ms));
        } else if (step.action === "still") {
          if (!fastForward && !offCamera) await page.screenshot({ path: path.join(stillsDir, `${step.name}.png`) });
        } else {
          if (group === 3 && hasNavigated) {
            await new Promise((resolve) => setTimeout(resolve, pauseForGroup(3, pacing)));
          }
          const urlBeforeAction = page.url();
          const result = await executeAction(page, step, ctx);
          waitMs = result.waitMs;
          timerShown = waitPhaseCtl.shown;
          // The document is judged by whether the URL moved, not by the action's name — a goto
          // is navigated by definition, everything else stands or falls on the URL check alone.
          navigated = step.action === "goto" || page.url() !== urlBeforeAction;
          if (ALWAYS_NAVIGATING_ACTIONS.has(step.action) || page.url() !== urlBeforeAction) {
            hasNavigated = true;
            // A fresh document starts its own window.__svc.events at zero, so the count read
            // back after the last document must not carry over — carrying it over holds the
            // threshold too high and drops every event this new document logs until its own
            // count happens to exceed the old one, silently losing a timer marker a same-URL
            // reload (e.g. ensureBundle's) logs on the document it lands on.
            lastReadEventCount = 0;
            if (!offCamera) {
              await overlayChapter(page, scene.chapter);
              if (script.suppress?.length) await overlaySuppress(page, script.suppress);
              if (step.caption) {
                if (!captionHideAt) {
                  const hold = fastForward ? { minMs: 0, audioPath: null } : await resolveCaptionHold(step.caption, scene.id);
                  if (hold.audioPath) narrationClips.push({ path: hold.audioPath, startMs });
                  const minMs = hold.minMs;
                  captionHideAt = () => elapsed() + minMs;
                  captionEvents.push({
                    startMs,
                    text: step.caption,
                    maxCharsPerLine: script.captions.maxCharsPerLine,
                    maxLines: script.captions.maxLines,
                    _minMs: minMs,
                  });
                }
              }
              // A real navigation replaces the whole document, so even a headline already shown
              // by onTargetRect before the navigation started (a click that also navigates) is
              // gone from the fresh one and has to be put back, the same as the chapter label
              // above. Against no target: whatever box a locator resolved to on
              // the old page means nothing on the new one.
              if (step.headline) await holdHeadline(step.headline, step.keyWord, null);
            }
          }
        }

        let residualMs = null;
        if (group === 2 || group === 3) {
          const pause = pauseForGroup(group, pacing);
          residualMs = residualAfterWait(pause, waitMs, pacing);
          await new Promise((resolve) => setTimeout(resolve, residualMs));
        }

        if (captionHideAt) {
          const remaining = captionHideAt() - elapsed();
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          const last = captionEvents[captionEvents.length - 1];
          last.endMs = elapsed();
        }

        if (headlineHideAt) {
          const remaining = headlineHideAt() - elapsed();
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          await overlayHeadline(page, null, null, null, script.viewport);
        }

        // Only a WAIT_CAPABLE_ACTIONS step can navigate or draw the timer pill, so this is the
        // only place a flush is needed — every other action leaves the current document alone,
        // and its own events (e.g. a "type" step's typeChar events) ride along in the next flush.
        if (WAIT_CAPABLE_ACTIONS.has(step.action)) await collectNewOverlayEvents();

        const endMs = elapsed();
        const frameEnd = capture?.frames.length ?? null;
        const description = describeStep(step, waitMs, values, now);
        // An off-camera step names nothing a viewer sees: it never reaches the transcript, so it
        // never has to describe itself in words a reader would notice weren't on screen.
        // A testScenario step sets a form value the viewer never sees, so the transcript has
        // nothing to say about it.
        if (!offCamera && step.action !== "testScenario")
          entries.push({ caption: captionTextForStep(step), description, note: step.note || null });

        const compression = WAIT_CAPABLE_ACTIONS.has(step.action) ? compressionFor(waitMs, unscaledPacing) : null;

        stepRecords.push({
          sceneId: scene.id,
          stepIndex,
          offCamera,
          fastForward,
          action: step.action,
          group,
          configuredMs: group ? pauseForGroup(group, pacing) : null,
          waitMs,
          residualMs,
          compressedOnScreenMs: compression?.compressed ? compression.onScreenMs : null,
          navigated,
          timerShown,
          startMs,
          endMs,
          frameStart,
          frameEnd,
        });

        console.log(`  [${scene.id}#${stepIndex}] ${step.action} waitMs=${waitMs.toFixed(0)} elapsed=${(endMs / 1000).toFixed(1)}s`);
      }

      // An off-camera scene contributes nothing a viewer would read: no caption, no description,
      // no note — the whole scene is absent from the transcript, not just quiet within it.
      if (!offCamera) sceneRecords.push({ id: scene.id, chapter: scene.chapter, entries });

      if (scene.still && !sceneFastForward && !offCamera) {
        const stillPath = path.join(stillsDir, `${String(sceneIndex + 1).padStart(2, "0")}-${scene.id}.png`);
        await page.screenshot({ path: stillPath });
      }

      if (offCamera) {
        if (capture) capture.resume();
        pausedMs += Date.now() - offCameraStartedAt;
      }
    }

    elapsedMs = elapsed();
    await new Promise((resolve) => setTimeout(resolve, script.finalHoldMs));
    await collectNewOverlayEvents();
  } catch (err) {
    if (err instanceof SceneStepError) {
      console.error(`\nsite-video-capture failed: ${err.message}`);
    }
    throw err;
  } finally {
    if (capture) await capture.stop();
    await browser.close();
    await localServices.stop();
    await localApp.stop();
  }

  // Close each caption event still missing an endMs (a caption whose hold never resolved because
  // the run threw) so the vtt/transcript writers below don't choke on a partial record.
  for (const event of captionEvents) {
    if (event.endMs === undefined) event.endMs = event.startMs + event._minMs;
  }

  writeTimeline(path.join(outDir, `${script.name}.timeline.json`), stepRecords);
  fs.writeFileSync(path.join(outDir, `${script.name}.overlay-events.json`), JSON.stringify(overlayEvents, null, 2));
  writeVtt(path.join(outDir, `${script.name}.vtt`), captionEvents);
  writeCaptureManifest(path.join(outDir, `${script.name}.manifest.json`), buildCaptureManifest({ scriptName: script.name }));
  writeTranscript(path.join(outDir, `${script.name}.transcript.md`), {
    title: script.title,
    description: script.description,
    sceneRecords,
  });

  // Last gate before any of this can be published: nothing the run was handed as a credential
  // may appear in a text artefact that ships with the video.
  for (const artefact of [
    `${script.name}.vtt`,
    `${script.name}.transcript.md`,
    `${script.name}.timeline.json`,
    `${script.name}.overlay-events.json`,
  ]) {
    assertNoSecrets(artefact, fs.readFileSync(path.join(outDir, artefact), "utf8"), secrets);
  }

  const stillPaths = fs
    .readdirSync(stillsDir)
    .filter((f) => /^\d\d-.*\.png$/.test(f))
    .sort()
    .map((f) => path.join(stillsDir, f));
  if (stillPaths.length > 1) {
    const ffmpegBin = resolveFfmpegBinary();
    try {
      buildContactSheet({ ffmpegBin, stillPaths, outputPath: path.join(stillsDir, "contact-sheet.png") });
    } catch (err) {
      console.warn(`contact sheet build failed (non-fatal): ${err.message}`);
    }
  }

  if (encodeEnabled && capture) {
    const manifestPath = path.join(framesDir, "manifest.txt");
    const lastFrameTMs = capture.frames.length ? capture.frames[capture.frames.length - 1].tMs : 0;
    const tailHoldMs = remainingFinalHoldMs(elapsedMs, script.finalHoldMs, lastFrameTMs);
    // Frame paths in the manifest are resolved by ffmpeg relative to the manifest file's own
    // directory (framesDir itself), so they need no "frames/" prefix here.
    writeManifest(manifestPath, capture.frames, tailHoldMs, ".");
    const ffmpegBin = resolveFfmpegBinary();
    const outputPath = path.join(outDir, `${script.name}.mp4`);
    console.log(`\nEncoding ${capture.frames.length} frames -> ${outputPath}`);
    encodeVideo({
      ffmpegBin,
      manifestPath,
      outputPath,
      fps,
      width: frameWidth,
      height: frameHeight,
    });
    console.log(`Wrote ${outputPath}`);
    if (!args.keepFrames) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }

    if (narrationClips.length > 0) {
      const narrationTrackPath = path.join(outDir, `${script.name}.narration.wav`);
      const narratedOutputPath = path.join(outDir, `${script.name}.narrated.mp4`);
      console.log(`\nMixing ${narrationClips.length} narration clips -> ${narrationTrackPath}`);
      mixNarrationTrack({ ffmpegBin, clips: narrationClips, outputPath: narrationTrackPath });
      muxNarration({ ffmpegBin, videoPath: outputPath, narrationTrackPath, outputPath: narratedOutputPath });
      fs.renameSync(narratedOutputPath, outputPath);
      console.log(`Muxed narration onto ${outputPath}`);
    }
  }

  console.log(`\nDone. ${(elapsedMs / 1000).toFixed(1)}s of scripted timeline, ${stepRecords.length} steps.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
