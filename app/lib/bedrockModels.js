// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/bedrockModels.js
//
// The Bedrock models this estate calls. scripts/nova-agent.mjs allows these model ids, the
// operator snapshot gives each its own row and line in the AWS costs figures, and a unit test
// fails when a workflow names a model id that is not here.
//
// An Amazon model bills under the service "Amazon Bedrock" with the model in `charge_description`
// (v_cost_by_resource_daily). `chargeDescriptionContains` lists the texts that find it there.

export const BEDROCK_MODELS = [
  {
    modelId: "amazon.nova-pro-v1:0",
    label: "Nova Pro",
    chargeDescriptionContains: ["NovaPro", "Nova Pro"],
  },
  {
    modelId: "global.amazon.nova-2-lite-v1:0",
    label: "Nova 2 Lite",
    chargeDescriptionContains: ["Nova2.0Lite"],
  },
];

export const DEFAULT_BEDROCK_MODEL_ID = BEDROCK_MODELS[0].modelId;
export const BEDROCK_MODEL_IDS = BEDROCK_MODELS.map((model) => model.modelId);

// The component id of every charge that no model in the list claims.
export const BEDROCK_OTHER_ID = "other";

// Observation id of a model's cost row.
export function bedrockModelObservationId(model) {
  return `cost-bedrock-${model.modelId.replace(/^(global\.)?amazon\./, "").replace(/-v\d+:\d+$/, "")}-usd`;
}

/** SQL condition on v_cost_by_resource_daily that is true for the charges of one model. */
export function bedrockModelCondition(model) {
  const texts = model.chargeDescriptionContains.map((text) => `charge_description LIKE '%${text}%'`).join(" OR ");
  return `(service_name = 'Amazon Bedrock' AND (${texts}))`;
}

/** SQL condition that is true for every Bedrock charge that no model in the list claims. */
export function bedrockOtherCondition() {
  const claimed = BEDROCK_MODELS.map(bedrockModelCondition).join(" OR ");
  return `(service_name LIKE '%Bedrock%' AND NOT (${claimed}))`;
}

/** SQL expression that names the component (model id or "other") of a Bedrock charge. */
export function bedrockComponentExpression() {
  const cases = BEDROCK_MODELS.map((model) => `WHEN ${bedrockModelCondition(model)} THEN '${model.modelId}'`).join(" ");
  return `CASE ${cases} ELSE '${BEDROCK_OTHER_ID}' END`;
}
