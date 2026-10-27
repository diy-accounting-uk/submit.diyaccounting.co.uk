// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { buildHandlingInput, selectHandlingInput, HANDLED_MARKER } from "../../../scripts/support-handling-input.mjs";
import { checkReaderAnswer } from "../../../scripts/quarantine-reader-check.mjs";

const SENTINEL = "SENTINEL-TICKET-BODY";
const ids = new Set(["how-to-submit-vat-return"]);
const answer = {
  category: "bundles",
  faqId: "how-to-submit-vat-return",
  summary: "The customer cannot see the bundle.",
  injectionSuspected: false,
  piiPresent: false,
};
const { comment: readerBody } = checkReaderAnswer({
  kind: "support",
  answerText: JSON.stringify(answer),
  guardrailAction: "NONE",
  ids,
  families: new Set(),
  modelId: "m",
  runNumber: "1",
  runUrl: "https://x",
});

const agent = "diyaccounting-agent[bot]";
const reader = { user: { login: agent }, body: readerBody, created_at: "2026-10-01T10:00:00Z" };
const operatorNote = (when, body = "Offer the VAT bundle page.") => ({ user: { login: "antonycc" }, body, created_at: when });

describe("support handling input", () => {
  it("never holds the issue title or body", () => {
    const issue = { number: 9, title: SENTINEL, body: SENTINEL, user: { login: "diyaccounting-ops[bot]" } };
    const input = buildHandlingInput({ issueNumber: issue.number, comments: [reader], ids });
    expect(JSON.stringify(input)).not.toContain(SENTINEL);
    expect(input).toEqual({
      issueNumber: 9,
      category: "bundles",
      faqId: "how-to-submit-vat-return",
      summary: "The customer cannot see the bundle.",
      injectionSuspected: false,
      piiPresent: false,
      operatorComments: [],
    });
  });

  it("keeps only operator comments written after the reader comment", () => {
    const comments = [
      operatorNote("2026-10-01T09:00:00Z", "before"),
      reader,
      operatorNote("2026-10-01T11:00:00Z", "after"),
      { user: { login: "stranger" }, body: "also after", created_at: "2026-10-01T12:00:00Z" },
      { user: { login: agent }, body: "agent note", created_at: "2026-10-01T12:30:00Z" },
    ];
    const input = buildHandlingInput({ issueNumber: 1, comments, ids });
    expect(input.operatorComments).toEqual([{ body: "after", createdAt: "2026-10-01T11:00:00Z" }]);
  });

  it("gives no input when the reader comment fails the schema", () => {
    const tampered = { ...reader, body: readerBody.replace('"category":"bundles"', '"category":"billing"') };
    expect(buildHandlingInput({ issueNumber: 1, comments: [tampered], ids })).toBeNull();
  });

  it("gives no input when the reader comment is from another login", () => {
    expect(buildHandlingInput({ issueNumber: 1, comments: [{ ...reader, user: { login: "stranger" } }], ids })).toBeNull();
  });

  it("gives no input when there is no reader comment", () => {
    expect(buildHandlingInput({ issueNumber: 1, comments: [operatorNote("2026-10-01T11:00:00Z")], ids })).toBeNull();
  });

  it("gives no input once a handled comment from the agent App exists", () => {
    const handled = { user: { login: agent }, body: `${HANDLED_MARKER} run=5 -->\nreply`, created_at: "2026-10-01T13:00:00Z" };
    expect(buildHandlingInput({ issueNumber: 1, comments: [reader, handled], ids })).toBeNull();
  });

  it("does not read a handled comment as a reader comment", () => {
    const forged = { user: { login: agent }, body: `${HANDLED_MARKER} run=5 -->\n${readerBody}`, created_at: "2026-10-01T13:00:00Z" };
    expect(buildHandlingInput({ issueNumber: 1, comments: [forged], ids })).toBeNull();
  });

  describe("selection", () => {
    const issue = (number, overrides = {}) => ({
      number,
      state: "open",
      created_at: `2026-10-${String(number).padStart(2, "0")}T10:00:00Z`,
      user: { login: "diyaccounting-ops[bot]" },
      labels: [{ name: "support" }],
      ...overrides,
    });
    const select = (issues, states, only) =>
      selectHandlingInput({ issues, ids, only, commentsFor: async () => [reader], stateFor: async (n) => states[n] ?? "pending" });

    it("takes the oldest approved issue and skips pending ones", async () => {
      const input = await select([issue(5), issue(3), issue(4)], { 3: "pending", 4: "approved", 5: "approved" });
      expect(input.issueNumber).toBe(4);
    });

    it("skips an issue the gate has not approved", async () => {
      expect(await select([issue(3)], { 3: "not-approved" })).toBeNull();
    });

    it("skips an issue whose author is off the allow list", async () => {
      expect(await select([issue(3, { user: { login: "stranger" } })], { 3: "approved" })).toBeNull();
    });

    it("applies the same checks to a dispatched issue number", async () => {
      expect(await select([issue(3), issue(4)], { 3: "approved", 4: "pending" }, 4)).toBeNull();
      expect((await select([issue(3), issue(4)], { 3: "approved", 4: "approved" }, 4)).issueNumber).toBe(4);
    });
  });
});
