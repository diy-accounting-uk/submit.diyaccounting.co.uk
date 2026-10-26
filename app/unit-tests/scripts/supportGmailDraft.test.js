// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportGmailDraft.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  parseArgs,
  buildRawMessage,
  createDraft,
  acceptanceRow,
  GMAIL_COMPOSE_SCOPE,
  DRAFTS_URL,
} from "../../../scripts/support-gmail-draft.mjs";

const recorded = JSON.parse(readFileSync(new URL("../fixtures/supportGmailDraft/drafts-create.json", import.meta.url), "utf8"));

function decodeRaw(raw) {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const [head, body] = text.split("\r\n\r\n");
  return { headers: head.split("\r\n"), body: body.replace(/\r\n/g, "\n") };
}

function replayFetch(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: recorded.response.status < 400, status: recorded.response.status, json: async () => recorded.response.body };
  };
}

describe("support-gmail-draft", () => {
  test("requests only the compose scope", () => {
    expect(GMAIL_COMPOSE_SCOPE).toBe("https://www.googleapis.com/auth/gmail.compose");
  });

  test("parseArgs requires thread id, recipient, subject and body file", () => {
    expect(() => parseArgs(["--thread-id", "t"])).toThrow(/required/);
    expect(() => parseArgs(["--bogus", "x"])).toThrow(/unknown/);
    const opts = parseArgs(["--thread-id", "t", "--to", "a@b.c", "--subject", "s", "--body-file", "f"]);
    expect(opts.threadId).toBe("t");
  });

  test("the call matches the recorded users.drafts.create request", async () => {
    const calls = [];
    const draft = await createDraft({
      threadId: recorded.request.message.threadId,
      to: "customer@example.com",
      subject: "Cannot connect to HMRC",
      inReplyTo: "<CAF123@mail.example.com>",
      body: recorded.request.message.body,
      getToken: async () => "tok",
      fetchImpl: replayFetch(calls),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(recorded.request.url);
    expect(calls[0].url).toBe(DRAFTS_URL);
    expect(calls[0].init.method).toBe(recorded.request.method);
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.message.threadId).toBe(recorded.request.message.threadId);
    const raw = decodeRaw(sent.message.raw);
    expect(raw.headers).toEqual(recorded.request.message.headers);
    expect(raw.body).toBe(recorded.request.message.body);
    expect(draft).toEqual({ draftId: "r-5521908300415112345", messageId: "18f3a1b2c3d4e600", threadId: "18f3a1b2c3d4e5f6" });
  });

  test("a subject that already starts with Re: is kept as it is", () => {
    const raw = decodeRaw(buildRawMessage({ to: "a@b.c", subject: "RE: x", inReplyTo: "", body: "b" }));
    expect(raw.headers).toContain("Subject: RE: x");
    expect(raw.headers.some((h) => h.startsWith("In-Reply-To"))).toBe(false);
  });

  test("a header value with a line break is refused", () => {
    expect(() => buildRawMessage({ to: "a@b.c\r\nBcc: x@y.z", subject: "s", inReplyTo: "", body: "b" })).toThrow(/one line/);
  });

  test("an API error fails the call", async () => {
    const failing = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(
      createDraft({ threadId: "t", to: "a@b.c", subject: "s", inReplyTo: "", body: "b", getToken: async () => "tok", fetchImpl: failing }),
    ).rejects.toThrow(/403/);
  });

  test("an API error names Google's reason", async () => {
    const failing = async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: { status: "PERMISSION_DENIED", message: "Gmail API has not been used in project 1 before or it is disabled." },
      }),
    });
    await expect(
      createDraft({ threadId: "t", to: "a@b.c", subject: "s", inReplyTo: "", body: "b", getToken: async () => "tok", fetchImpl: failing }),
    ).rejects.toThrow(
      "Gmail drafts.create answered 403 (PERMISSION_DENIED: Gmail API has not been used in project 1 before or it is disabled.)",
    );
  });

  test("the acceptance row carries the draft id and the issue number", () => {
    const row = acceptanceRow({ draft: { draftId: "d1", threadId: "t1" }, issueNumber: "12", createdAt: "2026-01-01T00:00:00Z" });
    expect(row).toEqual({ kind: "support-draft", draft_id: "d1", thread_id: "t1", issue_number: 12, created_at: "2026-01-01T00:00:00Z" });
  });
});
