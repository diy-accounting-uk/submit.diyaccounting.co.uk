// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// supportTriageWorkflow.test.js -- support-triage.yml runs an agent on a support ticket only after
// the operator approves it by removing the maintainer-review label. This test pins the shape that
// keeps it so: the triggers, the gate in the jobs that read or write the private issue, the
// absence of any label edit, and the absence of any way for ticket or reply text to reach this
// public repository's logs.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/support-triage.yml"), "utf8");

function jobBlock(name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`no job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

const code = (block) =>
  block
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

describe("support-triage.yml", () => {
  it("parses as a workflow with a jobs: block", () => {
    expect(text).toMatch(/\njobs:\n/);
  });

  it("triggers on schedule and workflow_dispatch only", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]);
    expect(triggers).toEqual(["schedule", "workflow_dispatch"]);
  });

  it("has an empty top-level permissions block", () => {
    expect(text).toMatch(/\npermissions: \{\}\n/);
  });

  it("reads nothing from the issue event", () => {
    expect(code(text)).not.toContain("github.event.issue");
    expect(code(text)).not.toContain("github.event.sender");
    expect(code(text)).not.toMatch(/gh issue view/);
  });

  it("never edits a label", () => {
    expect(code(text)).not.toMatch(/--add-label|--remove-label|gh label|\/labels|gh issue edit/);
  });

  it("runs the maintainer-review gate in select and again in post", () => {
    expect(jobBlock("select")).toContain("support-handling-input.mjs");
    expect(jobBlock("post")).toContain("maintainer-review-gate.mjs");
    expect(jobBlock("post").indexOf("maintainer-review-gate.mjs")).toBeLessThan(jobBlock("post").indexOf("github-issue-comment.mjs"));
  });

  it("holds no GitHub App token in the handling job", () => {
    const handle = jobBlock("handle");
    expect(handle).not.toContain("create-github-app-token");
    expect(handle).not.toContain("GH_TOKEN");
  });

  it("gives the handling job AWS access and the post job none", () => {
    expect(jobBlock("handle")).toContain("configure-aws-credentials");
    expect(jobBlock("post")).not.toContain("configure-aws-credentials");
    expect(jobBlock("post")).not.toContain("id-token");
  });

  it("keeps the run result out of the log", () => {
    expect(jobBlock("handle")).toMatch(/uses: \.\/\.github\/actions\/run-triage-agent[\s\S]*echo-output: 'false'/);
    expect(jobBlock("handle")).toMatch(/uses: \.\/\.github\/actions\/publish-filter[\s\S]*echo-output: 'false'/);
  });

  it("prints no ticket or reply text and uploads no artifact", () => {
    expect(text).not.toContain("upload-artifact");
    expect(text).not.toContain("GITHUB_STEP_SUMMARY");
    expect(code(text)).not.toMatch(/\btee\b/);
    expect(code(text)).not.toMatch(/head -c .*support-triage/);
  });

  it("passes ticket-derived text between jobs encrypted", () => {
    expect(jobBlock("select")).toContain("openssl enc -aes-256-cbc");
    expect(jobBlock("handle")).toContain("openssl enc -d -aes-256-cbc");
    expect(jobBlock("handle")).toContain("openssl enc -aes-256-cbc");
    expect(jobBlock("post")).toContain("openssl enc -d -aes-256-cbc");
    expect(jobBlock("draft")).toContain("openssl enc -d -aes-256-cbc");
  });

  it("posts the comment with the script that can only comment", () => {
    expect(jobBlock("post")).toContain("scripts/github-issue-comment.mjs");
    expect(jobBlock("post")).toContain("permission-issues: write");
    expect(jobBlock("select")).toContain("permission-issues: read");
  });
});
