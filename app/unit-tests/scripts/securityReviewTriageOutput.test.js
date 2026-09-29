// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/securityReviewTriageOutput.test.js

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AREAS, SEVERITIES, parseSummary, triageOutput } from "../../../scripts/security-review-triage-output.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/security-review-triage-output.mjs", import.meta.url));
const PROMPT_PATH = fileURLToPath(new URL("../../../prompts/security-review-triage.md", import.meta.url));

const CONTEXT = {
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  targetBranch: "main",
  reportLocation: "`s3://lake/private/security-review/x.md` in the prod account",
};

const SECRET_DETAIL = "app/functions/auth/customAuthorizer.js:42 lets a forged token through";

function report(summary) {
  return [
    "## Findings",
    "",
    `### F1. Forged token accepted (High, A07)`,
    "",
    `- **Where**: ${SECRET_DETAIL}`,
    "",
    "---",
    "",
    "## Summary data",
    "",
    "```security-summary",
    JSON.stringify(summary),
    "```",
  ].join("\n");
}

function success(text) {
  return { type: "result", subtype: "success", is_error: false, num_turns: 40, result: text };
}

describe("parseSummary", () => {
  test("reads the last security-summary block", () => {
    const text = `${report({ areasChecked: ["A01"], findings: [] })}\n\n${report({ areasChecked: ["A02"], findings: [] })}`;
    expect(parseSummary(text).areasChecked).toEqual(["A02"]);
  });

  test("rejects a missing block", () => {
    expect(() => parseSummary("## Findings\n\nNo findings.")).toThrow("no security-summary block");
  });

  test("rejects a severity outside the vocabulary", () => {
    const text = report({ areasChecked: ["A01"], findings: [{ id: "F1", severity: "Informational", area: "A01" }] });
    expect(() => parseSummary(text)).toThrow("severity outside");
  });

  test("rejects an area outside the vocabulary without quoting it", () => {
    const text = report({ areasChecked: ["see customerAuthorizer.js:42"], findings: [] });
    expect(() => parseSummary(text)).toThrow("areasChecked holds an id outside the area list");
    try {
      parseSummary(text);
    } catch (err) {
      expect(err.message).not.toContain("customerAuthorizer");
    }
  });
});

describe("triageOutput", () => {
  test("keeps finding detail out of the public summary and in the private report", () => {
    const summary = { areasChecked: ["A01", "A07"], findings: [{ id: "F1", severity: "High", area: "A07" }] };
    const output = triageOutput(success(report(summary)), CONTEXT);
    expect(output.publicSummary).not.toContain("customAuthorizer");
    expect(output.publicSummary).not.toContain("Forged");
    expect(output.privateReport).toContain(SECRET_DETAIL);
    expect(output.publicSummary).toContain("| High | 1 |");
    expect(output.publicSummary).toContain("Findings held privately");
    expect(output.publicSummary).toContain("stays open");
    expect(output.close).toBe(false);
    expect(output.aboveLow).toBe(1);
  });

  test("closes on Low findings only, and names areas not reached", () => {
    const summary = { areasChecked: ["A01"], findings: [{ id: "F1", severity: "Low", area: "A01" }] };
    const output = triageOutput(success(report(summary)), CONTEXT);
    expect(output.close).toBe(true);
    expect(output.aboveLow).toBe(0);
    expect(output.publicSummary).toContain("Pass: nothing above Low");
    expect(output.publicSummary).toContain("Findings held privately");
    expect(output.publicSummary).toContain("Not reached this run: A02 Cryptographic failures");
  });

  test("a clean run passes without a held-privately line", () => {
    const output = triageOutput(success(report({ areasChecked: Object.keys(AREAS), findings: [] })), CONTEXT);
    expect(output.close).toBe(true);
    expect(output.publicSummary).not.toContain("held privately");
    expect(output.publicSummary).not.toContain("Not reached");
  });

  test("a run that stopped early keeps the issue open and reports no counts", () => {
    const parsed = { type: "result", subtype: "error_max_turns", is_error: false, num_turns: 120 };
    const output = triageOutput(parsed, CONTEXT);
    expect(output.close).toBe(false);
    expect(output.aboveLow).toBeNull();
    expect(output.publicSummary).toContain("error_max_turns");
    expect(output.publicSummary).not.toContain("| High |");
  });

  test("a failed run throws", () => {
    expect(() => triageOutput({ type: "result", subtype: "success", is_error: true, result: "x" }, CONTEXT)).toThrow("triage run failed");
  });

  test("reads the last result entry of a transcript array", () => {
    const parsed = [{ type: "assistant" }, success(report({ areasChecked: ["A01"], findings: [] }))];
    expect(triageOutput(parsed, CONTEXT).close).toBe(true);
  });
});

describe("the triage prompt", () => {
  const prompt = readFileSync(PROMPT_PATH, "utf8");

  test("lists every area id the script accepts", () => {
    for (const id of Object.keys(AREAS)) expect(prompt).toMatch(new RegExp(`^- ${id}\\b`, "m"));
  });

  test("names every severity the script accepts", () => {
    expect(prompt).toContain(`\`severity\` is one of ${SEVERITIES.join(", ")}`);
  });
});

describe("the CLI", () => {
  function runCli(parsed) {
    const dir = mkdtempSync(join(tmpdir(), "security-review-triage-"));
    const paths = { input: join(dir, "in.json"), public: join(dir, "public.md"), private: join(dir, "private.md") };
    writeFileSync(paths.input, JSON.stringify(parsed));
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--input",
        paths.input,
        "--public",
        paths.public,
        "--private",
        paths.private,
        "--commit",
        CONTEXT.commitSha,
        "--branch",
        CONTEXT.targetBranch,
        "--report-location",
        CONTEXT.reportLocation,
      ],
      { encoding: "utf8" },
    );
    const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
    const files = { public: read(paths.public), private: read(paths.private) };
    rmSync(dir, { recursive: true, force: true });
    return { result, files };
  }

  test("prints the verdict and writes both files", () => {
    const { result, files } = runCli(success(report({ areasChecked: ["A01"], findings: [] })));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("close=true\nabove-low=0\n");
    expect(files.public).toContain("## Security review triage");
    expect(files.private).toContain(SECRET_DETAIL);
  });

  test("keeps the private report when the summary block is malformed, and prints nothing from it", () => {
    const { result, files } = runCli(success(`## Findings\n\n${SECRET_DETAIL}\n\n\`\`\`security-summary\nnot json\n\`\`\``));
    expect(result.status).toBe(1);
    expect(files.private).toContain(SECRET_DETAIL);
    expect(files.public).toBeNull();
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("customAuthorizer");
  });
});
