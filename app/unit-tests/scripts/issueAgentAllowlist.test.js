// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { isAllowed, ALLOWED_LOGINS } from "../../../scripts/issue-agent-allowlist.mjs";

describe("issue agent allow list", () => {
  it("lists the operator and the two app bots", () => {
    expect(ALLOWED_LOGINS).toEqual(["antonycc", "diyaccounting-ops[bot]", "diyaccounting-agent[bot]"]);
  });

  it("runs when the author and the sender are both on the list", () => {
    expect(isAllowed({ eventName: "issues", author: "diyaccounting-ops[bot]", sender: "diyaccounting-ops[bot]" })).toBe(true);
    expect(isAllowed({ eventName: "issue_comment", author: "antonycc", sender: "diyaccounting-agent[bot]" })).toBe(true);
  });

  it("matches logins without regard to case", () => {
    expect(isAllowed({ eventName: "issues", author: "AntonyCC", sender: "antonycc" })).toBe(true);
  });

  it("does not run when the author is not on the list", () => {
    expect(isAllowed({ eventName: "issues", author: "stranger", sender: "antonycc" })).toBe(false);
  });

  it("does not run when the sender is not on the list", () => {
    expect(isAllowed({ eventName: "issue_comment", author: "antonycc", sender: "stranger" })).toBe(false);
  });

  it("does not run for a bot login that is not on the list", () => {
    expect(isAllowed({ eventName: "issues", author: "dependabot[bot]", sender: "antonycc" })).toBe(false);
    expect(isAllowed({ eventName: "issues", author: "antonycc", sender: "github-actions[bot]" })).toBe(false);
  });

  it("does not run when the sender or the author is missing", () => {
    expect(isAllowed({ eventName: "issues", author: "antonycc", sender: undefined })).toBe(false);
    expect(isAllowed({ eventName: "issues", author: "antonycc", sender: "" })).toBe(false);
    expect(isAllowed({ eventName: "issues", author: undefined, sender: "antonycc" })).toBe(false);
  });

  it("runs a workflow_dispatch without an author or a sender", () => {
    expect(isAllowed({ eventName: "workflow_dispatch" })).toBe(true);
  });

  it("prints allowed=false from the command line for a stranger", () => {
    const out = execFileSync("node", ["scripts/issue-agent-allowlist.mjs"], {
      env: { PATH: process.env.PATH, EVENT_NAME: "issues", ISSUE_AUTHOR: "stranger", EVENT_SENDER: "antonycc" },
      encoding: "utf8",
    });
    expect(out.trim()).toBe("allowed=false");
  });

  it("prints allowed=true from the command line for the operator", () => {
    const out = execFileSync("node", ["scripts/issue-agent-allowlist.mjs"], {
      env: { PATH: process.env.PATH, EVENT_NAME: "issues", ISSUE_AUTHOR: "antonycc", EVENT_SENDER: "antonycc" },
      encoding: "utf8",
    });
    expect(out.trim()).toBe("allowed=true");
  });
});
