// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportDraftAcceptance.test.js

import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyDraft, readDraftRows, runAcceptance, summarise } from "../../../scripts/support-draft-acceptance.mjs";
import { bodyDigest } from "../../../scripts/support-gmail-draft.mjs";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DRAFT_BODY = "Hello,\n\nThe fix is live.\n\nDIY Accounting";
const createdAt = "2026-10-10T09:00:00Z";
const row = (id, overrides = {}) => ({
  kind: "support-draft",
  draft_id: `d-${id}`,
  thread_id: `t-${id}`,
  issue_number: 1,
  created_at: createdAt,
  body_sha256: bodyDigest(DRAFT_BODY),
  ...overrides,
});
const sentMessage = (text, at = "2026-10-11T09:00:00Z") => ({
  labelIds: ["SENT"],
  internalDate: String(Date.parse(at)),
  payload: { mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } },
});
const customerMessage = {
  labelIds: ["INBOX"],
  internalDate: String(Date.parse("2026-10-09T09:00:00Z")),
  payload: { mimeType: "text/plain", body: { data: Buffer.from("Help").toString("base64url") } },
};

describe("classifyDraft", () => {
  test("a sent message with the draft's body is accepted", () => {
    const thread = { messages: [customerMessage, sentMessage(`${DRAFT_BODY}\n`)] };
    expect(classifyDraft({ row: row("a"), thread, draftExists: false })).toBe("accepted");
  });

  test("a sent message with a different body is edited", () => {
    const thread = { messages: [customerMessage, sentMessage("Hello, a rewritten reply.")] };
    expect(classifyDraft({ row: row("e"), thread, draftExists: false })).toBe("edited");
  });

  test("a message sent before the draft was made does not count", () => {
    const thread = { messages: [sentMessage("Earlier reply", "2026-10-01T09:00:00Z")] };
    expect(classifyDraft({ row: row("b"), thread, draftExists: true })).toBe("pending");
  });

  test("no sent message and the draft deleted is rejected", () => {
    expect(classifyDraft({ row: row("r"), thread: { messages: [customerMessage] }, draftExists: false })).toBe("rejected");
  });

  test("a deleted thread is rejected", () => {
    expect(classifyDraft({ row: row("g"), thread: null, draftExists: false })).toBe("rejected");
  });

  test("a row without a body digest is unknown", () => {
    expect(classifyDraft({ row: row("u", { body_sha256: undefined }), thread: { messages: [] }, draftExists: true })).toBe("unknown");
  });
});

describe("summarise", () => {
  test("the rate is accepted over the comparable old drafts", () => {
    const summary = summarise({ classes: ["accepted", "edited", "rejected", "pending", "unknown"], tooRecent: 2, nowMs: NOW });
    expect(summary).toMatchObject({ older: 5, too_recent: 2, accepted: 1, unknown: 1, acceptance_rate: 0.25 });
  });

  test("no comparable draft gives a null rate", () => {
    expect(summarise({ classes: [], tooRecent: 1, nowMs: NOW }).acceptance_rate).toBeNull();
  });
});

describe("runAcceptance", () => {
  const threads = {
    "t-a": { messages: [customerMessage, sentMessage(DRAFT_BODY)] },
    "t-e": { messages: [customerMessage, sentMessage("Changed")] },
    "t-r": { messages: [customerMessage] },
  };
  const drafts = new Set();
  const fetchImpl = async (url) => {
    const [, kind, id] = new URL(url).pathname.match(/\/(threads|drafts)\/([^/]+)$/);
    const found = kind === "threads" ? threads[id] : drafts.has(id) ? { id } : undefined;
    return { ok: Boolean(found), status: found ? 200 : 404, json: async () => found };
  };

  test("drafts younger than seven days are counted and not read", async () => {
    const rows = [row("a"), row("e"), row("r"), row("new", { created_at: "2026-10-25T09:00:00Z" })];
    const summary = await runAcceptance({ rows, getToken: async () => "tok", fetchImpl, nowMs: NOW });
    expect(summary).toMatchObject({ older: 3, too_recent: 1, accepted: 1, edited: 1, rejected: 1, pending: 0 });
    expect(summary.acceptance_rate).toBeCloseTo(1 / 3);
  });

  test("a Gmail failure other than not-found stops the run", async () => {
    const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(runAcceptance({ rows: [row("a")], getToken: async () => "tok", fetchImpl: failing, nowMs: NOW })).rejects.toThrow(/500/);
  });
});

describe("readDraftRows", () => {
  test("reads support-draft rows from nested folders and skips other kinds", () => {
    const dir = mkdtempSync(join(tmpdir(), "drafts-"));
    mkdirSync(join(dir, "dt=2026-10-10"));
    writeFileSync(join(dir, "dt=2026-10-10", "1-1.json"), JSON.stringify(row("a")));
    writeFileSync(join(dir, "dt=2026-10-10", "2-1.json"), JSON.stringify({ kind: "other" }));
    expect(readDraftRows(dir).map((r) => r.draft_id)).toEqual(["d-a"]);
  });
});
