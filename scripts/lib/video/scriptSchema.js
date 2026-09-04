// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/scriptSchema.js
//
// Hand-rolled validator for a scene script (videos/*.json), matching
// videos/scene-script.schema.json. No ajv in this repo, so this is the runtime enforcement; the
// schema file is the documentation and the $schema pointer scripts edit against. A bad script
// throws with the offending path, per the repo rule: throw, don't skip.

const REQUIRED_TOP_LEVEL = ["name", "title", "description", "auth", "viewport", "fps", "pacing", "captions", "scenes"];
const AUTH_VALUES = new Set(["none", "cognito-native"]);

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
  press: ["key"],
  tab: [],
  select: ["target", "value"],
  scroll: [],
  highlight: ["target"],
  caption: ["text"],
  hold: ["ms"],
  await: ["until"],
  still: ["name"],
};

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
    if ("role" in target && "name" in target) return;
    if ("text" in target) return;
  }
  fail(path, "target must be a CSS selector string, {role,name}, or {text}");
}

function validateStep(step, scenePath, sceneId, stepIndex) {
  const path = `${scenePath}.steps[${stepIndex}]`;
  if (!step || typeof step !== "object") fail(path, "step must be an object");
  if (!step.action) fail(path, "missing required field \"action\"");
  if (!(step.action in STEP_REQUIRED_FIELDS)) fail(path, `unknown action "${step.action}"`);
  requireKeys(step, STEP_REQUIRED_FIELDS[step.action], path);
  if ("target" in step) validateTarget(step.target, `${path}.target`);
  return { sceneId, stepIndex, action: step.action };
}

function validateScene(scene, index) {
  const path = `scenes[${index}]`;
  if (!scene || typeof scene !== "object") fail(path, "scene must be an object");
  requireKeys(scene, ["id", "chapter", "steps"], path);
  if (!Array.isArray(scene.steps) || scene.steps.length === 0) fail(`${path}.steps`, "must be a non-empty array");
  scene.steps.forEach((step, stepIndex) => validateStep(step, path, scene.id, stepIndex));
}

// Throws with the offending path on a malformed script; returns the parsed script unchanged
// when it validates, so callers can use validateScript(JSON.parse(text)) inline.
export function validateScript(script) {
  if (!script || typeof script !== "object") fail("$", "script must be a JSON object");
  requireKeys(script, REQUIRED_TOP_LEVEL, "$");

  if (!AUTH_VALUES.has(script.auth)) fail("auth", `must be one of ${[...AUTH_VALUES].join(", ")}`);

  requireKeys(script.viewport || {}, ["width", "height"], "viewport");

  requireKeys(script.pacing || {}, REQUIRED_PACING_KEYS, "pacing");
  requireKeys(script.captions || {}, REQUIRED_CAPTION_KEYS, "captions");
  requireKeys((script.captions || {}).safeArea || {}, ["topPct", "bottomPct", "sidePct"], "captions.safeArea");

  if (!Array.isArray(script.scenes) || script.scenes.length === 0) fail("scenes", "must be a non-empty array");
  script.scenes.forEach(validateScene);

  return script;
}
