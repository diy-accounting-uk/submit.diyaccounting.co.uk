#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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

import { validateScript } from "./lib/video/scriptSchema.js";
import { groupFor, pauseForGroup, residualAfterWait, captionMinMs, compressionFor } from "./lib/video/pacing.js";
import { installOverlay, caption as overlayCaption, chapter as overlayChapter, suppress as overlaySuppress, readEvents } from "./lib/video/overlay.js";
import { executeAction, SceneStepError } from "./lib/video/actions.js";
import { createWaitPhase } from "./lib/video/waitPhase.js";
import { createCapture } from "./lib/video/capture.js";
import { writeManifest, resolveFfmpegBinary, encodeVideo, buildContactSheet } from "./lib/video/encode.js";
import { writeVtt, writeTranscript, writeTimeline } from "./lib/video/captions.js";
import { substituteValues } from "./lib/video/values.js";
import { collectSecrets, assertNoSecrets } from "./lib/video/secrets.js";

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
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument "${arg}". Run with --help for usage.`);
    }
  }
  if (!args.script) throw new Error("--script <path> is required");
  if (!args.baseUrl) throw new Error("--base-url <url> is required (or set DIY_SUBMIT_BASE_URL)");
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/site-video-capture.js --script videos/tour.json --base-url http://localhost:8080 [options]

Options:
  --script <path>      scene script JSON (required)
  --base-url <url>     site to record (required, or DIY_SUBMIT_BASE_URL)
  --out <dir>           output directory (default: target/videos/<name>)
  --fps <n>              override the output frame rate
  --speed <x>           scale all three pacing groups (default 1.0)
  --scene <ids>          comma-separated scene ids to run at full pace; others run fast
  --capture <mode>      screencast (default) or screenshot
  --stills-only          run the script and write stills; skip capture and encode
  --no-encode            capture frames but skip the ffmpeg encode
  --keep-frames          do not delete frames/ after encode
  --headed               watch it run locally
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
    case "scroll":
      return step.target ? `scrolls to ${describeTarget(step.target)}` : `scrolls to the ${step.to}`;
    case "highlight":
      return `highlights ${describeTarget(step.target)}`;
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
    default:
      return step.action;
  }
}

const WAIT_CAPABLE_ACTIONS = new Set(["goto", "click", "await", "login", "consent", "ensureBundle", "hmrcAuthorise"]);

// Journey actions end wherever the identity provider or HMRC sent them, which can be the URL they
// started on. Every other action is judged by whether the URL moved. Either way the overlay was
// reinstalled from scratch by the navigation, so the chapter label, the suppressed elements and
// the caption all have to be put back.
const ALWAYS_NAVIGATING_ACTIONS = new Set(["goto", "login", "consent", "ensureBundle", "hmrcAuthorise"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptPath = path.resolve(args.script);
  const rawScript = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const script = validateScript(rawScript);

  const outDir = path.resolve(args.out || path.join("target/videos", script.name));
  const framesDir = path.join(outDir, "frames");
  const stillsDir = path.join(outDir, "stills");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(stillsDir, { recursive: true });

  const fps = args.fps || script.fps;
  const unscaledPacing = script.pacing;
  const scaledPacing = scalePacing(script.pacing, args.speed);

  // One clock for the whole run, so a date placeholder resolves to the same day in the browser,
  // the transcript and the timeline even if the recording straddles midnight.
  const now = new Date();
  const stepScreenshotDir = path.resolve("target/behaviour-test-results/screenshots", `video-${script.name}`);

  const needsUser = script.auth === "user";
  const usesHmrcAuthorise = script.scenes.some((scene) => scene.steps.some((step) => step.action === "hmrcAuthorise"));
  let localServices = { stop: async () => {} };
  let journey = null;
  let installCredentialFieldMask = null;
  if (needsUser) {
    const journeyModule = await import("./lib/video/journey.js");
    installCredentialFieldMask = journeyModule.installCredentialFieldMask;
    localServices = await journeyModule.startLocalServices(process.env);
    journey = {
      authProvider: journeyModule.authProviderFrom(process.env),
      authUsername: journeyModule.authUsernameFrom(process.env),
      authPassword: process.env.TEST_AUTH_PASSWORD || null,
      hmrcUser: usesHmrcAuthorise ? await journeyModule.resolveHmrcTestUser(process.env) : null,
    };
    console.log(`Signing in with the ${journey.authProvider} identity provider as ${journey.authUsername}`);
  }

  const values = { hmrcVatNumber: journey?.hmrcUser?.vatNumber };
  const secrets = collectSecrets(process.env, [journey?.hmrcUser?.password, journey?.hmrcUser?.username].filter(Boolean));

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: script.viewport,
    deviceScaleFactor: script.deviceScaleFactor || 1,
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (ANALYTICS_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  const page = await context.newPage();
  await installOverlay(page);
  if (installCredentialFieldMask) await installCredentialFieldMask(page);

  const captureEnabled = !args.stillsOnly;
  const encodeEnabled = !args.stillsOnly && !args.noEncode;
  const capture = captureEnabled
    ? createCapture(args.capture, {
        page,
        framesDir,
        maxWidth: script.viewport.width,
        maxHeight: script.viewport.height,
      })
    : null;
  if (capture) await capture.start();

  const selectedSceneIds = args.scene ? new Set(args.scene) : null;
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
  // The overlay only exists once a document has actually loaded — addInitScript does not run
  // against the initial about:blank page. Every overlay call before the tour's first `goto` is
  // deferred to just after that navigation instead of guarded with a timeout, so a scene script
  // that (wrongly) opens with anything other than a goto fails loudly rather than silently
  // skipping its first overlay cue.
  let hasNavigated = false;

  try {
    for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
      const scene = script.scenes[sceneIndex];
      const fastForward = selectedSceneIds ? !selectedSceneIds.has(scene.id) : false;
      const pacing = fastForward ? scalePacing(script.pacing, 0) : scaledPacing;

      if (hasNavigated) await overlayChapter(page, scene.chapter);
      console.log(`\n=== scene "${scene.id}" (${scene.chapter}) ${fastForward ? "[fast-forward]" : ""} ===`);

      const entries = [];

      for (let stepIndex = 0; stepIndex < scene.steps.length; stepIndex++) {
        const step = scene.steps[stepIndex];
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
        };
        const startMs = Date.now() - wallStart;
        const frameStart = capture?.frames.length ?? null;
        const group = groupFor(step.action);
        // A goto's own caption describes the page it lands on, so it is shown after navigation
        // (see the doGoto branch below) rather than before, alongside every other action's cue.
        const showCaptionBeforeAction = step.caption && step.action !== "goto";

        let captionHideAt = null;
        if (showCaptionBeforeAction) {
          await overlayCaption(page, step.caption);
          const minMs = fastForward ? 0 : captionMinMs(step.caption, script.captions);
          captionHideAt = () => Date.now() - wallStart + minMs;
          captionEvents.push({
            startMs,
            text: step.caption,
            maxCharsPerLine: script.captions.maxCharsPerLine,
            maxLines: script.captions.maxLines,
            _minMs: minMs,
          });
        }

        let waitMs = 0;
        let navigated = false;
        let timerShown = false;
        if (step.action === "caption") {
          const minMs = fastForward ? 0 : step.holdMs || captionMinMs(step.text, script.captions);
          await overlayCaption(page, step.text);
          await new Promise((resolve) => setTimeout(resolve, minMs));
          await overlayCaption(page, null);
          captionEvents.push({ startMs, text: step.text, maxCharsPerLine: script.captions.maxCharsPerLine, maxLines: script.captions.maxLines, _minMs: minMs });
        } else if (step.action === "hold") {
          await new Promise((resolve) => setTimeout(resolve, fastForward ? 0 : step.ms));
        } else if (step.action === "still") {
          if (!fastForward) await page.screenshot({ path: path.join(stillsDir, `${step.name}.png`) });
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
            await overlayChapter(page, scene.chapter);
            if (script.suppress?.length) await overlaySuppress(page, script.suppress);
            if (step.caption) {
              await overlayCaption(page, step.caption);
              if (!captionHideAt) {
                const minMs = fastForward ? 0 : captionMinMs(step.caption, script.captions);
                captionHideAt = () => Date.now() - wallStart + minMs;
                captionEvents.push({
                  startMs,
                  text: step.caption,
                  maxCharsPerLine: script.captions.maxCharsPerLine,
                  maxLines: script.captions.maxLines,
                  _minMs: minMs,
                });
              }
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
          const remaining = captionHideAt() - (Date.now() - wallStart);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          await overlayCaption(page, null);
          const last = captionEvents[captionEvents.length - 1];
          last.endMs = Date.now() - wallStart;
        }

        // Only a WAIT_CAPABLE_ACTIONS step can navigate or draw the timer pill, so this is the
        // only place a flush is needed — every other action leaves the current document alone,
        // and its own events (e.g. a "type" step's typeChar events) ride along in the next flush.
        if (WAIT_CAPABLE_ACTIONS.has(step.action)) await collectNewOverlayEvents();

        const endMs = Date.now() - wallStart;
        const frameEnd = capture?.frames.length ?? null;
        const description = describeStep(step, waitMs, values, now);
        entries.push({ caption: step.caption || null, description, note: step.note || null });

        const compression = WAIT_CAPABLE_ACTIONS.has(step.action) ? compressionFor(waitMs, unscaledPacing) : null;

        stepRecords.push({
          sceneId: scene.id,
          stepIndex,
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

      sceneRecords.push({ id: scene.id, chapter: scene.chapter, entries });

      if (scene.still && !fastForward) {
        const stillPath = path.join(stillsDir, `${String(sceneIndex + 1).padStart(2, "0")}-${scene.id}.png`);
        await page.screenshot({ path: stillPath });
      }
    }

    elapsedMs = Date.now() - wallStart;
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
  }

  // Close each caption event still missing an endMs (a caption whose hold never resolved because
  // the run threw) so the vtt/transcript writers below don't choke on a partial record.
  for (const event of captionEvents) {
    if (event.endMs === undefined) event.endMs = event.startMs + event._minMs;
  }

  writeTimeline(path.join(outDir, `${script.name}.timeline.json`), stepRecords);
  fs.writeFileSync(path.join(outDir, `${script.name}.overlay-events.json`), JSON.stringify(overlayEvents, null, 2));
  writeVtt(path.join(outDir, `${script.name}.vtt`), captionEvents);
  writeTranscript(path.join(outDir, `${script.name}.transcript.md`), {
    title: script.title,
    description: script.description,
    sceneRecords,
  });

  // Last gate before any of this can be published: nothing the run was handed as a credential
  // may appear in a text artefact that ships with the video.
  for (const artefact of [`${script.name}.vtt`, `${script.name}.transcript.md`, `${script.name}.timeline.json`, `${script.name}.overlay-events.json`]) {
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
    // Frame paths in the manifest are resolved by ffmpeg relative to the manifest file's own
    // directory (framesDir itself), so they need no "frames/" prefix here.
    writeManifest(manifestPath, capture.frames, script.finalHoldMs, ".");
    const ffmpegBin = resolveFfmpegBinary();
    const outputPath = path.join(outDir, `${script.name}.mp4`);
    console.log(`\nEncoding ${capture.frames.length} frames -> ${outputPath}`);
    encodeVideo({
      ffmpegBin,
      manifestPath,
      outputPath,
      fps,
      width: script.viewport.width,
      height: script.viewport.height,
    });
    console.log(`Wrote ${outputPath}`);
    if (!args.keepFrames) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }
  }

  console.log(`\nDone. ${(elapsedMs / 1000).toFixed(1)}s of scripted timeline, ${stepRecords.length} steps.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
