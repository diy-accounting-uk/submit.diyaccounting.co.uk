// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { selectIssueToRead } from "../../../scripts/support-reader-select.mjs";
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

  it("applies the same checks to a dispatched issue number", async () => {
    expect(await select([issue(1), issue(2)], {}, 2)).toBe(2);
    expect(await select([issue(1), issue(2, { user: { login: "stranger" } })], {}, 2)).toBeNull();
    expect(await select([issue(1)], { 1: [readerComment()] }, 1)).toBeNull();
  });

  it("returns null when nothing is left", async () => {
    expect(await select([])).toBeNull();
  });
});
