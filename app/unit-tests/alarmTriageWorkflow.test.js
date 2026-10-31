// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// alarmTriageWorkflow.test.js -- alarm-triage.yml runs the Sonnet pass only after the operator
// removes `maintainer-review` from an alarm issue. This test pins the shape that keeps it so:
// the one unlabeled event that starts an agent, where Sonnet may run, the jobs that hold power,
// and the absence of any way for the first-pass result or the reader's answer to reach this
// public repository's logs.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AWS_ROLE_STEP = /configure-aws-credentials|\.\/\.github\/actions\/aws-role/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/alarm-triage.yml"), "utf8");

function jobBlock(name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`no job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function stepBlock(jobText, stepName) {
  const start = jobText.indexOf(`- name: ${stepName}\n`);
  if (start === -1) throw new Error(`no step ${stepName}`);
  const rest = jobText.slice(start);
  const next = rest.slice(1).search(/\n {6}- name:/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("alarm-triage.yml", () => {
  it("triggers on issues opened and unlabeled, and on dispatch", () => {
    expect(text).toMatch(/\n {2}issues:\n {4}types: \[opened, unlabeled\]\n/);
    expect(text).toMatch(/\n {2}workflow_dispatch:\n/);
  });

  it("starts an agent from an unlabeled event only for maintainer-review removed by the operator on an alarm issue", () => {
    const triage = jobBlock("triage");
    const condition = triage.slice(triage.indexOf("    if: >-"), triage.indexOf("    runs-on:"));
    expect(condition).toContain("github.event.action == 'unlabeled'");
    expect(condition).toContain("github.event.label.name == 'maintainer-review'");
    expect(condition).toContain("github.event.sender.login == 'antonycc'");
    expect(condition).toContain("contains(github.event.issue.labels.*.name, 'alarm')");
    expect(condition).toContain("needs.gate.outputs.allowed == 'true'");
  });

  it("runs the Sonnet step only in escalate mode", () => {
    const sonnet = stepBlock(jobBlock("run-triage"), "Run triage (Sonnet)");
    expect(sonnet).toContain("env.MODE == 'escalate'");
    expect(sonnet).not.toContain("judge.outputs.escalate");
  });

  it("runs the Haiku pass and the judge only in first-pass mode", () => {
    const runTriage = jobBlock("run-triage");
    expect(stepBlock(runTriage, "Run triage (Haiku)")).toContain("env.MODE == 'first-pass'");
    expect(stepBlock(runTriage, "Judge the first pass")).toContain("env.MODE == 'first-pass'");
  });

  it("checks the maintainer-review gate before any AWS credentials in escalate mode", () => {
    const runTriage = jobBlock("run-triage");
    expect(runTriage.indexOf("maintainer-review-gate.mjs")).toBeGreaterThan(-1);
    expect(runTriage.indexOf("maintainer-review-gate.mjs")).toBeLessThan(runTriage.search(AWS_ROLE_STEP));
    expect(stepBlock(runTriage, "Check the maintainer-review gate")).toContain("env.MODE == 'escalate'");
  });

  it("skips every publishing step on a held run", () => {
    const runTriage = jobBlock("run-triage");
    for (const name of [
      "Select the triage result",
      "Require a usable result",
      "Filter the triage answer before it is published",
      "Open a draft PR when triage named a change",
      "Comment the triage",
      "Act on the remedy the triage named",
    ]) {
      expect(stepBlock(runTriage, name), name).toContain("steps.judge.outputs.hold != 'true'");
    }
  });

  it("gives the quarantine job no checkout and only id-token write", () => {
    const quarantine = jobBlock("quarantine");
    expect(quarantine).not.toContain("actions/checkout");
    expect(quarantine).not.toContain("create-github-app-token");
    const perms = quarantine.match(/\n {4}permissions:\n((?: {6}.+\n)+)/)[1];
    expect(perms.trim()).toBe("id-token: write");
    expect(quarantine).toContain("-env-quarantine-reader-role");
    expect(quarantine).toContain("aws bedrock-runtime invoke-model");
  });

  it("gives the hold job no AWS credentials and adds the label with an App token", () => {
    const hold = jobBlock("hold");
    expect(hold).not.toMatch(AWS_ROLE_STEP);
    expect(hold).not.toContain("id-token");
    expect(hold).toContain("labels[]=maintainer-review");
    expect(hold).toContain("quarantine-reader-check.mjs --kind alarm");
  });

  it("passes the first-pass result and the reader's answer between jobs encrypted", () => {
    expect(jobBlock("run-triage")).toContain("openssl enc -aes-256-cbc");
    expect(jobBlock("quarantine")).toContain("openssl enc -d -aes-256-cbc");
    expect(jobBlock("quarantine")).toContain("openssl enc -aes-256-cbc");
    expect(jobBlock("hold")).toContain("openssl enc -d -aes-256-cbc");
  });

  it("does not print the first-pass result, the reader's answer or the escalation input", () => {
    for (const job of ["quarantine", "hold"]) {
      const block = jobBlock(job);
      expect(block, job).not.toMatch(/\btee\b/);
      expect(block, job).not.toContain("GITHUB_STEP_SUMMARY");
    }
    expect(stepBlock(jobBlock("run-triage"), "Hand the first-pass result on, encrypted")).not.toMatch(/\btee\b/);
    expect(stepBlock(jobBlock("run-triage"), "Write the escalation input from the reader's checked summary")).not.toMatch(/\btee\b|cat /);
  });

  it("does not run the customer lookup again on an escalation", () => {
    expect(jobBlock("customer-lookup")).toContain("needs.triage.outputs.mode != 'escalate'");
  });

  it("matches a mirror issue by a whole marker line", () => {
    expect(text).not.toContain("contains($marker)");
  });

  it("reads the evidence only after the alarm window closes, with CloudTrail's delivery lag", () => {
    const runTriage = jobBlock("run-triage");
    const wait = stepBlock(runTriage, "Wait for the alarm window to close");
    expect(wait).toContain(`/aws/cloudtrail*) DELIVERY_LAG_SECONDS=600`);
    expect(wait).toContain(`sleep "$WAIT_SECONDS"`);
    expect(runTriage.indexOf("- name: Resolve the evidence links for this alarm")).toBeLessThan(
      runTriage.indexOf("- name: Wait for the alarm window to close"),
    );
    expect(runTriage.indexOf("- name: Wait for the alarm window to close")).toBeLessThan(
      runTriage.indexOf("- name: Prove the triage credentials against the alarm's telemetry"),
    );
  });
});
