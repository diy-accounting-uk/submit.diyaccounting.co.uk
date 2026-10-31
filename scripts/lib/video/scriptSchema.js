// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-91 Validate video scene scripts and timing
// - **Use when:** a scene script needs schema validation, a recorded timeline needs acceptance checks, or only the affected scenes should re-record.
// - **Does:** scriptSchema.js is a hand-rolled validator for a scene script against videos/scene-script.schema.json, throwing on a bad path rather than skipping it. checks.js runs the acceptance checks, such as timing match and typing cadence, against a recorded timeline. check-video-timings.js runs those checks from the command line. video-scenes-to-record.mjs diffs git to find which scene files changed, and video-scripts-for-changed-files.mjs finds which scene scripts reference a given set of changed code files.
// - **Run:** `node scripts/check-video-timings.js <timeline.json>`; `node scripts/video-scenes-to-record.mjs --publish videos/publish.json --recorded <recorded-file>`; `node scripts/video-scripts-for-changed-files.mjs --environment <env>`
// - **Entry:** `scripts/lib/video/scriptSchema.js`; `scripts/lib/video/checks.js`; `scripts/check-video-timings.js`
// - **Files:** scripts/lib/video/scriptSchema.js, scripts/lib/video/checks.js, scripts/check-video-timings.js, scripts/video-scenes-to-record.mjs, scripts/video-scripts-for-changed-files.mjs, app/unit-tests/video/scriptSchema.test.js, app/unit-tests/video/checks.test.js, app/unit-tests/video/scenesToRecord.test.js, app/unit-tests/scripts/videoScriptsForChangedFiles.test.js, app/unit-tests/videoScenePages.test.js
// - **Keywords:** scene script validation, schema, timing checks, typing cadence, changed files, scenes to record
// - **Related:** OPS-88, OPS-92
// @end-capability

// scripts/lib/video/scriptSchema.js
//
// Hand-rolled validator for a scene script (videos/*.json), matching
// videos/scene-script.schema.json. No ajv in this repo, so this is the runtime enforcement; the
// schema file is the documentation and the $schema pointer scripts edit against. A bad script
// throws with the offending path, per the repo rule: throw, don't skip.

const REQUIRED_TOP_LEVEL = ["name", "title", "description", "auth", "pages", "viewport", "fps", "pacing", "captions", "scenes"];
// "user" says the journey needs a signed-in account. Which identity provider signs it in comes
// from TEST_AUTH_PROVIDER at run time, never from the script, so one script proves locally
// against the simulator and records against a deployment through the Cognito Hosted UI.
const AUTH_VALUES = new Set(["none", "user"]);
const CONSENT_ANSWERS = new Set(["granted", "declined"]);

const REQUIRED_PACING_KEYS = [
  "perCharMs",
  "betweenActionsMs",
  "aroundMotionMs",
  "minResidualMs",
  "timerThresholdMs",
  "timerFullScaleMs",
  "waitCompressionAfterMs",
  "waitCompressionFactor",
];

const REQUIRED_CAPTION_KEYS = ["fontPx", "lineHeightPx", "maxLines", "maxCharsPerLine", "charsPerSecond", "minMs", "fadeMs", "safeArea"];

const STEP_REQUIRED_FIELDS = {
  goto: ["url"],
  click: ["target"],
  point: ["target"],
  type: ["target", "text"],
  fill: ["target", "value"],
  press: ["key"],
  tab: [],
  select: ["target", "value"],
  dropFile: ["target", "file"],
  testScenario: ["value"],
  checkHidden: ["target"],
  notePeriod: [],
  scroll: [],
  highlight: ["target"],
  sheetPrepare: [],
  sheetZoom: ["percent"],
  sheetCell: ["cell"],
  sheetType: ["text"],
  sheetPoint: ["cell"],
  caption: ["text"],
  hold: ["ms"],
  await: ["until"],
  still: ["name"],
  login: [],
  hostedUiLogin: [],
  consent: [],
  ensureBundle: ["bundle"],
  hmrcAuthorise: [],
  companiesHouseAuthorise: [],
  submitReturn: [],
};

// Steps the recorder runs itself, without the page: scrollTo has nothing to scroll for them.
const NO_SCROLL_TO_ACTIONS = new Set(["caption", "hold", "still"]);

// Actions that run one of the behaviour tests' journey step functions. They drive credentials
// and a real identity provider, so a script may only use them once it has declared auth "user".
const USER_ONLY_ACTIONS = new Set([
  "testScenario",
  "checkHidden",
  "notePeriod",
  "login",
  "hostedUiLogin",
  "consent",
  "ensureBundle",
  "hmrcAuthorise",
  "companiesHouseAuthorise",
  "submitReturn",
]);

// HMRC sandbox services a script may ask its minted test user to be enrolled in. Defaults to
// ["mtd-vat"] when a script omits the field, so an existing VAT-only script needs no change.
const ALLOWED_HMRC_SERVICES = new Set(["mtd-vat", "mtd-income-tax"]);

// Where a script can be recorded. Defaults to both when a script omits the field, so an
// existing script needs no change.
const ALLOWED_ENVIRONMENTS = new Set(["ci", "prod", "simulator"]);

// Frames render at this multiple of the CSS viewport (3840x2160 for a 1920x1080 layout) unless
// a script overrides deviceScaleFactor, so YouTube's re-encode draws its higher-bitrate ladder
// from a 4K source instead of a 1080p one.
export const DEFAULT_DEVICE_SCALE_FACTOR = 2;

export function effectiveScaleFactor(script) {
  return script.deviceScaleFactor || DEFAULT_DEVICE_SCALE_FACTOR;
}

function fail(path, message) {
  throw new Error(`scene script invalid at ${path}: ${message}`);
}

function requireKeys(obj, keys, path) {
  for (const key of keys) {
    if (!(key in obj)) fail(path, `missing required field "${key}"`);
  }
}

function validateTarget(target, path) {
  if (typeof target === "string") {
    if (target.length === 0) fail(path, "target string must not be empty");
    return;
  }
  if (target && typeof target === "object") {
    if ("frame" in target) {
      if (typeof target.frame !== "string" || target.frame.length === 0) fail(path, "target frame must be a non-empty selector");
      if ("selector" in target || "text" in target || ("role" in target && "name" in target)) return;
    } else {
      if ("role" in target && "name" in target) return;
      if ("text" in target) return;
    }
  }
  fail(path, "target must be a CSS selector string, {role,name}, {text}, or one of those with a frame selector ({frame,selector})");
}

function validateStep(step, scenePath, sceneId, stepIndex, auth) {
  const path = `${scenePath}.steps[${stepIndex}]`;
  if (!step || typeof step !== "object") fail(path, "step must be an object");
  if (!step.action) fail(path, 'missing required field "action"');
  if (!(step.action in STEP_REQUIRED_FIELDS)) fail(path, `unknown action "${step.action}"`);
  requireKeys(step, STEP_REQUIRED_FIELDS[step.action], path);
  if ("target" in step) validateTarget(step.target, `${path}.target`);
  if ("scrollTo" in step) {
    if (NO_SCROLL_TO_ACTIONS.has(step.action)) fail(`${path}.scrollTo`, `a "${step.action}" step has no page to scroll`);
    validateTarget(step.scrollTo, `${path}.scrollTo`);
  }
  if (step.action === "dropFile") {
    if (typeof step.file !== "string" || step.file.length === 0) fail(`${path}.file`, "must be a non-empty repo-relative path");
    if ("name" in step && (typeof step.name !== "string" || step.name.length === 0)) fail(`${path}.name`, "must be a non-empty string");
  }
  if ("fastForward" in step && typeof step.fastForward !== "boolean") fail(`${path}.fastForward`, "must be a boolean");
  if (USER_ONLY_ACTIONS.has(step.action) && auth !== "user") {
    fail(path, `action "${step.action}" needs the script's auth to be "user", not "${auth}"`);
  }
  return { sceneId, stepIndex, action: step.action };
}

function validateScene(scene, index, auth) {
  const path = `scenes[${index}]`;
  if (!scene || typeof scene !== "object") fail(path, "scene must be an object");
  requireKeys(scene, ["id", "chapter", "steps"], path);
  if ("offCamera" in scene && typeof scene.offCamera !== "boolean") fail(`${path}.offCamera`, "must be a boolean");
  if ("fastForward" in scene && typeof scene.fastForward !== "boolean") fail(`${path}.fastForward`, "must be a boolean");
  if (!Array.isArray(scene.steps) || scene.steps.length === 0) fail(`${path}.steps`, "must be a non-empty array");
  scene.steps.forEach((step, stepIndex) => validateStep(step, path, scene.id, stepIndex, auth));
}

// Throws with the offending path on a malformed script; returns the parsed script unchanged
// when it validates, so callers can use validateScript(JSON.parse(text)) inline.
export function validateScript(script) {
  if (!script || typeof script !== "object") fail("$", "script must be a JSON object");
  requireKeys(script, REQUIRED_TOP_LEVEL, "$");

  if (!AUTH_VALUES.has(script.auth)) fail("auth", `must be one of ${[...AUTH_VALUES].join(", ")}`);

  if (!Array.isArray(script.pages) || script.pages.length === 0) {
    fail("pages", "must be a non-empty array of web/public/ page paths");
  }
  for (const page of script.pages) {
    if (typeof page !== "string" || page.length === 0) fail("pages", "each entry must be a non-empty string");
  }

  if ("hmrcServices" in script) {
    if (!Array.isArray(script.hmrcServices) || script.hmrcServices.length === 0) {
      fail("hmrcServices", "must be a non-empty array of HMRC service names");
    }
    for (const service of script.hmrcServices) {
      if (!ALLOWED_HMRC_SERVICES.has(service)) fail("hmrcServices", `unknown HMRC service "${service}"`);
    }
  }

  if ("fullWidthFrames" in script && typeof script.fullWidthFrames !== "boolean") {
    fail("fullWidthFrames", "must be true or false");
  }

  if ("localApp" in script) {
    const localAppPath = "localApp";
    if (!script.localApp || typeof script.localApp !== "object") fail(localAppPath, "must be an object");
    requireKeys(script.localApp, ["command", "url", "readyPattern"], localAppPath);
    if (typeof script.localApp.command !== "string" || script.localApp.command.length === 0) {
      fail(`${localAppPath}.command`, "must be a non-empty string");
    }
    if (typeof script.localApp.url !== "string" || script.localApp.url.length === 0) {
      fail(`${localAppPath}.url`, "must be a non-empty string");
    }
    if (typeof script.localApp.readyPattern !== "string" || script.localApp.readyPattern.length === 0) {
      fail(`${localAppPath}.readyPattern`, "must be a non-empty string");
    }
    if ("readyTimeoutMs" in script.localApp && typeof script.localApp.readyTimeoutMs !== "number") {
      fail(`${localAppPath}.readyTimeoutMs`, "must be a number");
    }
  }

  if ("consentAnswer" in script && !CONSENT_ANSWERS.has(script.consentAnswer)) {
    fail("consentAnswer", `must be one of ${[...CONSENT_ANSWERS].join(", ")}`);
  }

  if ("environments" in script) {
    if (!Array.isArray(script.environments) || script.environments.length === 0) {
      fail("environments", "must be a non-empty array of environment names");
    }
    for (const environment of script.environments) {
      if (!ALLOWED_ENVIRONMENTS.has(environment)) fail("environments", `unknown environment "${environment}"`);
    }
  }
  requireKeys(script.viewport || {}, ["width", "height"], "viewport");

  requireKeys(script.pacing || {}, REQUIRED_PACING_KEYS, "pacing");
  requireKeys(script.captions || {}, REQUIRED_CAPTION_KEYS, "captions");
  requireKeys((script.captions || {}).safeArea || {}, ["topPct", "bottomPct", "sidePct"], "captions.safeArea");

  if (!Array.isArray(script.scenes) || script.scenes.length === 0) fail("scenes", "must be a non-empty array");
  script.scenes.forEach((scene, index) => validateScene(scene, index, script.auth));

  return script;
}
