// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { digestNotices, readerDeadline } from "../../../scripts/notice-digest.mjs";
import { READER_MARKER } from "../../../scripts/quarantine-reader-check.mjs";

const TODAY = "2026-11-05";
const AGENT = "diyaccounting-agent[bot]";

const issue = (number, overrides = {}) => ({ number, state: "open", title: "SECRET TITLE", body: "SECRET BODY", ...overrides });
const reader = (deadline, login = AGENT) => ({
  user: { login },
  body: `${READER_MARKER}\nsummary\n\`\`\`json\n${JSON.stringify({ deadline, summary: "SECRET SUMMARY" })}\n\`\`\``,
});

function digest(issues, comments = {}) {
  return digestNotices({ issues, today: TODAY, commentsFor: async (n) => comments[n] ?? [] });
}

describe("notice digest", () => {
  it("counts zero notices and has no deadline", async () => {
    expect(await digest([])).toEqual({ count: 0, nearestDeadline: null });
  });

  it("counts notices that have no reader comment and has no deadline", async () => {
    expect(await digest([issue(1), issue(2)])).toEqual({ count: 2, nearestDeadline: null });
  });

  it("ignores a past deadline but still counts the notice", async () => {
    expect(await digest([issue(1)], { 1: [reader("2026-11-04")] })).toEqual({ count: 1, nearestDeadline: null });
  });

  it("counts a deadline of today", async () => {
    expect(await digest([issue(1)], { 1: [reader(TODAY)] })).toEqual({ count: 1, nearestDeadline: TODAY });
  });

  it("returns the nearest of several deadlines that are today or later", async () => {
    const result = await digest([issue(1), issue(2), issue(3), issue(4)], {
      1: [reader("2026-12-01")],
      2: [reader("2026-11-12")],
      3: [reader("2026-10-01")],
      4: [reader(null)],
    });
    expect(result).toEqual({ count: 4, nearestDeadline: "2026-11-12" });
  });

  it("does not count a pull request or a closed issue", async () => {
    expect(await digest([issue(1, { pull_request: {} }), issue(2, { state: "closed" }), issue(3)])).toEqual({
      count: 1,
      nearestDeadline: null,
    });
  });

  it("returns only a count and a date, never issue text", async () => {
    const result = await digest([issue(1)], { 1: [reader("2026-11-12")] });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});

describe("readerDeadline", () => {
  it("ignores a look-alike comment from another login", () => {
    expect(readerDeadline([reader("2026-11-12", "stranger")])).toBeNull();
  });

  it("ignores a comment without the marker", () => {
    expect(readerDeadline([{ user: { login: AGENT }, body: '```json\n{"deadline":"2026-11-12"}\n```' }])).toBeNull();
  });

  it("reads the latest accepted comment", () => {
    expect(readerDeadline([reader("2026-11-12"), reader("2026-11-20")])).toBe("2026-11-20");
  });

  it("ignores a deadline that is not a calendar date", () => {
    expect(readerDeadline([reader("2026-02-31")])).toBeNull();
    expect(readerDeadline([reader("tomorrow")])).toBeNull();
  });
});
