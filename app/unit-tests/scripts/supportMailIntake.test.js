// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportMailIntake.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  GMAIL_READONLY_SCOPE,
  ISSUE_LABELS,
  addressOf,
  afterEpochSecondsFor,
  buildIssueBody,
  buildIssueTitle,
  buildSearchQuery,
  filedThreadIds,
  isCustomerSender,
  readThread,
  runIntake,
} from "../../../scripts/support-mail-intake.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/supportMailIntake/${name}.json`, import.meta.url), "utf8"));
const list = fixture("threads-list");
const threads = {
  "18f0a1b2c3d4e5f6": fixture("thread-customer"),
  "18f0a1b2c3d4e5f7": fixture("thread-own-first"),
  "18f0a1b2c3d4e5f8": fixture("thread-html"),
};
const NOW = Date.parse("2026-10-27T12:00:00Z");

function replayFetch({ issues = [], calls = [] } = {}) {
  return async (url, init = {}) => {
    calls.push({ url, init });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.startsWith("https://api.github.com") && init.method === "POST") return ok({});
    if (url.startsWith("https://api.github.com")) return ok(issues);
    if (url.includes("/threads?")) return ok(list);
    const id = decodeURIComponent(url.match(/\/threads\/([^?]+)/)[1]);
    return threads[id] ? ok(threads[id]) : { ok: false, status: 404, json: async () => ({}) };
  };
}

describe("support-mail-intake", () => {
  test("requests only the read scope", () => {
    expect(GMAIL_READONLY_SCOPE).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  test("the search query selects inbox mail after the cut-off and excludes our addresses and automated senders", () => {
    expect(buildSearchQuery({ afterEpochSeconds: 1792000000.9 })).toBe(
      "in:inbox after:1792000000 -from:diyaccounting.co.uk -from:polycode.co.uk -from:no-reply -from:noreply -from:do-not-reply -from:donotreply -from:mailer-daemon -from:postmaster -from:notifications@github.com -from:notifications@stripe.com -from:support@stripe.com -from:service@paypal.co.uk -from:service@paypal.com -from:noreply@google.com",
    );
  });

  test("the sender filter keeps customers and drops our own and automated senders", () => {
    expect(addressOf("Ann Example <Ann@Example.com>")).toBe("ann@example.com");
    expect(isCustomerSender("Ann <ann@example.com>")).toBe(true);
    expect(isCustomerSender("antony@polycode.co.uk")).toBe(false);
    expect(isCustomerSender("Support <support@diyaccounting.co.uk>")).toBe(false);
    expect(isCustomerSender("x@mail.diyaccounting.co.uk")).toBe(false);
    expect(isCustomerSender("no-reply@example.com")).toBe(false);
    expect(isCustomerSender("noreply+abc@example.com")).toBe(false);
    expect(isCustomerSender("MAILER-DAEMON@example.com")).toBe(false);
    expect(isCustomerSender("notifications@github.com")).toBe(false);
    expect(isCustomerSender("")).toBe(false);
  });

  test("a thread whose first message is ours is not customer mail", () => {
    expect(readThread(threads["18f0a1b2c3d4e5f7"])).toBeNull();
  });

  test("the issue body carries the ids and fences the message text past any backticks inside it", () => {
    const thread = readThread(threads["18f0a1b2c3d4e5f6"]);
    expect(thread).toMatchObject({
      threadId: "18f0a1b2c3d4e5f6",
      sender: "ann@example.com",
      subject: "Cannot connect to HMRC",
      messageId: "<CAF123@mail.example.com>",
    });
    const body = buildIssueBody(thread);
    expect(body).toContain("Gmail-Thread-Id: 18f0a1b2c3d4e5f6");
    expect(body).toContain("Sender: ann@example.com");
    expect(body).toContain("Message-ID: <CAF123@mail.example.com>");
    expect(body).toContain("````text\nHello,");
    expect(body.trimEnd().endsWith("````")).toBe(true);
    expect(buildIssueTitle(thread.subject)).toBe("Support email: Cannot connect to HMRC");
  });

  test("an HTML-only message is reduced to its text", () => {
    expect(readThread(threads["18f0a1b2c3d4e5f8"]).text).toBe("Please send an invoice.");
  });

  test("a long subject is cut to one line", () => {
    const title = buildIssueTitle(`a\nb ${"x".repeat(300)}`);
    expect(title).not.toMatch(/\n/);
    expect(title.length).toBeLessThan(140);
  });

  test("the cut-off is a day before the newest filed thread, else three days back", () => {
    expect(afterEpochSecondsFor({ issues: [], nowMs: NOW })).toBe(NOW / 1000 - 3 * 86400);
    const issues = [
      { body: "Received: 2026-10-20T00:00:00.000Z" },
      { body: "Received: 2026-10-25T00:00:00.000Z" },
      { body: "from the form" },
    ];
    expect(afterEpochSecondsFor({ issues, nowMs: NOW })).toBe(Date.parse("2026-10-24T00:00:00Z") / 1000);
  });

  test("a run opens an issue for each new customer thread with both labels", async () => {
    const calls = [];
    const counts = await runIntake({ getToken: async () => "g", githubToken: "t", fetchImpl: replayFetch({ calls }), nowMs: NOW });
    const posts = calls.filter((call) => call.init.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[0].init.body).labels).toEqual(ISSUE_LABELS);
    expect(posts[0].url).toBe("https://api.github.com/repos/diy-accounting-uk/private.diyaccounting.co.uk/issues");
    expect(counts).toEqual({ seen: 3, filed: 2, skippedFiled: 0, skippedNotCustomer: 1 });
  });

  test("a thread already filed is skipped, so a re-run opens nothing twice", async () => {
    const issues = [
      { body: "Gmail-Thread-Id: 18f0a1b2c3d4e5f6\nReceived: 2026-10-27T00:00:00.000Z" },
      { body: "Gmail-Thread-Id: 18f0a1b2c3d4e5f8" },
    ];
    expect([...filedThreadIds(issues)]).toEqual(["18f0a1b2c3d4e5f6", "18f0a1b2c3d4e5f8"]);
    const calls = [];
    const counts = await runIntake({ getToken: async () => "g", githubToken: "t", fetchImpl: replayFetch({ issues, calls }), nowMs: NOW });
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(0);
    expect(counts.skippedFiled).toBe(2);
    expect(counts.filed).toBe(0);
  });

  test("a dry run opens nothing", async () => {
    const calls = [];
    const counts = await runIntake({
      getToken: async () => "g",
      githubToken: "t",
      fetchImpl: replayFetch({ calls }),
      nowMs: NOW,
      dryRun: true,
    });
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(0);
    expect(counts.filed).toBe(2);
  });
});
