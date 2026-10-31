// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// supportReaderWorkflow.test.js -- support-reader.yml reads untrusted ticket text, so its shape is
// pinned line by line: which job holds which power, and that no step can leave ticket or model
// text in this public repository's logs, summaries or artifacts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AWS_ROLE_STEP = /configure-aws-credentials|\.\/\.github\/actions\/aws-role/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/support-reader.yml"), "utf8");

function jobBlock(name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`no job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("support-reader.yml", () => {
  it("has an empty top-level permissions block", () => {
    expect(text).toMatch(/\npermissions: \{\}\n/);
  });

  it("runs on a schedule and on dispatch only", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect(on).toMatch(/schedule:/);
    expect(on).toMatch(/workflow_dispatch:/);
    expect(on).not.toMatch(/issues:|issue_comment:|pull_request/);
  });

  it("gives the read job no checkout and only id-token write", () => {
    const read = jobBlock("read");
    expect(read).not.toContain("actions/checkout");
    const perms = read.match(/\n {4}permissions:\n((?: {6}.+\n)+)/)[1];
    expect(perms.trim()).toBe("id-token: write");
  });

  it("sends a request with no tools", () => {
    const read = jobBlock("read");
    expect(read).toContain("aws bedrock-runtime invoke-model");
    const code = (block) =>
      block
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
    expect(code(read)).not.toMatch(/\btools\b/);
  });

  it("asks for issue read in select and read, and issue write in post only", () => {
    expect(jobBlock("select")).toContain("permission-issues: read");
    expect(jobBlock("select")).not.toContain("permission-issues: write");
    expect(jobBlock("read")).toContain("permission-issues: read");
    expect(jobBlock("read")).not.toContain("permission-issues: write");
    expect(jobBlock("post")).toContain("permission-issues: write");
    expect(jobBlock("ledger")).not.toContain("permission-issues");
  });

  it("labels the issue injection-suspected from the checked answer, in post only", () => {
    const post = jobBlock("post");
    expect(post).toContain("steps.check.outputs.injection-suspected == 'true'");
    expect(post).toContain('support-label-sweep.mjs label --repo "$PRIVATE_REPO" --issue "$ISSUE_NUMBER" --label injection-suspected');
    expect(jobBlock("read")).not.toContain("support-label-sweep");
  });

  it("gives post no AWS credentials", () => {
    const post = jobBlock("post");
    expect(post).not.toMatch(AWS_ROLE_STEP);
    expect(post).not.toContain("id-token");
  });

  it("builds the role ARN from the account variable", () => {
    expect(text).toContain("arn:aws:iam::${{ vars.SUBMIT_ACCOUNT_ID }}:role/prod-env-quarantine-reader-role");
  });

  it("uploads no artifact", () => {
    expect(text).not.toContain("upload-artifact");
  });

  it("never tees, and never writes to the step summary", () => {
    expect(text).not.toMatch(/\btee\b/);
    expect(text).not.toContain("GITHUB_STEP_SUMMARY");
  });

  it("never prints a ticket or answer file", () => {
    expect(text).not.toMatch(/\bcat \/tmp\/(ticket|answer|response|request|reader-comment)/);
    expect(text).not.toMatch(/\bcat\b.*(ticket|answer)/);
  });

  it("passes the answer between jobs encrypted", () => {
    expect(jobBlock("read")).toContain("openssl enc -aes-256-cbc");
    expect(jobBlock("post")).toContain("openssl enc -d -aes-256-cbc");
  });

  it("reads the kill switch before the model is called", () => {
    const read = jobBlock("read");
    expect(read.indexOf("agents/kill-switch")).toBeGreaterThan(-1);
    expect(read.indexOf("agents/kill-switch")).toBeLessThan(read.indexOf("invoke-model"));
  });
});
