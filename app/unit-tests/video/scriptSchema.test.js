// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/scriptSchema.test.js

import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";
import { validateScript } from "../../../scripts/lib/video/scriptSchema.js";
import { groupFor } from "../../../scripts/lib/video/pacing.js";

const videosDir = path.resolve(process.cwd(), "videos");

function readSceneScript(name) {
  return JSON.parse(fs.readFileSync(path.join(videosDir, `${name}.json`), "utf8"));
}

function baseScript(overrides = {}) {
  return {
    name: "example",
    title: "Example",
    description: "Example",
    auth: "none",
    viewport: { width: 1920, height: 1080 },
    fps: 60,
    pacing: {
      perCharMs: 90,
      betweenActionsMs: 700,
      aroundMotionMs: 600,
      minResidualMs: 150,
      timerThresholdMs: 250,
      timerFullScaleMs: 5000,
      waitCompressionAfterMs: 6000,
      waitCompressionFactor: 8,
    },
    captions: {
      fontPx: 40,
      lineHeightPx: 56,
      maxLines: 2,
      maxCharsPerLine: 46,
      charsPerSecond: 15,
      minMs: 1500,
      fadeMs: 250,
      safeArea: { topPct: 5, bottomPct: 5, sidePct: 12.5 },
    },
    scenes: [{ id: "home", chapter: "Home", steps: [{ action: "goto", url: "/" }] }],
    ...overrides,
  };
}

describe("every scene script in the repo", () => {
  const names = fs
    .readdirSync(videosDir)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json"))
    .map((file) => file.replace(/\.json$/, ""));

  test.each(names)("%s validates", (name) => {
    expect(() => validateScript(readSceneScript(name))).not.toThrow();
  });

  test.each(names)("%s uses only actions the pacing model knows", (name) => {
    for (const scene of readSceneScript(name).scenes) {
      for (const step of scene.steps) {
        expect(() => groupFor(step.action)).not.toThrow();
      }
    }
  });
});

describe("auth", () => {
  test("accepts none and user", () => {
    expect(() => validateScript(baseScript({ auth: "none" }))).not.toThrow();
    expect(() => validateScript(baseScript({ auth: "user" }))).not.toThrow();
  });

  test("rejects any other value", () => {
    expect(() => validateScript(baseScript({ auth: "cognito-native" }))).toThrow(/auth/);
  });
});

describe("journey actions", () => {
  const withStep = (auth, step) =>
    baseScript({ auth, scenes: [{ id: "home", chapter: "Home", steps: [{ action: "goto", url: "/" }, step] }] });

  test("are allowed once the script declares a user", () => {
    expect(() => validateScript(withStep("user", { action: "login" }))).not.toThrow();
    expect(() => validateScript(withStep("user", { action: "consent" }))).not.toThrow();
    expect(() => validateScript(withStep("user", { action: "ensureBundle", bundle: "Day pass" }))).not.toThrow();
    expect(() => validateScript(withStep("user", { action: "hmrcAuthorise" }))).not.toThrow();
  });

  test("are refused when the script has no user", () => {
    expect(() => validateScript(withStep("none", { action: "login" }))).toThrow(/auth to be "user"/);
  });

  test("ensureBundle names the bundle it needs", () => {
    expect(() => validateScript(withStep("user", { action: "ensureBundle" }))).toThrow(/bundle/);
  });
});

describe("fill", () => {
  const withStep = (step) => baseScript({ scenes: [{ id: "home", chapter: "Home", steps: [{ action: "goto", url: "/" }, step] }] });

  test("needs a target and a value", () => {
    expect(() => validateScript(withStep({ action: "fill", target: "#fromDate", value: "{{today}}" }))).not.toThrow();
    expect(() => validateScript(withStep({ action: "fill", target: "#fromDate" }))).toThrow(/value/);
  });
});
