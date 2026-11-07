// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { selectIssueToRead, selectIssueToReread, parseReaderArgs } from "../../../scripts/support-reader-select.mjs";
import { READER_MARKER } from "../../../scripts/quarantine-reader-check.mjs";

function issue(number, overrides = {}) {
  return {
    number,
    state: "open",
    created_at: `2026-10-${String(number).padStart(2, "0")}T10:00:00Z`,
    user: { login: "diyaccounting-ops[bot]" },
    labels: [{ name: "support" }, { name: "maintainer-review" }],
    ...overrides,
  };
}

const readerComment = (login = "diyaccounting-agent[bot]") => ({ user: { login }, body: `${READER_MARKER}\nsummary` });

function select(issues, comments = {}, only) {
  return selectIssueToRead({ issues, only, commentsFor: async (n) => comments[n] ?? [] });
}

describe("support reader select", () => {
  it("picks the oldest candidate", async () => {
    expect(await select([issue(5), issue(3), issue(4)])).toBe(3);
  });

  it("skips an author that is not on the allow list", async () => {
    expect(await select([issue(1, { user: { login: "stranger" } }), issue(2)])).toBe(2);
  });

  it("skips an issue that already has a reader comment from the agent App", async () => {
    expect(await select([issue(1), issue(2)], { 1: [readerComment()] })).toBe(2);
  });

  it("does not count a look-alike comment from another login", async () => {
    expect(await select([issue(1)], { 1: [readerComment("stranger")] })).toBe(1);
  });

  it("does not count a comment from the agent App without the marker", async () => {
    expect(await select([issue(1)], { 1: [{ user: { login: "diyaccounting-agent[bot]" }, body: "hello" }] })).toBe(1);
  });

  it("skips closed issues, pull requests and issues missing a label", async () => {
    const issues = [
      issue(1, { state: "closed" }),
      issue(2, { pull_request: {} }),
      issue(3, { labels: [{ name: "support" }] }),
      issue(4, { labels: [{ name: "maintainer-review" }] }),
    ];
    expect(await select(issues)).toBeNull();
  });

  it("skips a trusted-event issue that carries maintainer-review", async () => {
    const trusted = issue(1, { labels: [{ name: "trusted-event" }, { name: "maintainer-review" }, { name: "origin:machine" }] });
    expect(await select([trusted])).toBeNull();
    expect(await select([trusted, issue(2)])).toBe(2);
    expect(await select([trusted], {}, 1)).toBeNull();
  });

  it("applies the same checks to a dispatched issue number", async () => {
    expect(await select([issue(1), issue(2)], {}, 2)).toBe(2);
    expect(await select([issue(1), issue(2, { user: { login: "stranger" } })], {}, 2)).toBeNull();
    expect(await select([issue(1)], { 1: [readerComment()] }, 1)).toBeNull();
  });

  it("returns null when nothing is left", async () => {
    expect(await select([])).toBeNull();
  });

  describe("reread", () => {
    const unreviewed = (n, overrides = {}) => issue(n, { labels: [{ name: "support" }], ...overrides });

    it("selects the named issue without maintainer-review", () => {
      expect(selectIssueToReread({ issue: unreviewed(7), only: 7 })).toBe(7);
    });

    it("selects the named issue that carries maintainer-review", () => {
      expect(selectIssueToReread({ issue: issue(7), only: 7 })).toBe(7);
    });

    it("refuses a rejected issue", () => {
      const rejected = unreviewed(7, { labels: [{ name: "support" }, { name: "rejected" }] });
      expect(selectIssueToReread({ issue: rejected, only: 7 })).toBeNull();
    });

    it("refuses a closed issue, a pull request and an issue without the support label", () => {
      expect(selectIssueToReread({ issue: unreviewed(7, { state: "closed" }), only: 7 })).toBeNull();
      expect(selectIssueToReread({ issue: unreviewed(7, { pull_request: {} }), only: 7 })).toBeNull();
      expect(selectIssueToReread({ issue: unreviewed(7, { labels: [] }), only: 7 })).toBeNull();
    });

    it("refuses a login that is not on the allow list", () => {
      expect(selectIssueToReread({ issue: unreviewed(7, { user: { login: "stranger" } }), only: 7 })).toBeNull();
    });

    it("refuses a trusted-event issue", () => {
      const trusted = issue(7, { labels: [{ name: "trusted-event" }, { name: "maintainer-review" }] });
      expect(selectIssueToReread({ issue: trusted, only: 7 })).toBeNull();
    });

    it("refuses an issue whose number differs from the input", () => {
      expect(selectIssueToReread({ issue: unreviewed(8), only: 7 })).toBeNull();
    });

    it("parses --reread with --issue", () => {
      expect(parseReaderArgs(["--issue", "15", "--reread"])).toEqual({ kind: "support", only: 15, reread: true });
      expect(parseReaderArgs(["--issue", "15"])).toEqual({ kind: "support", only: 15, reread: false });
      expect(parseReaderArgs([])).toEqual({ kind: "support", only: undefined, reread: false });
    });

    it("fails on --reread without --issue", () => {
      expect(() => parseReaderArgs(["--reread"])).toThrow(/--reread needs --issue/);
    });
  });
});

describe("notice reader select", () => {
  const notice = (number, overrides = {}) =>
    issue(number, { labels: [{ name: "mail-notice" }, { name: "maintainer-review" }], ...overrides });
  const pick = (issues, comments = {}, only) =>
    selectIssueToRead({ issues, only, kind: "notice", commentsFor: async (n) => comments[n] ?? [] });

  it("picks the oldest notice", async () => {
    expect(await pick([notice(5), notice(3), notice(4)])).toBe(3);
  });

  it("leaves a support ticket to the support selection and a notice to the notice selection", async () => {
    expect(await pick([issue(1)])).toBeNull();
    expect(await select([notice(1)])).toBeNull();
  });

  it("skips a notice a person has already released, one with no label and one that is rejected", async () => {
    const issues = [
      notice(1, { labels: [{ name: "mail-notice" }] }),
      notice(2, { labels: [{ name: "maintainer-review" }] }),
      notice(3, { labels: [{ name: "mail-notice" }, { name: "maintainer-review" }, { name: "rejected" }] }),
    ];
    expect(await pick(issues)).toBeNull();
  });

  it("skips a withheld notice, which holds no message text", async () => {
    const withheld = notice(1, { labels: [{ name: "mail-notice" }, { name: "maintainer-review" }, { name: "mail-withheld" }] });
    expect(await pick([withheld, notice(2)])).toBe(2);
  });

  it("reads an unverified notice, so the operator gets a summary beside the warning label", async () => {
    const unverified = notice(1, {
      labels: [{ name: "mail-notice" }, { name: "maintainer-review" }, { name: "injection-suspected" }],
    });
    expect(await pick([unverified])).toBe(1);
  });

  it("skips a trusted-event issue that carries maintainer-review, even with the notice label", async () => {
    const trusted = issue(1, { labels: [{ name: "trusted-event" }, { name: "maintainer-review" }, { name: "origin:machine" }] });
    const mixed = notice(2, { labels: [{ name: "mail-notice" }, { name: "maintainer-review" }, { name: "trusted-event" }] });
    expect(await pick([trusted])).toBeNull();
    expect(await pick([mixed])).toBeNull();
    expect(await pick([trusted, mixed, notice(3)])).toBe(3);
    expect(await pick([trusted, mixed], {}, 1)).toBeNull();
    expect(await pick([trusted, mixed], {}, 2)).toBeNull();
  });

  it("skips an author that is not on the allow list, closed issues and pull requests", async () => {
    const issues = [notice(1, { user: { login: "stranger" } }), notice(2, { state: "closed" }), notice(3, { pull_request: {} })];
    expect(await pick(issues)).toBeNull();
  });

  it("skips a notice that already has a reader comment from the agent App", async () => {
    expect(await pick([notice(1), notice(2)], { 1: [readerComment()] })).toBe(2);
  });

  it("rereads the named notice but not a withheld, rejected or trusted-event one", () => {
    expect(selectIssueToReread({ issue: notice(7, { labels: [{ name: "mail-notice" }] }), only: 7, kind: "notice" })).toBe(7);
    for (const extra of ["mail-withheld", "rejected", "trusted-event"]) {
      const labels = [{ name: "mail-notice" }, { name: extra }];
      expect(selectIssueToReread({ issue: notice(7, { labels }), only: 7, kind: "notice" })).toBeNull();
    }
    expect(selectIssueToReread({ issue: issue(7), only: 7, kind: "notice" })).toBeNull();
  });

  it("parses --kind and defaults to support", () => {
    expect(parseReaderArgs(["--kind", "notice", "--issue", "3"])).toEqual({ kind: "notice", only: 3, reread: false });
    expect(parseReaderArgs([]).kind).toBe("support");
    expect(() => parseReaderArgs(["--kind", "alarm"])).toThrow(/--kind must be/);
  });
});
