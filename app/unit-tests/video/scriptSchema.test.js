// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
    pages: ["web/public/index.html"],
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

describe("fastForward steps", () => {
  const withStep = (step) =>
    baseScript({ auth: "user", scenes: [{ id: "picker", chapter: "Picker", steps: [{ action: "goto", url: "/" }, step] }] });

  test("accepts a step marked fastForward: true", () => {
    expect(() => validateScript(withStep({ action: "hmrcAuthorise", fastForward: true }))).not.toThrow();
  });

  test("rejects a non-boolean fastForward value on a step", () => {
    expect(() => validateScript(withStep({ action: "hmrcAuthorise", fastForward: "yes" }))).toThrow(/steps\[1\]\.fastForward/);
  });
});

describe("testScenario steps", () => {
  const withStep = (auth, step) =>
    baseScript({ auth, scenes: [{ id: "form", chapter: "Form", steps: [{ action: "goto", url: "/" }, step] }] });

  test("names the scenario value it sets", () => {
    expect(() => validateScript(withStep("user", { action: "testScenario", value: "MULTIPLE_LIABILITIES_2018_19" }))).not.toThrow();
    expect(() => validateScript(withStep("user", { action: "testScenario" }))).toThrow(/value/);
  });

  test("needs a signed-in script", () => {
    expect(() => validateScript(withStep("none", { action: "testScenario", value: "SINGLE_PAYMENT" }))).toThrow(/auth to be "user"/);
  });
});

describe("checkHidden steps", () => {
  const withStep = (auth, step) =>
    baseScript({ auth, scenes: [{ id: "form", chapter: "Form", steps: [{ action: "goto", url: "/" }, step] }] });

  test("names the checkbox it ticks", () => {
    expect(() => validateScript(withStep("user", { action: "checkHidden", target: "#allowSyntheticObligations" }))).not.toThrow();
    expect(() => validateScript(withStep("user", { action: "checkHidden" }))).toThrow(/target/);
  });

  test("needs a signed-in script", () => {
    expect(() => validateScript(withStep("none", { action: "checkHidden", target: "#allowSyntheticObligations" }))).toThrow(
      /auth to be "user"/,
    );
  });
});

describe("dropFile steps", () => {
  const withStep = (step) => baseScript({ scenes: [{ id: "upload", chapter: "Upload", steps: [{ action: "goto", url: "/" }, step] }] });

  test("accepts a target and a repo-relative file, with an optional name", () => {
    expect(() => validateScript(withStep({ action: "dropFile", target: "#drop", file: "videos/fixtures/a.csv" }))).not.toThrow();
    expect(() =>
      validateScript(withStep({ action: "dropFile", target: "#drop", file: "videos/fixtures/a.csv", name: "a.csv" })),
    ).not.toThrow();
  });

  test("rejects a step with no file, an empty file or an empty name", () => {
    expect(() => validateScript(withStep({ action: "dropFile", target: "#drop" }))).toThrow(/file/);
    expect(() => validateScript(withStep({ action: "dropFile", target: "#drop", file: "" }))).toThrow(/steps\[1\]\.file/);
    expect(() => validateScript(withStep({ action: "dropFile", target: "#drop", file: "a.csv", name: "" }))).toThrow(/steps\[1\]\.name/);
  });
});

describe("every scene script in the repo", () => {
  const names = fs
    .readdirSync(videosDir)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json") && file !== "publish.json")
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

describe("localApp", () => {
  const withLocalApp = (localApp) => baseScript({ localApp });

  test("accepts a well-formed declaration", () => {
    expect(() =>
      validateScript(withLocalApp({ command: "npx some-tool --web", url: "http://127.0.0.1:9999", readyPattern: "up and running" })),
    ).not.toThrow();
  });

  test("accepts an optional readyTimeoutMs", () => {
    expect(() =>
      validateScript(
        withLocalApp({
          command: "npx some-tool --web",
          url: "http://127.0.0.1:9999",
          readyPattern: "up and running",
          readyTimeoutMs: 60000,
        }),
      ),
    ).not.toThrow();
  });

  test("requires command, url and readyPattern", () => {
    expect(() => validateScript(withLocalApp({ url: "http://127.0.0.1:9999", readyPattern: "ready" }))).toThrow(/command/);
    expect(() => validateScript(withLocalApp({ command: "npx some-tool", readyPattern: "ready" }))).toThrow(/url/);
    expect(() => validateScript(withLocalApp({ command: "npx some-tool", url: "http://127.0.0.1:9999" }))).toThrow(/readyPattern/);
  });

  test("rejects a non-numeric readyTimeoutMs", () => {
    expect(() =>
      validateScript(
        withLocalApp({ command: "npx some-tool", url: "http://127.0.0.1:9999", readyPattern: "ready", readyTimeoutMs: "60000" }),
      ),
    ).toThrow(/readyTimeoutMs/);
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
    expect(() => validateScript(withStep("user", { action: "submitReturn" }))).not.toThrow();
  });

  test("are refused when the script has no user", () => {
    expect(() => validateScript(withStep("none", { action: "login" }))).toThrow(/auth to be "user"/);
    expect(() => validateScript(withStep("none", { action: "submitReturn" }))).toThrow(/auth to be "user"/);
  });

  test("ensureBundle names the bundle it needs", () => {
    expect(() => validateScript(withStep("user", { action: "ensureBundle" }))).toThrow(/bundle/);
  });
});

describe("offCamera scenes", () => {
  const withScene = (sceneOverrides) =>
    baseScript({
      auth: "user",
      scenes: [
        { id: "home", chapter: "Home", steps: [{ action: "goto", url: "/" }] },
        { id: "submit", chapter: "Submit", steps: [{ action: "submitReturn" }], ...sceneOverrides },
      ],
    });

  test("accepts a scene marked offCamera: true", () => {
    expect(() => validateScript(withScene({ offCamera: true }))).not.toThrow();
  });

  test("accepts a scene with no offCamera field at all", () => {
    expect(() => validateScript(withScene({}))).not.toThrow();
  });

  test("rejects a non-boolean offCamera value", () => {
    expect(() => validateScript(withScene({ offCamera: "yes" }))).toThrow(/offCamera/);
  });
});

describe("fastForward scenes", () => {
  const withScene = (sceneOverrides) =>
    baseScript({
      scenes: [{ id: "home", chapter: "Home", steps: [{ action: "goto", url: "/" }], ...sceneOverrides }],
    });

  test("accepts a scene marked fastForward: true", () => {
    expect(() => validateScript(withScene({ fastForward: true }))).not.toThrow();
  });

  test("accepts a scene with no fastForward field at all", () => {
    expect(() => validateScript(withScene({}))).not.toThrow();
  });

  test("rejects a non-boolean fastForward value", () => {
    expect(() => validateScript(withScene({ fastForward: "yes" }))).toThrow(/fastForward/);
  });
});

describe("hmrcServices", () => {
  test("is optional, defaulting elsewhere to mtd-vat", () => {
    expect(() => validateScript(baseScript())).not.toThrow();
  });

  test("accepts a script that also asks for mtd-income-tax", () => {
    expect(() => validateScript(baseScript({ hmrcServices: ["mtd-vat", "mtd-income-tax"] }))).not.toThrow();
  });

  test("rejects an empty array", () => {
    expect(() => validateScript(baseScript({ hmrcServices: [] }))).toThrow(/hmrcServices/);
  });

  test("rejects an unknown service name", () => {
    expect(() => validateScript(baseScript({ hmrcServices: ["mtd-something-else"] }))).toThrow(/hmrcServices/);
  });
});

describe("environments", () => {
  test("is optional, defaulting elsewhere to both ci and prod", () => {
    expect(() => validateScript(baseScript())).not.toThrow();
  });

  test("accepts a ci-only script", () => {
    expect(() => validateScript(baseScript({ environments: ["ci"] }))).not.toThrow();
  });

  test("rejects an empty array", () => {
    expect(() => validateScript(baseScript({ environments: [] }))).toThrow(/environments/);
  });

  test("rejects an unknown environment name", () => {
    expect(() => validateScript(baseScript({ environments: ["staging"] }))).toThrow(/environments/);
  });

  const ciOnlyScripts = ["itsa-business-details", "itsa-quarterly-update", "file-micro-entity-accounts"];

  test.each(ciOnlyScripts)("%s is recorded on a ci set only", (name) => {
    expect(readSceneScript(name).environments).toEqual(["ci"]);
  });

  const allScriptNames = fs
    .readdirSync(videosDir)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json") && file !== "publish.json")
    .map((file) => file.replace(/\.json$/, ""));

  test.each(allScriptNames)("%s declares only known environment values", (name) => {
    const script = readSceneScript(name);
    if (!("environments" in script)) return;
    for (const environment of script.environments) {
      expect(["ci", "prod"]).toContain(environment);
    }
  });
});

describe("fill", () => {
  const withStep = (step) => baseScript({ scenes: [{ id: "home", chapter: "Home", steps: [{ action: "goto", url: "/" }, step] }] });

  test("needs a target and a value", () => {
    expect(() => validateScript(withStep({ action: "fill", target: "#fromDate", value: "{{today}}" }))).not.toThrow();
    expect(() => validateScript(withStep({ action: "fill", target: "#fromDate" }))).toThrow(/value/);
  });
});

describe("consentAnswer", () => {
  test.each(["granted", "declined"])("accepts %s", (answer) => {
    expect(() => validateScript(baseScript({ consentAnswer: answer }))).not.toThrow();
  });

  test("rejects any other answer", () => {
    expect(() => validateScript(baseScript({ consentAnswer: "maybe" }))).toThrow(/consentAnswer/);
  });

  test.each(["sign-in", "tour", "itsa-year"])("%s answers consent before its first frame", (name) => {
    expect(readSceneScript(name).consentAnswer).toBe("declined");
  });
});
