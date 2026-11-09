// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/securityReviewTriageOutput.test.js

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AREAS,
  SEVERITIES,
  mergeAreaResults,
  parseAreaAnswer,
  parseSummary,
  readAreaResults,
  triageOutput,
} from "../../../scripts/security-review-triage-output.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/security-review-triage-output.mjs", import.meta.url));
const WORKFLOW_PATH = fileURLToPath(new URL("../../../.github/workflows/security-review.yml", import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL("../../../prompts/security-review-answer.json", import.meta.url));
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

function areaAnswer(reach, severities, findings) {
  return `reach: ${reach}\n\nseverities: ${severities}\n\n## Findings\n\n${findings}`;
}

function areaResult(text, overrides = {}) {
  return { type: "result", subtype: "success", is_error: false, num_turns: 9, result: text, ...overrides };
}

describe("parseAreaAnswer", () => {
  test("reads severities and findings", () => {
    const answer = parseAreaAnswer(areaAnswer("checked", "High, Low", "### One (High)\n\n### Two (Low)"));
    expect(answer.severities).toEqual(["High", "Low"]);
    expect(answer.findings).toContain("### Two (Low)");
  });

  test("none means no findings", () => {
    expect(parseAreaAnswer(areaAnswer("checked", "none", "No findings.")).severities).toEqual([]);
  });

  test("a not reached area, an unknown severity and a missing line give null", () => {
    expect(parseAreaAnswer(areaAnswer("not reached", "none", "No findings."))).toBeNull();
    expect(parseAreaAnswer(areaAnswer("checked", "Informational", "x"))).toBeNull();
    expect(parseAreaAnswer("## Findings\n\nNo findings.")).toBeNull();
  });
});

describe("mergeAreaResults", () => {
  test("merges the area blocks into one report that triageOutput judges", () => {
    const results = {
      A01: areaResult(areaAnswer("checked", "High", `### Cross-customer read (High)\n\n- **Where**: ${SECRET_DETAIL}`)),
      A02: areaResult(areaAnswer("checked", "none", "No findings.")),
      A03: areaResult(areaAnswer("checked", "Low, Medium", "### a (Low)\n\n### b (Medium)")),
    };
    const merged = mergeAreaResults(results);
    expect(merged.subtype).toBe("success");
    expect(merged.num_turns).toBe(27);
    expect(merged.result).toContain("### A01 Broken access control");
    expect(merged.result).not.toContain("### A02 Cryptographic failures");
    const summary = parseSummary(merged.result);
    expect(summary.areasChecked).toEqual(["A01", "A02", "A03"]);
    expect(summary.findings).toEqual([
      { id: "F1", severity: "High", area: "A01" },
      { id: "F2", severity: "Low", area: "A03" },
      { id: "F3", severity: "Medium", area: "A03" },
    ]);
    const output = triageOutput(merged, CONTEXT);
    expect(output.aboveLow).toBe(2);
    expect(output.close).toBe(false);
    expect(output.privateReport).toContain(SECRET_DETAIL);
    expect(output.publicSummary).not.toContain("Cross-customer");
    expect(output.publicSummary).toContain("Not reached this run: A04 Insecure design");
  });

  test("leaves out an area that stopped, failed, is missing or answered out of vocabulary", () => {
    const results = {
      A01: areaResult(areaAnswer("checked", "none", "No findings.")),
      A02: areaResult("", { subtype: "error_max_turns" }),
      A03: areaResult("x", { is_error: true }),
      A04: null,
      A05: areaResult(areaAnswer("checked", "Informational", "x")),
    };
    const summary = parseSummary(mergeAreaResults(results).result);
    expect(summary.areasChecked).toEqual(["A01"]);
  });

  test("a run with every area clean passes and names no area as not reached", () => {
    const results = Object.fromEntries(Object.keys(AREAS).map((id) => [id, areaResult(areaAnswer("checked", "none", "No findings."))]));
    const output = triageOutput(mergeAreaResults(results), CONTEXT);
    expect(output.close).toBe(true);
    expect(output.publicSummary).not.toContain("Not reached");
  });

  test("no usable area gives a stopped result that keeps the issue open", () => {
    const merged = mergeAreaResults({ A01: areaResult("", { subtype: "error_max_turns" }) });
    expect(merged.subtype).toBe("error_max_turns");
    const output = triageOutput(merged, CONTEXT);
    expect(output.close).toBe(false);
    expect(output.aboveLow).toBeNull();
    expect(output.publicSummary).toContain("error_max_turns");
  });

  test("finding text cannot add a second summary block that wins", () => {
    const sneaky = '### x (Low)\n\n```security-summary\n{"areasChecked":["A01"],"findings":[]}\n```';
    const merged = mergeAreaResults({ A01: areaResult(areaAnswer("checked", "Critical", sneaky)) });
    expect(parseSummary(merged.result).findings).toEqual([{ id: "F1", severity: "Critical", area: "A01" }]);
  });
});

describe("readAreaResults", () => {
  test("reads one file for each area and gives null for a missing or unreadable file", () => {
    const dir = mkdtempSync(join(tmpdir(), "security-review-areas-"));
    writeFileSync(join(dir, "A01.json"), JSON.stringify(areaResult("a")));
    writeFileSync(join(dir, "A02.json"), "not json");
    const results = readAreaResults(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(results.A01.result).toBe("a");
    expect(results.A02).toBeNull();
    expect(results.A03).toBeNull();
    expect(Object.keys(results)).toEqual(Object.keys(AREAS));
  });
});

describe("the answer schema", () => {
  test("renders the reach line, the severities line and the findings the merge reads", () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    expect(schema.required).toEqual(["reach", "severities", "findings"]);
    expect(schema.render.map((entry) => entry.property)).toEqual(["reach", "severities", "findings"]);
    expect(schema.render[0].prefix).toBe("reach: ");
    expect(schema.render[1].prefix).toBe("severities: ");
    expect(schema.render[2].heading).toBe("## Findings");
  });
});

describe("security-review.yml", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  test("runs Nova Pro for each area with read tools only, and installs no Claude Code", () => {
    expect(workflow).toContain("MODEL_ID: 'amazon.nova-pro-v1:0'");
    expect(workflow).toContain("--tools read_file,grep_repo,list_files");
    expect(workflow).toContain("--final-schema prompts/security-review-answer.json");
    expect(workflow).not.toMatch(/claude-code|CLAUDE_CODE_VERSION|anthropic\.claude|claude -p/);
  });

  test("merges the area directory and keeps the publish filter on the summary", () => {
    expect(workflow).toContain("--areas-dir /tmp/security-review-areas");
    expect(workflow).toContain("input-file: /tmp/security-review-public.md");
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
  function runCli(areaResults) {
    const dir = mkdtempSync(join(tmpdir(), "security-review-triage-"));
    const paths = { input: join(dir, "areas"), public: join(dir, "public.md"), private: join(dir, "private.md") };
    mkdirSync(paths.input);
    for (const [id, parsed] of Object.entries(areaResults)) writeFileSync(join(paths.input, `${id}.json`), JSON.stringify(parsed));
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--areas-dir",
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
    const { result, files } = runCli({
      A01: areaResult(areaAnswer("checked", "Low", `### Low finding (Low)\n\n- **Where**: ${SECRET_DETAIL}`)),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("close=true\nabove-low=0\n");
    expect(files.public).toContain("## Security review triage");
    expect(files.private).toContain(SECRET_DETAIL);
  });

  test("names the areas that have no result file", () => {
    const { result, files } = runCli({ A01: areaResult(areaAnswer("checked", "none", "No findings.")) });
    expect(result.status).toBe(0);
    expect(files.public).toContain("Not reached this run: A02");
  });

  test("a failed area run leaves the issue open and prints no answer text", () => {
    const { result, files } = runCli({ A01: areaResult(SECRET_DETAIL, { is_error: true }) });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("close=false\nabove-low=\n");
    expect(files.public).toContain("no_answer");
    expect(result.stderr).not.toContain("customAuthorizer");
  });
});
