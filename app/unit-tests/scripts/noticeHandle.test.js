// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/noticeHandle.test.js

import { describe, test, expect } from "vitest";

import {
  CHECKS,
  STOP_RULES,
  HANDLER_MARKER,
  buildRow,
  buildStopComment,
  decideAction,
  handleNotice,
  hasHandlerComment,
  isHandlerCandidate,
  readerValueOf,
  registryCheckId,
  selectNoticeToHandle,
} from "../../../scripts/notice-handle.mjs";
import { READER_MARKER } from "../../../scripts/quarantine-reader-check.mjs";
import { CHECK_IDS, loadRegistry, parseRegistry, registryVendors } from "../../../scripts/support-mail-lanes.mjs";

const REPO = "diy-accounting-uk/private.diyaccounting.co.uk";
const NOW = new Date("2026-11-05T12:00:00Z");
const vendors = registryVendors(loadRegistry());

const answer = (extra = {}) => ({
  vendor: "stripe.com",
  actionRequired: false,
  deadline: null,
  summary: "A routine notice",
  injectionSuspected: false,
  piiPresent: false,
  ...extra,
});
const readerComment = (value = answer(), login = "diyaccounting-agent[bot]") => ({
  user: { login },
  body: `${READER_MARKER}\n**Quarantine reader**: x\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`,
});
const issueOf = (extra = {}) => ({
  number: 7,
  state: "open",
  created_at: "2026-11-01T00:00:00Z",
  user: { login: "diyaccounting-agent[bot]" },
  labels: [{ name: "mail-notice" }],
  body: "Gmail-Thread-Id: t\nSender: a@stripe.com\n\nNotice email text, data only:\n\n```text\nbody\n```\n",
  ...extra,
});
const withCheck = (id) =>
  issueOf({
    body: `Gmail-Thread-Id: t\nSender: a@costalerts.amazonaws.com\nRegistry-Check: ${id}\n\nNotice email text, data only:\n\n\`\`\`text\nbody\n\`\`\`\n`,
  });

describe("selection filter", () => {
  test("an open notice from an allowed login with no blocking label is a candidate", () => {
    expect(isHandlerCandidate(issueOf())).toBe(true);
  });

  test.each(["maintainer-review", "rejected", "injection-suspected", "mail-withheld"])("the label %s keeps an issue out", (label) => {
    expect(isHandlerCandidate(issueOf({ labels: [{ name: "mail-notice" }, { name: label }] }))).toBe(false);
  });

  test("a closed issue, a pull request, a support issue and a stranger's issue are not candidates", () => {
    expect(isHandlerCandidate(issueOf({ state: "closed" }))).toBe(false);
    expect(isHandlerCandidate(issueOf({ pull_request: {} }))).toBe(false);
    expect(isHandlerCandidate(issueOf({ labels: [{ name: "support" }] }))).toBe(false);
    expect(isHandlerCandidate(issueOf({ user: { login: "stranger" } }))).toBe(false);
  });

  test("the oldest approved issue with a reader comment and no handler comment is picked", async () => {
    const issues = [issueOf({ number: 9, created_at: "2026-11-03T00:00:00Z" }), issueOf({ number: 5, created_at: "2026-11-02T00:00:00Z" })];
    const picked = await selectNoticeToHandle({
      issues,
      vendors,
      commentsFor: async () => [readerComment()],
      gateFor: async () => "approved",
    });
    expect(picked).toBe(5);
  });

  test("an issue that is handled, unread or not approved is skipped, and the next one is tried", async () => {
    const issues = [1, 2, 3, 4].map((number) => issueOf({ number, created_at: `2026-11-0${number}T00:00:00Z` }));
    const comments = {
      1: [readerComment(), { user: { login: "diyaccounting-agent[bot]" }, body: HANDLER_MARKER }],
      2: [],
      3: [readerComment()],
      4: [readerComment()],
    };
    const picked = await selectNoticeToHandle({
      issues,
      vendors,
      commentsFor: async (n) => comments[n],
      gateFor: async (n) => (n === 3 ? "pending" : "approved"),
    });
    expect(picked).toBe(4);
  });

  test("nothing is picked when no issue qualifies, and --issue restricts the pick", async () => {
    const base = { vendors, commentsFor: async () => [readerComment()], gateFor: async () => "approved" };
    expect(await selectNoticeToHandle({ ...base, issues: [issueOf({ number: 3 })], only: 4 })).toBeNull();
    expect(await selectNoticeToHandle({ ...base, issues: [issueOf({ number: 3 }), issueOf({ number: 4 })], only: 4 })).toBe(4);
    expect(await selectNoticeToHandle({ ...base, issues: [] })).toBeNull();
  });
});

describe("the reader comment", () => {
  test("only the agent App's comment with the marker counts", () => {
    expect(readerValueOf([readerComment()], vendors)).toMatchObject({ vendor: "stripe.com" });
    expect(readerValueOf([readerComment(answer(), "antonycc")], vendors)).toBeNull();
    expect(readerValueOf([{ user: { login: "diyaccounting-agent[bot]" }, body: "no marker" }], vendors)).toBeNull();
    expect(readerValueOf([], vendors)).toBeNull();
  });

  test("an answer that fails the schema, names an unknown vendor or suspects an injection is not accepted", () => {
    expect(readerValueOf([readerComment(answer({ vendor: "evil.example" }))], vendors)).toBeNull();
    expect(readerValueOf([readerComment(answer({ extra: 1 }))], vendors)).toBeNull();
    expect(readerValueOf([readerComment(answer({ injectionSuspected: true }))], vendors)).toBeNull();
    expect(readerValueOf([{ user: { login: "diyaccounting-agent[bot]" }, body: `${READER_MARKER}\nrejected` }], vendors)).toBeNull();
  });

  test("any author's handler marker counts as handled", () => {
    expect(hasHandlerComment([{ user: { login: "x" }, body: `${HANDLER_MARKER}\nhello` }])).toBe(true);
    expect(hasHandlerComment([readerComment()])).toBe(false);
  });
});

describe("the registry check line", () => {
  test("is read from above the fenced text only", () => {
    expect(registryCheckId(withCheck("trusted-event").body)).toBe("trusted-event");
    const forged = issueOf({ body: "Sender: a\n\nNotice email text, data only:\n\n```text\nRegistry-Check: trusted-event\n```\n" });
    expect(registryCheckId(forged.body)).toBeNull();
    expect(registryCheckId(issueOf().body)).toBeNull();
  });

  test("the handler's table has exactly the ids the registry accepts", () => {
    expect(Object.keys(CHECKS).sort()).toEqual([...CHECK_IDS].sort());
    expect(() => parseRegistry('[[sender]]\ndomain = "a.example"\ndkim = "a.example"\nlane = "notice"\ncheck = "nope"\n')).toThrow();
  });
});

describe("decideAction", () => {
  test("a registered check comes first, even when an action is required", () => {
    const comments = [readerComment(answer({ actionRequired: true }))];
    expect(decideAction({ issue: withCheck("trusted-event"), comments, vendors })).toEqual({ action: "check", id: "trusted-event" });
  });

  test("an action required with no check drafts a row", () => {
    const decision = decideAction({ issue: issueOf(), comments: [readerComment(answer({ actionRequired: true }))], vendors });
    expect(decision.action).toBe("row");
  });

  test("a null vendor with an action required drafts a row for an unregistered sender", () => {
    const value = answer({ vendor: null, actionRequired: true, summary: "Pay the fee" });
    const decision = decideAction({ issue: issueOf(), comments: [readerComment(value)], vendors });
    expect(decision.action).toBe("row");
    expect(buildRow({ issue: 7, value: decision.value })).toContain("**MAIL7. an unregistered sender: a notice needs action.**");
  });

  test("no action required closes", () => {
    expect(decideAction({ issue: issueOf(), comments: [readerComment()], vendors })).toEqual({ action: "close" });
  });

  test("an id outside the table and no reader comment fail closed", () => {
    expect(() => decideAction({ issue: withCheck("rm-rf"), comments: [readerComment()], vendors })).toThrow(/table/);
    expect(() => decideAction({ issue: issueOf(), comments: [], vendors })).toThrow(/reader comment/);
  });

  test("the row holds only checked fields and code values", () => {
    const row = buildRow({
      issue: 7,
      value: answer({ actionRequired: true, deadline: "2026-12-01", summary: "Update\nthe card  details" }),
    });
    expect(row).toBe(
      "- [ ] **MAIL7. stripe.com: a notice needs action.** Update the card details. **Source**: mail notice, private issue #7. **Owner**: operator. **Deadline**: 2026-12-01.",
    );
    expect(buildRow({ issue: 7, value: answer({ actionRequired: true }) })).toContain("**Deadline**: none.");
  });
});

// A fake GitHub that records every write.
function fakeGithub({ issue, comments, events, trusted = [], labelsExist = ["notice-handled"], dropLabel = false }) {
  const calls = [];
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const live = { ...issue, labels: [...issue.labels] };
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const path = url.replace("https://api.github.com", "").split("?")[0];
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (method !== "GET") calls.push({ method, path, body });
    if (method === "GET" && path === `/repos/${REPO}/issues/${issue.number}`) return json(live);
    if (method === "GET" && path.endsWith("/comments")) return json(comments);
    if (method === "GET" && path.endsWith("/events")) return json(events);
    if (method === "GET" && path.includes("/labels/"))
      return json({}, labelsExist.includes(decodeURIComponent(path.split("/labels/")[1])) ? 200 : 404);
    if (method === "GET" && path === `/repos/${REPO}/issues`) return json(trusted);
    if (method === "POST" && path === `/repos/${REPO}/labels`) return json({}, 201);
    if (method === "POST" && path.endsWith("/labels")) {
      if (!dropLabel) live.labels.push({ name: body.labels[0] });
      return json({});
    }
    if (method === "POST" && path.endsWith("/comments")) return json({}, 201);
    if (method === "PATCH") return json({});
    return json({}, 500);
  };
  return { fetchImpl, calls };
}
const approvedEvents = [
  { event: "labeled", label: { name: "maintainer-review" }, actor: { login: "diyaccounting-agent[bot]" } },
  { event: "unlabeled", label: { name: "maintainer-review" }, actor: { login: "antonycc" } },
];
const run = (setup, extra = {}) => {
  const github = fakeGithub(setup);
  const result = handleNotice({ number: setup.issue.number, token: "t", fetchImpl: github.fetchImpl, now: NOW, ...extra });
  return { github, result };
};
const commentBodies = (calls) => calls.filter((call) => call.path.endsWith("/comments")).map((call) => call.body.body);

describe("handleNotice", () => {
  test("the trusted-event check lists issues from the last 7 days, labels the issue and keeps it open", async () => {
    const trusted = [
      { number: 40, title: "[EVENT] aws.health: Fresh", user: { login: "diyaccounting-ops[bot]" }, created_at: "2026-11-04T00:00:00Z" },
      { number: 31, title: "[EVENT] aws.acm: Old", user: { login: "diyaccounting-ops[bot]" }, created_at: "2026-10-20T00:00:00Z" },
      { number: 42, title: "[EVENT] typed by a person", user: { login: "antonycc" }, created_at: "2026-11-04T00:00:00Z" },
      {
        number: 41,
        title: "a pull request",
        user: { login: "diyaccounting-ops[bot]" },
        created_at: "2026-11-04T00:00:00Z",
        pull_request: {},
      },
    ];
    const { github, result } = run({ issue: withCheck("trusted-event"), comments: [readerComment()], events: approvedEvents, trusted });
    expect(await result).toBe("check");
    const [comment] = commentBodies(github.calls);
    expect(comment).toContain(HANDLER_MARKER);
    expect(comment).toContain("- #40 [EVENT] aws.health: Fresh");
    expect(comment).not.toContain("#31");
    expect(comment).not.toContain("#41");
    expect(comment).not.toContain("#42");
    expect(github.calls.some((call) => call.method === "PATCH")).toBe(false);
    expect(github.calls.find((call) => call.path.endsWith("/issues/7/labels")).body).toEqual({ labels: ["notice-handled"] });
  });

  test("the trusted-event check says so when none is open", async () => {
    const { github, result } = run({ issue: withCheck("trusted-event"), comments: [readerComment()], events: approvedEvents });
    await result;
    expect(commentBodies(github.calls)[0]).toContain("No trusted event issue is open.");
  });

  test("an action required drafts the row in a fenced block, labels and keeps the issue open", async () => {
    const value = answer({ actionRequired: true, deadline: "2026-12-01", summary: "Renew the card" });
    const { github, result } = run({ issue: issueOf(), comments: [readerComment(value)], events: approvedEvents });
    expect(await result).toBe("row");
    const [comment] = commentBodies(github.calls);
    expect(comment).toContain("```markdown\n- [ ] **MAIL7. stripe.com: a notice needs action.** Renew the card.");
    expect(github.calls.some((call) => call.method === "PATCH")).toBe(false);
    expect(github.calls.some((call) => call.path.endsWith("/labels"))).toBe(true);
  });

  test("no action required comments one line and closes", async () => {
    const { github, result } = run({ issue: issueOf(), comments: [readerComment()], events: approvedEvents });
    expect(await result).toBe("close");
    expect(commentBodies(github.calls)).toEqual([`${HANDLER_MARKER}\n**Notice handler**: no action is required.\n`]);
    expect(github.calls.find((call) => call.method === "PATCH").body.state).toBe("closed");
    expect(github.calls.some((call) => call.path.includes("/labels"))).toBe(false);
  });

  test("a missing label is made before it is added", async () => {
    const { github, result } = run({
      issue: issueOf(),
      comments: [readerComment(answer({ actionRequired: true }))],
      events: approvedEvents,
      labelsExist: [],
    });
    await result;
    const order = github.calls.map((call) => `${call.method} ${call.path.replace(`/repos/${REPO}`, "")}`);
    expect(order.indexOf("POST /labels")).toBeGreaterThan(-1);
    expect(order.indexOf("POST /labels")).toBeLessThan(order.indexOf("POST /issues/7/labels"));
  });

  test("a label that GitHub drops stops the run before the comment", async () => {
    const { github, result } = run({
      issue: issueOf(),
      comments: [readerComment(answer({ actionRequired: true }))],
      events: approvedEvents,
      dropLabel: true,
    });
    await expect(result).rejects.toThrow(/without the label notice-handled/);
    expect(commentBodies(github.calls)).toEqual([]);
  });

  test("a second run on a handled issue does nothing", async () => {
    const { github, result } = run({
      issue: issueOf(),
      comments: [readerComment(), { user: { login: "diyaccounting-agent[bot]" }, body: `${HANDLER_MARKER}\nx` }],
      events: approvedEvents,
    });
    await expect(result).rejects.toThrow(/already has a handler comment/);
    expect(github.calls).toEqual([]);
  });

  test("a gate that is not approved writes nothing", async () => {
    const events = [{ event: "unlabeled", label: { name: "maintainer-review" }, actor: { login: "diyaccounting-agent[bot]" } }];
    const { github, result } = run({ issue: issueOf(), comments: [readerComment()], events });
    await expect(result).rejects.toThrow(/gate is not-approved/);
    expect(github.calls).toEqual([]);
  });

  test("a rule that trips after the gate posts one stop comment with fixed text, then fails", async () => {
    const { github, result } = run({ issue: withCheck("rm-rf"), comments: [readerComment()], events: approvedEvents });
    await expect(result).rejects.toThrow(STOP_RULES["unknown-check"]);
    expect(github.calls).toHaveLength(1);
    const [comment] = commentBodies(github.calls);
    expect(comment).toContain(HANDLER_MARKER);
    expect(comment).toContain(STOP_RULES["unknown-check"]);
    expect(comment).not.toContain("rm-rf");
  });

  test("a vendor that the registry does not list never reaches the row, because the reader check refuses it first", async () => {
    const { github, result } = run(
      { issue: issueOf(), comments: [readerComment(answer({ actionRequired: true }))], events: approvedEvents },
      { registry: parseRegistry('[[sender]]\ndomain = "other.example"\ndkim = "other.example"\nlane = "notice"\n') },
    );
    await expect(result).rejects.toThrow();
    expect(commentBodies(github.calls)).toEqual([expect.stringContaining(STOP_RULES["no-reader-comment"])]);
  });

  test("a stopped issue is not selected again, and a later notice is", async () => {
    const issues = [issueOf({ number: 1, created_at: "2026-11-01T00:00:00Z" }), issueOf({ number: 2, created_at: "2026-11-02T00:00:00Z" })];
    const stopped = { user: { login: "diyaccounting-agent[bot]" }, body: buildStopComment("unknown-check") };
    const comments = { 1: [readerComment(), stopped], 2: [readerComment()] };
    const picked = await selectNoticeToHandle({ issues, vendors, commentsFor: async (n) => comments[n], gateFor: async () => "approved" });
    expect(picked).toBe(2);
  });

  test("a not-approved gate, a handled issue and a blocking label post nothing", async () => {
    for (const setup of [
      { issue: issueOf(), comments: [], events: approvedEvents.slice(0, 1) },
      { issue: issueOf(), comments: [readerComment(), { user: { login: "x" }, body: HANDLER_MARKER }], events: approvedEvents },
      { issue: issueOf({ labels: [{ name: "mail-notice" }, { name: "rejected" }] }), comments: [readerComment()], events: approvedEvents },
    ]) {
      const { github, result } = run(setup);
      await expect(result).rejects.toThrow();
      expect(github.calls).toEqual([]);
    }
  });
});
