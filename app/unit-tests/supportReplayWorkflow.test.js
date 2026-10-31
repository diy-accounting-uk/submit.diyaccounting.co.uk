// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/support-replay.yml"), "utf8");

describe("support-replay.yml", () => {
  it("runs on dispatch and on a pull request that changes the prompts or the fixtures", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect(on).toMatch(/workflow_dispatch:/);
    expect(on).toMatch(/pull_request:\n {4}paths:/);
    for (const path of ["prompts/support-triage.md", "prompts/support-reader.md", "app/unit-tests/fixtures/support-triage/**"]) {
      expect(on).toContain(`'${path}'`);
    }
  });

  it("has an empty top-level permissions block and no write scope", () => {
    expect(text).toMatch(/\npermissions: \{\}\n/);
    expect(text).not.toMatch(/(contents|issues|pull-requests): write/);
  });

  it("runs the triage prompt through the action support-triage.yml uses", () => {
    const triage = readFileSync(resolve(ROOT, ".github/workflows/support-triage.yml"), "utf8");
    for (const line of [
      "uses: ./.github/actions/run-triage-agent",
      "prompt-file: prompts/support-triage.md",
      "allowed-tools: 'Read,Grep,Glob'",
    ]) {
      expect(text).toContain(line);
      expect(triage).toContain(line);
    }
  });

  it("uses the alarm triage role and skips a fork's pull request", () => {
    expect(text).toContain("deploy-role-arn: ${{ vars.SUBMIT_ALARM_TRIAGE_ROLE_ARN }}");
    expect(text).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });

  it("sends the reader request with no tools", () => {
    expect(text).toContain("aws bedrock-runtime invoke-model");
    expect(text).not.toMatch(/"tools"|^\s+tools:/m);
  });
});
