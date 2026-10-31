// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi } from "vitest";
import { addLabel, needsReviewLabelBack, planSweep, sweep } from "../../../scripts/support-label-sweep.mjs";
import { isHandlingCandidate } from "../../../scripts/support-handling-input.mjs";
import { isReaderCandidate } from "../../../scripts/support-reader-select.mjs";

const OPERATOR = "antonycc";
const ev = (event, name, login = OPERATOR) => ({ event, label: { name }, actor: { login } });
const issue = (number, labels, extra = {}) => ({
  number,
  state: "open",
  user: { login: "diyaccounting-ops[bot]" },
  labels: ["support", ...labels].map((name) => ({ name })),
  ...extra,
});
const plan = (issues, events = {}) => planSweep({ issues, eventsFor: async (n) => events[n] ?? [], operatorLogin: OPERATOR });

describe("needsReviewLabelBack", () => {
  it("is true when the operator removed rejected and nothing followed", () => {
    expect(needsReviewLabelBack([ev("labeled", "rejected"), ev("unlabeled", "rejected")], OPERATOR)).toBe(true);
  });

  it("is false once maintainer-review came back", () => {
    const events = [ev("labeled", "rejected"), ev("unlabeled", "rejected"), ev("labeled", "maintainer-review", "bot")];
    expect(needsReviewLabelBack(events, OPERATOR)).toBe(false);
  });

  it("is false when a bot removed rejected", () => {
    expect(needsReviewLabelBack([ev("labeled", "rejected"), ev("unlabeled", "rejected", "bot")], OPERATOR)).toBe(false);
  });

  it("is false for an issue that never carried rejected", () => {
    expect(needsReviewLabelBack([ev("unlabeled", "maintainer-review")], OPERATOR)).toBe(false);
  });
});

describe("planSweep", () => {
  it("closes an open rejected issue", async () => {
    expect(await plan([issue(1, ["rejected"])])).toEqual([{ number: 1, action: "close" }]);
  });

  it("leaves a closed rejected issue alone", async () => {
    expect(await plan([issue(1, ["rejected"], { state: "closed", state_reason: "not_planned" })])).toEqual([]);
  });

  it("restores a closed issue whose rejected label the operator removed", async () => {
    const events = { 2: [ev("labeled", "rejected"), ev("unlabeled", "rejected")] };
    expect(await plan([issue(2, [], { state: "closed", state_reason: "not_planned" })], events)).toEqual([
      { number: 2, action: "restore" },
    ]);
  });

  it("restores an open issue whose rejected label the operator removed", async () => {
    const events = { 3: [ev("labeled", "rejected"), ev("unlabeled", "rejected")] };
    expect(await plan([issue(3, [])], events)).toEqual([{ number: 3, action: "restore" }]);
  });

  it("ignores an issue still waiting on maintainer-review and a closed issue closed for another reason", async () => {
    expect(await plan([issue(4, ["maintainer-review"]), issue(5, [], { state: "closed", state_reason: "completed" })])).toEqual([]);
  });

  it("ignores a pull request and an issue without support", async () => {
    expect(
      await plan([issue(6, ["rejected"], { pull_request: {} }), { number: 7, state: "open", labels: [{ name: "rejected" }] }]),
    ).toEqual([]);
  });
});

describe("candidates", () => {
  it("skips a rejected issue in the triage pick and the reader pick", () => {
    expect(isHandlingCandidate(issue(1, ["rejected"]))).toBe(false);
    expect(isHandlingCandidate(issue(1, []))).toBe(true);
    expect(isReaderCandidate(issue(1, ["maintainer-review", "rejected"]))).toBe(false);
    expect(isReaderCandidate(issue(1, ["maintainer-review"]))).toBe(true);
  });
});

describe("label writes", () => {
  const ok = { ok: true, status: 200, json: async () => [] };

  it("creates the label and adds it to the issue", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok);
    await addLabel({ repo: "o/r", issue: 4, label: "injection-suspected", token: "t", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.github.com/repos/o/r/labels");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).name).toBe("injection-suspected");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.github.com/repos/o/r/issues/4/labels");
  });

  it("accepts a label that already exists", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 422 }).mockResolvedValueOnce(ok);
    await expect(addLabel({ repo: "o/r", issue: 4, label: "rejected", token: "t", fetchImpl })).resolves.toBeUndefined();
  });

  it("refuses a label it does not own", async () => {
    await expect(addLabel({ repo: "o/r", issue: 4, label: "bug", token: "t", fetchImpl: vi.fn() })).rejects.toThrow(
      "not one this script writes",
    );
  });

  it("closes a rejected issue as not planned and posts no comment", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push([init.method ?? "GET", url, init.body]);
      return {
        ok: true,
        status: 200,
        json: async () => (url.includes("state=open") && url.includes("page=1") ? [issue(8, ["rejected"])] : []),
      };
    };
    const result = await sweep({ repo: "o/r", token: "t", fetchImpl });
    expect(result).toEqual([{ number: 8, action: "close" }]);
    const patch = calls.find(([method]) => method === "PATCH");
    expect(patch[1]).toBe("https://api.github.com/repos/o/r/issues/8");
    expect(JSON.parse(patch[2])).toEqual({ state: "closed", state_reason: "not_planned" });
    expect(calls.some(([, url]) => url.endsWith("/comments"))).toBe(false);
  });
});
