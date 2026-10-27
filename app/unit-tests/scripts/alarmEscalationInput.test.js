// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { buildEscalationInput, findMirrorIssue, mirrorMarker } from "../../../scripts/alarm-escalation-input.mjs";
import { checkReaderAnswer } from "../../../scripts/quarantine-reader-check.mjs";

const SENTINEL = "SENTINEL-FIRST-PASS-TEXT";
const families = new Set(["prod-env-github-probe-failed"]);
const answer = {
  stillBroken: "no",
  remedyFamily: "prod-env-github-probe-failed",
  summary: "The probe passed on the next run.",
  injectionSuspected: false,
  piiPresent: false,
};
const { comment: readerBody } = checkReaderAnswer({
  kind: "alarm",
  answerText: JSON.stringify(answer),
  guardrailAction: "NONE",
  ids: new Set(),
  families,
  modelId: "m",
  runNumber: "1",
  runUrl: "https://x",
});
const agent = "diyaccounting-agent[bot]";
const reader = { user: { login: agent }, body: readerBody, created_at: "2026-10-01T10:00:00Z" };

describe("alarm escalation input", () => {
  it("holds the reader's checked fields and the operator's later comments", () => {
    const comments = [
      { user: { login: "antonycc" }, body: "before", created_at: "2026-10-01T09:00:00Z" },
      reader,
      { user: { login: "antonycc" }, body: "Check the deploy window.", created_at: "2026-10-01T11:00:00Z" },
      { user: { login: "stranger" }, body: "also", created_at: "2026-10-01T12:00:00Z" },
    ];
    expect(buildEscalationInput({ comments, families })).toEqual({
      ...answer,
      operatorComments: [{ body: "Check the deploy window.", createdAt: "2026-10-01T11:00:00Z" }],
    });
  });

  it("never holds the text of comments that are not the reader's or the operator's", () => {
    const first = { user: { login: agent }, body: `Triage reasoning ${SENTINEL}`, created_at: "2026-10-01T08:00:00Z" };
    expect(JSON.stringify(buildEscalationInput({ comments: [first, reader], families }))).not.toContain(SENTINEL);
  });

  it("gives no input without a valid reader comment from the agent App", () => {
    expect(buildEscalationInput({ comments: [], families })).toBeNull();
    expect(buildEscalationInput({ comments: [{ ...reader, user: { login: "stranger" } }], families })).toBeNull();
    const tampered = { ...reader, body: readerBody.replace('"stillBroken":"no"', '"stillBroken":"maybe"') };
    expect(buildEscalationInput({ comments: [tampered], families })).toBeNull();
  });

  it("matches the mirror marker as a whole line", () => {
    const marker = mirrorMarker("o/r", 12);
    const longer = { number: 1, body: `Mirror\n\n${mirrorMarker("o/r", 123)}\n` };
    const exact = { number: 2, body: `Mirror\n\n${marker}\n` };
    expect(findMirrorIssue([longer, exact], marker).number).toBe(2);
    expect(findMirrorIssue([longer], marker)).toBeNull();
  });
});
