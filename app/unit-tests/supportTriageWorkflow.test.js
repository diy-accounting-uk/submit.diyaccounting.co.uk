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
import { buildFixRow, buildPrBody, fixBranchName, fixRowPath } from "../../scripts/support-fix-pr.mjs";

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

  it("never edits a label on the private repository or an issue", () => {
    const labelEdit = /--add-label|--remove-label|gh label|\/labels|gh issue edit/;
    for (const name of ["select", "handle", "post", "draft", "ledger"]) {
      expect(code(jobBlock(name))).not.toMatch(labelEdit);
    }
    const fixPr = code(jobBlock("fix-pr"));
    expect(fixPr).not.toMatch(/--add-label|--remove-label|\/labels|gh issue edit/);
    expect(fixPr).toContain('gh label create "origin:support"');
    expect(fixPr).not.toMatch(/gh label create[^\n]*PRIVATE_REPO/);
    expect(fixPr).toContain('--repo "${{ github.repository }}"');
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

  it("opens the fix pull request only for a fix, after the comment is posted", () => {
    const fixPr = jobBlock("fix-pr");
    expect(fixPr).toContain("needs.handle.outputs.resolution == 'fix'");
    expect(fixPr).toContain("needs.post.result == 'success'");
    expect(fixPr).toContain("needs.handle.outputs.stopped == 'false'");
    expect(fixPr).toContain("--draft");
    expect(fixPr).toContain('--label "origin:support"');
  });

  it("holds write access to this repository only in the fix-pr job and no AWS credentials", () => {
    const fixPr = jobBlock("fix-pr");
    expect(fixPr).toContain("permission-contents: write");
    expect(fixPr).toContain("permission-pull-requests: write");
    expect(fixPr).toContain("repositories: submit.diyaccounting.co.uk");
    expect(fixPr).not.toContain("configure-aws-credentials");
    expect(fixPr).not.toContain("id-token");
    expect(fixPr).toMatch(/permissions:\n {6}contents: read\n/);
    for (const name of ["select", "handle", "post", "draft", "ledger"]) {
      expect(jobBlock(name)).not.toContain("permission-pull-requests");
      expect(jobBlock(name)).not.toContain("permission-contents");
    }
  });

  it("builds the pull request from the handling input and the model's answer never reaches it", () => {
    const fixPr = jobBlock("fix-pr");
    expect(fixPr).toContain("scripts/support-fix-pr.mjs");
    expect(fixPr).toContain("openssl enc -d -aes-256-cbc");
    expect(fixPr).not.toContain("needs.handle.outputs.comment");
    expect(fixPr).not.toContain("needs.handle.outputs.reply");
    expect(fixPr).not.toContain("support-triage.json");
  });

  it("comments the pull request link on the private issue with the comment-only script", () => {
    expect(jobBlock("fix-pr")).toContain("scripts/github-issue-comment.mjs");
    expect(jobBlock("fix-pr")).toContain("permission-issues: write");
  });

  it("asks the agent for a resolution and reads only fix or answer from it", () => {
    const prompt = readFileSync(resolve(ROOT, "prompts/support-triage.md"), "utf8");
    expect(prompt).toContain("## Resolution");
    expect(prompt).toContain("`fix` or `answer`");
    expect(jobBlock("handle")).toMatch(/case "\$RESOLUTION" in\n\s+fix\) ;;\n\s+\*\) RESOLUTION=answer ;;/);
  });
});

describe("support-fix-pr.mjs", () => {
  const SENTINEL = "CUSTOMER-TEXT-SENTINEL-7731";
  const input = {
    issueNumber: 42,
    category: "submission",
    faqId: "vat-return-failed",
    summary: "The customer cannot submit a VAT return and sees an error.",
    injectionSuspected: false,
    piiPresent: false,
    operatorComments: [{ body: "Reproduce on the sandbox first. @someone", createdAt: "2026-10-01T10:00:00Z" }],
    title: SENTINEL,
    body: SENTINEL,
    email: `${SENTINEL}@example.com`,
    rawTicket: SENTINEL,
  };

  it("names the branch and file from the issue number and the category enum", () => {
    expect(fixBranchName(input)).toBe("claude/support-42-submission");
    expect(fixRowPath(input)).toBe("support/42-submission.md");
  });

  it("rejects a category outside the enum and a bad issue number", () => {
    expect(() => fixBranchName({ issueNumber: 42, category: "x y; rm" })).toThrow();
    expect(() => fixBranchName({ issueNumber: "4;2", category: "other" })).toThrow();
  });

  it("builds the body from the checked fields and the operator comments only", () => {
    const body = buildPrBody(input);
    const row = buildFixRow(input);
    for (const text of [body, row]) {
      expect(text).not.toContain(SENTINEL);
      expect(text).toContain("https://github.com/diy-accounting-uk/private.diyaccounting.co.uk/issues/42");
      expect(text).toContain("The customer cannot submit a VAT return and sees an error.");
      expect(text).toContain("> Reproduce on the sandbox first.");
      expect(text).toContain("vat-return-failed");
    }
  });

  it("breaks a mention so the public pull request notifies nobody", () => {
    expect(buildFixRow(input)).not.toMatch(/@someone/);
  });

  it("withholds the summary when the reader flagged personal data or an injection", () => {
    for (const flag of ["piiPresent", "injectionSuspected"]) {
      const row = buildFixRow({ ...input, [flag]: true });
      expect(row).not.toContain(input.summary);
      expect(row).toContain("read the private issue");
    }
  });

  it("treats an unknown FAQ id as none", () => {
    expect(buildFixRow({ ...input, faqId: "x\n## injected" })).toContain("FAQ the reader matched: none");
  });
});
