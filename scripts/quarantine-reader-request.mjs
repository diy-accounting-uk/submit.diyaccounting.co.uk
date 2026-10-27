#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/quarantine-reader-request.mjs
//
// Builds the skeleton of the one Bedrock invoke-model request a quarantine reader sends. The
// skeleton holds everything except the untrusted text: the system prompt (from
// prompts/support-reader.md or prompts/alarm-reader.md, with the allowed values filled in), the
// limits and the assistant prefill. The `tag` and `prefill` keys are working keys for the job
// that adds the text; the job deletes them before it sends the request. The request has no
// `tools` key, so the model cannot act.
//
// usage: quarantine-reader-request.mjs support|alarm
// Writes `request=<base64 of the skeleton JSON>` to $GITHUB_OUTPUT. This job holds no ticket
// text, and it prints none.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SUPPORT_TICKET_CATEGORIES } from "../app/functions/support/supportTicketPost.js";
import { faqIds } from "./support-triage-public-half.mjs";

export const READER_MAX_TOKENS = 400;
export const READER_PREFILL = "{";
export const READER_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

const KINDS = {
  support: { promptPath: "prompts/support-reader.md", tag: "ticket" },
  alarm: { promptPath: "prompts/alarm-reader.md", tag: "analysis" },
};

export function buildRequestSkeleton({ kind, promptText, categories, faqIdList, familyList }) {
  const spec = KINDS[kind];
  if (!spec) throw new Error("the kind must be support or alarm");
  const system = promptText
    .replaceAll("{{CATEGORIES}}", (categories ?? []).join(", "))
    .replaceAll("{{FAQ_IDS}}", (faqIdList ?? []).join(", "))
    .replaceAll("{{REMEDY_FAMILIES}}", (familyList ?? []).join(", "));
  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: READER_MAX_TOKENS,
    temperature: 0,
    system,
    tag: spec.tag,
    prefill: READER_PREFILL,
  };
}

function main() {
  const kind = process.argv[2];
  if (!KINDS[kind]) {
    console.error("usage: quarantine-reader-request.mjs support|alarm");
    process.exit(1);
  }
  const promptText = readFileSync(KINDS[kind].promptPath, "utf8");
  const skeleton = buildRequestSkeleton({
    kind,
    promptText,
    categories: SUPPORT_TICKET_CATEGORIES,
    faqIdList: [...faqIds(readFileSync("web/public/faqs.toml", "utf8"))],
    familyList: JSON.parse(readFileSync("app/data/alarm-remedies.json", "utf8")).map((row) => row.family),
  });
  const encoded = Buffer.from(JSON.stringify(skeleton)).toString("base64");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `request=${encoded}\n`);
  console.log(`request skeleton built for ${kind}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
