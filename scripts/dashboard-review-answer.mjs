// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/dashboard-review-answer.mjs
//
// Accepts the judge's answer for one batch only as exactly one JSON object that fits the schema
// in app/lib/dashboardReviewSchema.js. A rejection returns issue paths and codes and keeps no
// word of the model's text. The helpers below move the accepted text through the guardrail and
// turn the accepted value into findings that name panels.

import { tabAnswerSchema } from "../app/lib/dashboardReviewSchema.js";

function safeSegment(segment) {
  return /^\w+$/.test(String(segment)) ? String(segment) : "?";
}

/**
 * @param {object} input
 * @param {string} input.text the model's answer text
 * @param {{ tabId: string, imageCount?: number, images?: object[] }} input.batch
 * @param {{ tag: string, list: string }[]} input.tags the skill's tag table
 * @returns {{ ok: true, value: object } | { ok: false, issues: { path: string, code: string }[] }}
 */
export function checkTabAnswer({ text, batch, tags }) {
  const trimmed = String(text ?? "").trim();
  let parsed;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = undefined;
    }
  }
  if (parsed === undefined || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, issues: [{ path: "answer", code: "not_one_json_object" }] };
  }
  const imageCount = batch.imageCount ?? batch.images.length;
  const result = tabAnswerSchema({ tabId: batch.tabId, imageCount, tags }).safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.length ? issue.path.map(safeSegment).join(".") : "answer",
      code: safeSegment(issue.code),
    })),
  };
}

const FINDING_FIELDS = ["finding", "evidence", "change"];
const ROW_FIELDS = ["title", "action"];

/** The text fields of an accepted answer, in a fixed order. */
export function textFields(value) {
  const fields = [];
  value.findings.forEach((entry, index) =>
    FINDING_FIELDS.forEach((name) => fields.push({ list: "findings", index, name, text: entry[name] })),
  );
  value.proposedRows.forEach((entry, index) =>
    ROW_FIELDS.forEach((name) => fields.push({ list: "proposedRows", index, name, text: entry[name] })),
  );
  return fields;
}

/** Fields never hold a line break (the schema rejects it), so a line break joins them for one guardrail call. */
export function joinFields(fields) {
  return fields.map((field) => field.text).join("\n");
}

/** @returns {string[]|null} null when the guardrail's text does not split back into one text for each field */
export function splitFields(text, count) {
  const parts = String(text).split("\n");
  return parts.length === count && parts.every((part) => part.length > 0) ? parts : null;
}

/** @returns {object} a copy of the answer with each field's text replaced, in the order of textFields */
export function replaceFields(value, texts) {
  const copy = JSON.parse(JSON.stringify(value));
  textFields(value).forEach((field, position) => {
    copy[field.list][field.index][field.name] = texts[position];
  });
  return copy;
}

/**
 * @param {object} input
 * @param {object} input.value an accepted answer
 * @param {string[]} input.panelIds the panel id of each image of the batch, in image order
 * @returns {{ findings: object[], rows: object[] }} findings and proposed rows that name their panel and tab
 */
export function answerFindings({ value, panelIds }) {
  const panelOf = (image) => panelIds[image - 1];
  const findings = value.findings.map((entry) => ({
    tab: value.tabId,
    panel: panelOf(entry.image),
    tag: entry.tag,
    list: entry.list,
    finding: entry.finding,
    evidence: entry.evidence,
    change: entry.change,
    source: "model",
  }));
  const rows = value.proposedRows.map((row) => {
    const observation = value.findings.find((entry) => entry.image === row.image && entry.list === "observation");
    return {
      tab: value.tabId,
      panel: panelOf(row.image),
      prefix: row.prefix,
      title: row.title,
      action: row.action,
      tag: observation.tag,
    };
  });
  return { findings, rows };
}
