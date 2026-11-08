// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/alarm-replay.yml"), "utf8");
const action = readFileSync(resolve(ROOT, ".github/actions/run-triage-agent/action.yml"), "utf8");

describe("alarm-replay.yml", () => {
  it("runs on dispatch and on a pull request that changes the prompt, the schema or the fixtures", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect(on).toMatch(/workflow_dispatch:/);
    expect(on).toMatch(/pull_request:\n {4}paths:/);
    for (const path of ["prompts/alarm-triage.md", "prompts/alarm-triage-answer.json", "app/unit-tests/fixtures/alarm-triage/**"]) {
      expect(on).toContain(`'${path}'`);
    }
  });

  it("takes a runner input that scores Nova, Sonnet or both in one run", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect(on).toMatch(/runner:[\s\S]*?options:\n\s+- nova\n\s+- sonnet\n\s+- both/);
    expect(text).toContain('runners=["nova","sonnet"]');
  });

  it("runs one job at a time in one concurrency group that never cancels", () => {
    expect(text).toMatch(/\nconcurrency:\n {2}group: alarm-replay\n {2}cancel-in-progress: false\n/);
    expect(text).toContain("max-parallel: 1");
  });

  it("has an empty top-level permissions block and no write scope", () => {
    expect(text).toMatch(/\npermissions: \{\}\n/);
    expect(text).not.toMatch(/(contents|issues|pull-requests): write/);
  });

  it("keeps the answers out of the job log and reads no live aws", () => {
    expect(text.match(/echo-output: 'false'/g)).toHaveLength(2);
    expect(text).toContain("frozen-results: /tmp/alarm-replay/frozen-results.json");
    expect(action).toContain("--frozen-results");
  });

  it("runs the alarm prompt through the action alarm-triage.yml uses", () => {
    expect(text).toContain("uses: ./.github/actions/run-triage-agent");
    expect(text).toContain("final-schema: prompts/alarm-triage-answer.json");
    expect(text).toContain("prompt-file: prompts/alarm-triage.md");
    expect(text).toContain("runner: nova");
    expect(text).toContain("runner: claude");
    expect(text).toContain("deploy-role-arn: ${{ vars.SUBMIT_ALARM_TRIAGE_ROLE_ARN }}");
  });

  it("skips a fork's pull request and checks the kill switch", () => {
    expect(text).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(text).toContain("uses: ./.github/actions/agent-kill-switch");
  });

  it("scores in a job that applies the gate, and names no fixture of the private set", () => {
    expect(text).toMatch(/\n {2}score:\n {4}needs: replay\n/);
    expect(text).toContain('node scripts/alarm-replay.mjs score /tmp/alarm-outcomes "$SONNET_BASELINE"');
    expect(text).toContain("permission-contents: read");
    expect(text).toContain("private-set/engineering/submit/alarm-replay");
  });
});
