// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/calculationFigures.test.js
//
// HMRC's sandbox answers a calculation retrieve that carries no Gov-Test-Scenario with its
// schema-boundary example body (-99999999999.99). A scene script that retrieves a calculation
// must pick one of the realistic calculation scenarios first, and no script may fill or expect
// that placeholder.

import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";

const PLACEHOLDER = "99999999999";
const CALCULATION_SCENARIOS = ["UK_SE_GIFTAID_EXAMPLE", "SCOT_SE_DIVIDENDS_EXAMPLE"];

const videosDir = path.resolve("videos");
const sceneScripts = fs
  .readdirSync(videosDir)
  .filter((name) => name.startsWith("itsa-") && name.endsWith(".json"))
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => Array.isArray(script.scenes));

function placeholderSteps(script) {
  return script.scenes.flatMap((scene) =>
    (scene.steps || []).filter((step) => JSON.stringify([step.value, step.text, step.until, step.caption]).includes(PLACEHOLDER)),
  );
}

function calculationRetrieveIndex(scene) {
  const steps = scene.steps || [];
  const opensCalculationPage = steps.some((step) => step.action === "goto" && String(step.url).includes("taxCalculation.html"));
  const awaitsDeclaration = steps.some((step) => step.action === "await" && String(step.until).includes("#declarationContainer"));
  return steps.findIndex(
    (step) =>
      step.action === "click" &&
      ((opensCalculationPage && step.target === "#triggerBtn") ||
        (awaitsDeclaration && step.target === "#retrieveBtn") ||
        step.target === "#showEarlierYearBtn"),
  );
}

function scenesRetrievingWithoutScenario(script) {
  return script.scenes.filter((scene) => {
    const retrieveIndex = calculationRetrieveIndex(scene);
    if (retrieveIndex === -1) return false;
    return !scene.steps
      .slice(0, retrieveIndex)
      .some((step) => step.action === "testScenario" && CALCULATION_SCENARIOS.includes(step.value));
  });
}

describe("calculation figures in scene scripts", () => {
  test.each(sceneScripts.map(({ name, script }) => [name, script]))(
    "%s: no step fills or expects the sandbox placeholder",
    (name, script) => {
      expect(placeholderSteps(script)).toEqual([]);
    },
  );

  test.each(sceneScripts.map(({ name, script }) => [name, script]))(
    "%s: every calculation retrieve is preceded by a calculation scenario",
    (name, script) => {
      expect(scenesRetrievingWithoutScenario(script).map((scene) => scene.id)).toEqual([]);
    },
  );

  test("a scene that retrieves a calculation with no scenario is rejected", () => {
    const script = { scenes: [{ id: "calc", steps: [{ action: "click", target: "#showEarlierYearBtn" }] }] };
    expect(scenesRetrievingWithoutScenario(script).map((scene) => scene.id)).toEqual(["calc"]);
  });

  test("a final declaration scene that retrieves with no scenario is rejected", () => {
    const script = {
      scenes: [
        {
          id: "declare",
          steps: [
            { action: "click", target: "#retrieveBtn" },
            { action: "await", until: "#declarationContainer" },
          ],
        },
      ],
    };
    expect(scenesRetrievingWithoutScenario(script).map((scene) => scene.id)).toEqual(["declare"]);
  });

  test("a step that expects the placeholder figure is rejected", () => {
    const script = { scenes: [{ steps: [{ action: "await", until: "#figure:has-text('-99999999999.99')" }] }] };
    expect(placeholderSteps(script)).toHaveLength(1);
  });
});
