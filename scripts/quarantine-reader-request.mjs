#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/quarantine-reader-request.mjs
//
// Builds the skeleton of the one Bedrock Converse request a quarantine reader sends. The
// skeleton holds everything except the untrusted text: the system prompt (from
// prompts/alarm-reader.md, with the allowed values filled in), the
// limits and the assistant prefill. The `tag` and `prefill` keys are working keys for the job
// that adds the text; the job deletes them before it sends the request. The request has no
// `toolConfig` key, so the model cannot act.
//
// usage: quarantine-reader-request.mjs alarm
// Writes `request=<base64 of the skeleton JSON>` to $GITHUB_OUTPUT. This job holds no ticket
// text, and it prints none.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const READER_MAX_TOKENS = 400;
export const READER_PREFILL = "{";
export const READER_MODEL_ID = "amazon.nova-pro-v1:0";

const KINDS = {
  alarm: { promptPath: "prompts/alarm-reader.md", tag: "analysis" },
};

export function buildRequestSkeleton({ kind, promptText, familyList }) {
  const spec = KINDS[kind];
  if (!spec) throw new Error("the kind must be alarm");
  const system = promptText.replaceAll("{{REMEDY_FAMILIES}}", (familyList ?? []).join(", "));
  return {
    system: [{ text: system }],
    inferenceConfig: { maxTokens: READER_MAX_TOKENS, temperature: 0 },
    tag: spec.tag,
    prefill: READER_PREFILL,
  };
}

function main() {
  const kind = process.argv[2];
  if (!KINDS[kind]) {
    console.error("usage: quarantine-reader-request.mjs alarm");
    process.exit(1);
  }
  const promptText = readFileSync(KINDS[kind].promptPath, "utf8");
  const skeleton = buildRequestSkeleton({
    kind,
    promptText,
    familyList: JSON.parse(readFileSync("app/data/alarm-remedies.json", "utf8")).map((row) => row.family),
  });
  const encoded = Buffer.from(JSON.stringify(skeleton)).toString("base64");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `request=${encoded}\n`);
  console.log(`request skeleton built for ${kind}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
