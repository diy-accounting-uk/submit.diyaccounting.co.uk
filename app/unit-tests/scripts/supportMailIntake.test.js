// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportMailIntake.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";

import { loadRegistry } from "../../../scripts/support-mail-lanes.mjs";
import {
  GMAIL_READONLY_SCOPE,
  ISSUE_LABELS,
  addressOf,
  afterEpochSecondsFor,
  buildIssueBody,
  buildIssueTitle,
  buildSearchQuery,
  filedThreadIds,
  classifySender,
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
const registry = loadRegistry();
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

  test("the search query selects inbox mail after the cut-off and excludes only our addresses", () => {
    expect(buildSearchQuery({ afterEpochSeconds: 1792000000.9 })).toBe(
      "in:inbox after:1792000000 -from:diyaccounting.co.uk -from:polycode.co.uk",
    );
  });

  test("the sender classifier drops our own and malformed senders and marks automated ones", () => {
    expect(addressOf("Ann Example <Ann@Example.com>")).toBe("ann@example.com");
    expect(classifySender("Ann <ann@example.com>")).toEqual({ address: "ann@example.com", domain: "example.com", automated: false });
    expect(classifySender("antony@polycode.co.uk")).toBeNull();
    expect(classifySender("Support <support@diyaccounting.co.uk>")).toBeNull();
    expect(classifySender("x@mail.diyaccounting.co.uk")).toBeNull();
    expect(classifySender("")).toBeNull();
    for (const automated of ["no-reply@example.com", "noreply+abc@example.com", "MAILER-DAEMON@example.com", "notifications@github.com"]) {
      expect(classifySender(automated).automated).toBe(true);
    }
  });

  test("a thread whose first message is ours is not customer mail", () => {
    expect(readThread(threads["18f0a1b2c3d4e5f7"], registry)).toBeNull();
  });

  test("the issue body carries the ids and fences the message text past any backticks inside it", () => {
    const thread = readThread(threads["18f0a1b2c3d4e5f6"], registry);
    expect(thread).toMatchObject({
      lane: "customer",
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
    expect(readThread(threads["18f0a1b2c3d4e5f8"], registry).text).toBe("Please send an invoice.");
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
    expect(counts).toEqual({
      seen: 3,
      filed: 2,
      skippedFiled: 0,
      skippedNotCustomer: 1,
      lanes: { customer: 2, record: 0, notice: 0, unverified: 0, withheld: 0 },
    });
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

  describe("non-customer lanes", () => {
    const automatedThread = (id, from, subject, authentication) => ({
      id,
      messages: [
        {
          internalDate: String(NOW),
          payload: {
            headers: [
              ...(authentication ? [{ name: "Authentication-Results", value: authentication }] : []),
              { name: "From", value: from },
              { name: "Subject", value: subject },
            ],
            mimeType: "text/plain",
            body: { data: Buffer.from("secret body").toString("base64url") },
          },
        },
      ],
    });
    const passFor = (domain) => `mx.google.com; dkim=pass header.i=@${domain} header.s=s header.b=B; spf=pass`;
    const lanedThreads = {
      a1: automatedThread("a1", "Billing <billing@aws.com>", "Amazon Web Services Invoice Available", passFor("aws.com")),
      a2: automatedThread("a2", "Alerts <alerts@aws.com>", "Action needed", passFor("aws.com")),
      a3: automatedThread("a3", "Alerts <alerts@aws.com>", "Action needed", "mx.google.com; dkim=fail header.i=@aws.com"),
      a4: automatedThread("a4", "OTP <no-reply@npmjs.com>", "[npm] OTP for logging in", passFor("npmjs.com")),
      a5: automatedThread("a5", "Robot <no-reply@unknown.example>", "Hello", undefined),
      a6: threads["18f0a1b2c3d4e5f6"],
    };

    async function laneRun(options = {}) {
      const calls = [];
      const fetchImpl = async (url, init = {}) => {
        calls.push({ url, init });
        const ok = (body) => ({ ok: true, status: 200, json: async () => body });
        if (url.startsWith("https://api.github.com")) return ok(init.method === "POST" ? {} : []);
        if (url.includes("/threads?")) return ok({ threads: Object.keys(lanedThreads).map((id) => ({ id })) });
        return ok(lanedThreads[decodeURIComponent(url.match(/\/threads\/([^?]+)/)[1])]);
      };
      const counts = await runIntake({ getToken: async () => "g", githubToken: "t", fetchImpl, nowMs: NOW, registry, ...options });
      return { counts, calls };
    }

    test("each thread is counted in its lane and only the customer thread opens an issue", async () => {
      const { counts, calls } = await laneRun();
      expect(counts.lanes).toEqual({ customer: 1, record: 1, notice: 2, unverified: 1, withheld: 1 });
      const posts = calls.filter((call) => call.init.method === "POST");
      expect(posts).toHaveLength(1);
      expect(posts[0].init.body).not.toContain("secret body");
    });

    test("a dry run counts the same lanes and changes nothing", async () => {
      const { counts, calls } = await laneRun({ dryRun: true });
      expect(counts.lanes).toEqual({ customer: 1, record: 1, notice: 2, unverified: 1, withheld: 1 });
      expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(0);
    });

    test("a non-customer thread carries no message text", () => {
      expect(readThread(lanedThreads.a4, registry)).toMatchObject({ lane: "withheld", text: "" });
      expect(readThread(lanedThreads.a2, registry)).toMatchObject({ lane: "notice", text: "" });
    });
  });
});
