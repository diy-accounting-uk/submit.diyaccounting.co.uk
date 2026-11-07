// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnippets } from "../../scripts/support-snippets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/support-replay.yml"), "utf8");

describe("support-replay.yml", () => {
  it("runs on dispatch and on a pull request that changes the prompts or the fixtures", () => {
    const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
    expect(on).toMatch(/workflow_dispatch:/);
    expect(on).toMatch(/pull_request:\n {4}paths:/);
    for (const path of [
      "prompts/support-triage.md",
      "prompts/support-reader.md",
      "prompts/mail-reader.md",
      "app/unit-tests/fixtures/support-triage/**",
    ]) {
      expect(on).toContain(`'${path}'`);
    }
  });

  it("scores triage quality against the bar and fails a job on a safety fixture", () => {
    expect(text).toMatch(/continue-on-error: \$\{\{ !\(startsWith\(matrix\.fixture, 'injection-'\)/);
    expect(text).toContain("startsWith(matrix.fixture, 'malicious-')");
    expect(text).toContain("startsWith(matrix.fixture, 'steering-')");
    expect(text).toMatch(/\n {2}score:\n {4}needs: triage\n/);
    expect(text).toContain("node scripts/support-replay.mjs score /tmp/replay-outcomes");
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
      "runner: nova",
      "tools: none",
      "final-schema: prompts/support-triage-answer.json",
      "context-files: ${{ steps.snippets.outputs.context-files }}",
      "node scripts/support-retrieval.mjs --handling-input /tmp/support-handling-input.json",
      "support-handling-input.json",
    ]) {
      expect(text).toContain(line);
      expect(triage).toContain(line);
    }
  });

  it("calls Nova Pro with no read tool and installs no Claude Code", () => {
    const triage = readFileSync(resolve(ROOT, ".github/workflows/support-triage.yml"), "utf8");
    expect(triage).toContain("MODEL_ID: 'amazon.nova-pro-v1:0'");
    for (const workflow of [text, triage]) {
      expect(workflow).not.toMatch(/claude-code|CLAUDE_CODE_VERSION|allowed-tools/);
    }
  });

  it("runs Nova Pro unless a dispatch names a model, and passes the choice to every model call", () => {
    expect(text).toContain("MODEL_ID: ${{ inputs.model-id || 'amazon.nova-pro-v1:0' }}");
    expect(text).toContain("READER_MODEL_ID: ${{ inputs.model-id || 'amazon.nova-pro-v1:0' }}");
    expect(text).toMatch(/inputs:\n {6}model-id:\n(?: {8}.*\n)*? {8}default: 'amazon\.nova-pro-v1:0'/);
    expect(text).toContain("reasoning-effort: ${{ env.REASONING_EFFORT }}");
    expect(text).toContain("options: ['off', low, medium, high]");
    expect(text).toContain('--arg effort "$REASONING_EFFORT"');
    const settle = text.slice(text.indexOf("Judge the draft and repair it once"));
    expect(settle.slice(0, settle.indexOf("Judge the answer against the fixture"))).toContain("support-triage-settle.mjs");
  });

  it("keeps the request well inside the model's input limit", () => {
    const largest = buildSnippets({ updatedOf: () => "" })
      .map((snippet) => snippet.bytes)
      .sort((a, b) => b - a)
      .slice(0, 3);
    const snippetBytes = largest.reduce((sum, bytes) => sum + bytes, 0);
    const bytes = readFileSync(resolve(ROOT, "prompts/support-triage.md")).length + snippetBytes;
    // Two bytes for each token is a safe floor, and the runner's request cap is 200,000 tokens.
    expect(bytes / 2).toBeLessThan(100000);
  });

  it("uses the alarm triage role and skips a fork's pull request", () => {
    expect(text).toContain("deploy-role-arn: ${{ vars.SUBMIT_ALARM_TRIAGE_ROLE_ARN }}");
    expect(text).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });

  it("sends the reader request with no tools", () => {
    expect(text).toContain("aws bedrock-runtime converse");
    expect(text.slice(text.indexOf("\n  reader:\n"))).not.toMatch(/"tools"|toolConfig|^\s+tools:/m);
  });

  it("builds the reader request from the kind of the fixture", () => {
    expect(text).toContain('node scripts/support-replay.mjs reader-kind "$FIXTURE"');
    expect(text).toContain('node scripts/quarantine-reader-request.mjs "$READER_KIND"');
  });
});
