// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// noticeHandlerWorkflow.test.js -- support-notice-handler.yml writes to the private repository's
// issues, so its shape is pinned: which job holds which power, and that it holds no AWS role.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/support-notice-handler.yml"), "utf8");

function jobBlock(name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`no job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("support-notice-handler.yml", () => {
  it("has an empty top-level permissions block", () => {
    expect(text).toMatch(/\npermissions: \{\}\n/);
  });

  it("runs hourly at an odd minute and on dispatch, nothing else", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1])).toEqual(["schedule", "workflow_dispatch"]);
    expect(on).toMatch(/cron: '29 \* \* \* \*'/);
  });

  it("uses its own concurrency group", () => {
    expect(text).toMatch(/concurrency:\n {2}group: support-notice-handler\n/);
  });

  it("asks for issue read in select and issue write in act only", () => {
    expect(jobBlock("select")).toContain("permission-issues: read");
    expect(jobBlock("select")).not.toContain("permission-issues: write");
    expect(jobBlock("act")).toContain("permission-issues: write");
  });

  it("holds no AWS role and no id-token permission", () => {
    expect(text).not.toMatch(/configure-aws-credentials|aws-role|id-token|vars\.SUBMIT_ACTIONS_ROLE_ARN/);
  });

  it("checks the maintainer-review gate again in the job that writes", () => {
    const act = jobBlock("act");
    expect(act.indexOf("maintainer-review-gate.mjs")).toBeGreaterThan(-1);
    expect(act.indexOf("maintainer-review-gate.mjs")).toBeLessThan(act.indexOf("notice-handle.mjs act"));
  });

  it("never pipes into tee and uploads no artifact", () => {
    expect(text).not.toMatch(/\btee\b/);
    expect(text).not.toContain("upload-artifact");
    expect(text).not.toContain("GITHUB_STEP_SUMMARY");
  });
});
