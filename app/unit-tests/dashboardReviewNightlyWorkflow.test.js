// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// dashboardReviewNightlyWorkflow.test.js -- dashboard-review-nightly.yml handles the prod snapshot and
// the held passes, so its shape is pinned line by line: which job holds which power, and that no step
// can leave a figure, a screenshot or a model answer in this public repository's logs, summaries or artifacts.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AWS_ROLE_STEP = /configure-aws-credentials|\.\/\.github\/actions\/aws-role/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const WORKFLOW_DIR = resolve(ROOT, ".github/workflows");
const FILE = "dashboard-review-nightly.yml";
const text = readFileSync(resolve(WORKFLOW_DIR, FILE), "utf8");

function jobBlock(name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`no job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function permissionsOf(block) {
  const lines = block.match(/\n {4}permissions:\n((?: {6}.+\n)+)/)[1];
  return lines
    .trim()
    .split("\n")
    .map((line) => line.trim());
}

describe("dashboard-review-nightly.yml", () => {
  it("has an empty top-level permissions block", () => {
    expect(text).toMatch(/\npermissions: \{\}\n/);
  });

  it("runs on one schedule and on dispatch with a proof input", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect(on).toMatch(/cron: '43 3 \* \* \*'/);
    expect(on.match(/cron:/g)).toHaveLength(1);
    expect(on).toMatch(/workflow_dispatch:/);
    expect(on).toMatch(/proof:\n(?: {8}.+\n)*? {8}type: choice/);
    expect(on).toContain("- leading-keys");
    expect(on).toMatch(/default: none/);
    expect(on).not.toMatch(/issues:|issue_comment:|pull_request|push:/);
  });

  it("is the only workflow that runs at 03:43", () => {
    const others = readdirSync(WORKFLOW_DIR)
      .filter((name) => name.endsWith(".yml") && name !== FILE)
      .filter((name) => /cron:\s*["']43 3 /.test(readFileSync(resolve(WORKFLOW_DIR, name), "utf8")));
    expect(others).toEqual([]);
  });

  it("runs every job in the prod environment with a time limit", () => {
    for (const job of ["review", "write", "notify", "ledger"]) {
      const block = jobBlock(job);
      expect(block).toContain("environment: prod");
      expect(block).toMatch(/\n {4}timeout-minutes: \d+\n/);
    }
    expect(jobBlock("review")).toContain("timeout-minutes: 30");
    expect(jobBlock("review")).toMatch(/id: review\n {8}timeout-minutes: 25\n/);
  });

  it("grants each job exactly its permissions", () => {
    expect(permissionsOf(jobBlock("review"))).toEqual(["contents: read", "actions: read", "issues: read", "id-token: write"]);
    expect(permissionsOf(jobBlock("write"))).toEqual(["contents: read"]);
    expect(permissionsOf(jobBlock("notify"))).toEqual(["contents: read"]);
    expect(permissionsOf(jobBlock("ledger"))).toEqual(["id-token: write", "contents: read", "actions: read"]);
  });

  it("gives only review the dashboard review role", () => {
    expect(text.match(/prod-env-dashboard-review-role/g)).toHaveLength(1);
    expect(jobBlock("review")).toContain("arn:aws:iam::${{ vars.SUBMIT_ACCOUNT_ID }}:role/prod-env-dashboard-review-role");
  });

  it("gives write and notify no AWS credentials", () => {
    for (const job of ["write", "notify"]) {
      const block = jobBlock(job);
      expect(block).not.toMatch(AWS_ROLE_STEP);
      expect(block).not.toContain("id-token");
    }
  });

  it("holds a private-repository token only in write and notify, with the exact permission", () => {
    expect(jobBlock("review")).not.toContain("create-github-app-token");
    expect(jobBlock("ledger")).not.toContain("create-github-app-token");
    expect(jobBlock("write")).toContain("permission-contents: write");
    expect(jobBlock("write")).not.toContain("permission-issues");
    expect(jobBlock("notify")).toContain("permission-issues: write");
    expect(jobBlock("notify")).not.toContain("permission-contents");
  });

  it("gives the review job no write permission", () => {
    expect(permissionsOf(jobBlock("review")).filter((line) => line.endsWith(": write"))).toEqual(["id-token: write"]);
  });

  it("checks the budget and the kill switch before the review script", () => {
    const review = jobBlock("review");
    const script = review.indexOf("node scripts/dashboard-review-nightly.mjs review");
    expect(script).toBeGreaterThan(-1);
    expect(review.indexOf("./.github/actions/agent-run-budget")).toBeGreaterThan(-1);
    expect(review.indexOf("./.github/actions/agent-run-budget")).toBeLessThan(script);
    expect(review.indexOf("./.github/actions/agent-kill-switch")).toBeGreaterThan(-1);
    expect(review.indexOf("./.github/actions/agent-kill-switch")).toBeLessThan(script);
    expect(review.indexOf("Assume the dashboard review role")).toBeLessThan(review.indexOf("./.github/actions/agent-kill-switch"));
  });

  it("counts the budget on the write job's Commit the report step", () => {
    expect(text.match(/agent-run-budget/g)).toHaveLength(1);
    expect(text).toContain("workflow-file: dashboard-review-nightly.yml");
    expect(text).toContain("job-name: write");
    expect(text).toContain("step-name: Commit the report");
    expect(jobBlock("write")).toMatch(/- name: Commit the report\n/);
    expect(text).toContain("DASHBOARD_REVIEW_BUDGET_PER_DAY: '2'");
  });

  it("names the model in one place", () => {
    expect(text.match(/amazon\.nova-pro-v1:0/g)).toHaveLength(1);
    expect(text).toContain("REVIEW_MODEL_ID: 'amazon.nova-pro-v1:0'");
  });

  it("reads the guardrail from the parameters the quarantine readers use", () => {
    expect(jobBlock("review")).toContain("/submit/prod/alarm-triage/guardrail-id");
    expect(jobBlock("review")).toContain("/submit/prod/alarm-triage/guardrail-version");
    expect(jobBlock("review")).toContain("/submit/prod/last-known-good-deployment");
  });

  it("passes the bundle to write as a file, from the job output, with no echo", () => {
    const write = jobBlock("write");
    expect(write).toContain("BUNDLE: ${{ needs.review.outputs.bundle }}");
    expect(write).toContain('printf \'%s\' "$BUNDLE" > "$RUNNER_TEMP/bundle.txt"');
    expect(write).toContain('--bundle "$RUNNER_TEMP/bundle.txt"');
    expect(text).not.toMatch(/echo[^\n]*\$\{?BUNDLE/);
  });

  it("runs write only when review proceeds, and holds the report in the private repository", () => {
    const write = jobBlock("write");
    expect(write).toContain("if: needs.review.outputs.proceed == 'true'");
    expect(write).toContain("repository: ${{ env.PRIVATE_REPO }}");
    expect(write).toContain("sparse-checkout: operator/dashboard-reviews");
    expect(write).toContain("git push origin HEAD:main");
  });

  it("stops after the proof when the input asks for it", () => {
    const review = jobBlock("review");
    expect(review).toContain("proceed: ${{ steps.budget.outputs.over-budget == 'false' && inputs.proof != 'leading-keys' }}");
    expect(review).toContain("leading-keys denied");
    expect(review).toContain("leading-keys allowed");
    expect(review).toContain('--expression-attribute-values \'{":issuer":{"S":"not-held"}}\'');
    expect(jobBlock("ledger")).toContain("inputs.proof != 'leading-keys'");
    expect(jobBlock("notify")).toContain("inputs.proof != 'leading-keys'");
  });

  it("writes a ledger outcome from the fixed list", () => {
    const ledger = jobBlock("ledger");
    for (const word of ["committed", "write-failed", "killed", "review-failed", "over-budget", "no-action"]) {
      expect(ledger).toContain(`OUTCOME="${word}"`);
    }
    expect(ledger).toContain('workflow: "dashboard-review-nightly"');
    expect(ledger).toContain("SUBMIT_ALARM_TRIAGE_ROLE_ARN");
  });

  it("opens one failure issue with fixed text and closes it on the next commit", () => {
    const notify = jobBlock("notify");
    expect(notify).toContain("ISSUE_TITLE: Nightly dashboard review failed");
    expect(notify).toContain("--label dashboard-review");
    expect(notify).toContain('"Committed again on ${TODAY}."');
    expect(notify).toContain('gh issue close "$OPEN"');
    expect(notify).toContain('BODY="Date: ${TODAY}. Failed job: ${JOB}. Run: ${RUN_URL}"');
  });

  it("uploads no artifact", () => {
    expect(text).not.toContain("upload-artifact");
  });

  it("never writes to the step summary or masks data", () => {
    expect(text).not.toContain("GITHUB_STEP_SUMMARY");
    expect(text).not.toContain("::add-mask::");
  });

  it("never prints a data file", () => {
    expect(text).not.toMatch(/\bcat\b/);
    expect(text).not.toMatch(/\becho\b[^\n]*(alarms|bundle|snapshot|answer)/);
  });

  it("derives the transit pass from the app key and the run id, in the steps that use it", () => {
    for (const job of ["review", "write"]) {
      expect(jobBlock(job)).toContain("TRANSIT_PASS=$(printf '%s' \"${TRANSIT_KEY}${GITHUB_RUN_ID}\" | sha256sum | cut -d' ' -f1)");
    }
  });

  it("never tees, so no step needs pipefail for it", () => {
    expect(text).not.toMatch(/\btee\b/);
  });

  it("pins every external action to a 40-character SHA with its version as a comment", () => {
    const uses = text.split("\n").filter((line) => /^\s*(- )?uses: /.test(line) && !line.includes("uses: ./"));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v\d/);
  });
});
