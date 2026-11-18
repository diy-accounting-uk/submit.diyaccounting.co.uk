// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/bedrockModels.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BEDROCK_MODELS,
  BEDROCK_MODEL_IDS,
  bedrockComponentExpression,
  bedrockModelCondition,
  bedrockModelObservationId,
  bedrockOtherCondition,
} from "../../lib/bedrockModels.js";
import { ALLOWED_MODEL_IDS } from "../../../scripts/nova-agent.mjs";
import { OBJECTIVE_DEFINITIONS } from "../../functions/analytics/operatorSnapshotPublish.js";

const WORKFLOW_MODEL_VARIABLES = {
  "alarm-triage.yml": ["TRIAGE_MODEL_ID", "READER_MODEL_ID"],
  "dashboard-review-nightly.yml": ["REVIEW_MODEL_ID"],
  "alarm-replay.yml": ["NOVA_MODEL_ID"],
};

describe("bedrockModels", () => {
  test("nova-agent allows exactly the listed models", () => {
    expect(ALLOWED_MODEL_IDS).toEqual(BEDROCK_MODEL_IDS);
  });

  test.each(Object.entries(WORKFLOW_MODEL_VARIABLES))("%s names only listed model ids", (file, variables) => {
    const text = readFileSync(new URL(`../../../.github/workflows/${file}`, import.meta.url), "utf8");
    for (const variable of variables) {
      const match = text.match(new RegExp(`^\\s*${variable}:\\s*'([^']+)'`, "m"));
      expect(match, `${file} ${variable}`).not.toBeNull();
      expect(BEDROCK_MODEL_IDS, `${file} ${variable}`).toContain(match[1]);
    }
  });

  test("each model has its own condition and the other row is the complement", () => {
    expect(bedrockModelCondition(BEDROCK_MODELS[0])).toContain("charge_description LIKE '%NovaPro%'");
    expect(bedrockModelCondition(BEDROCK_MODELS[0])).toContain("charge_description LIKE '%Nova Pro%'");
    expect(bedrockModelCondition(BEDROCK_MODELS[1])).toContain("charge_description LIKE '%Nova2.0Lite%'");
    const other = bedrockOtherCondition();
    for (const model of BEDROCK_MODELS) expect(other).toContain(`NOT (${BEDROCK_MODELS.map(bedrockModelCondition).join(" OR ")})`);
    expect(other.startsWith("(service_name LIKE '%Bedrock%'")).toBe(true);
  });

  test("the chart's component expression names each model and falls back to other", () => {
    const expression = bedrockComponentExpression();
    for (const model of BEDROCK_MODELS) expect(expression).toContain(`THEN '${model.modelId}'`);
    expect(expression).toContain("ELSE 'other' END");
  });

  test("the AWS costs table has a row for each model and for the rest, after the all-models row", () => {
    const rows = OBJECTIVE_DEFINITIONS.find((objective) => objective.id === "low-running-cost").observations;
    const ids = rows.map((row) => row.id);
    const allModels = ids.indexOf("cost-bedrock-usd");
    expect(rows[allModels].label).toBe("Bedrock, all models");
    expect(ids.slice(allModels + 1, allModels + 1 + BEDROCK_MODELS.length)).toEqual(BEDROCK_MODELS.map(bedrockModelObservationId));
    expect(ids[allModels + 1 + BEDROCK_MODELS.length]).toBe("cost-bedrock-other-usd");
    expect(rows[ids.indexOf("cost-bedrock-other-usd")].label).toBe("Bedrock, other");
    for (const model of BEDROCK_MODELS) {
      expect(rows.find((row) => row.id === bedrockModelObservationId(model)).view).toBe("v_cost_by_resource_daily");
    }
  });
});
