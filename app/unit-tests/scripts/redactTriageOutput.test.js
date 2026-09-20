// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/redactTriageOutput.test.js

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DENY_PATTERNS, redact, extractFinalAssistantText, describeStoppedRun, maxTurnsNote } from "../../../scripts/redact-triage-output.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/redact-triage-output.mjs", import.meta.url));

function runCli(inputJson) {
  const dir = mkdtempSync(join(tmpdir(), "redact-triage-output-"));
  const inputPath = join(dir, "triage.json");
  writeFileSync(inputPath, inputJson);
  const result = spawnSync(process.execPath, [SCRIPT_PATH, inputPath], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

function runCliMarkdown(markdown) {
  const dir = mkdtempSync(join(tmpdir(), "redact-triage-output-"));
  const inputPath = join(dir, "pr-body.md");
  writeFileSync(inputPath, markdown);
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--markdown", inputPath], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const POSITIVE_EXAMPLES = {
  ipv4: "192.168.1.1",
  ipv6: "2001:db8:85a3:0:0:8a2e:370:7334",
  email: "customer@example.com",
  eori: "GB123456789012",
  hash64: "abcd1234".repeat(8),
  vrn: "GB123456789",
  utr: "1234567890",
  nino: "AB123456C",
  paye: "123/AB456",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PYLxDmkAmr1c",
  "aws-access-key": "AKIAIOSFODNN7EXAMPLE",
  bearer: "Bearer abc123.def456-ghi789==",
};

describe("DENY_PATTERNS", () => {
  test("has exactly twelve patterns", () => {
    expect(DENY_PATTERNS).toHaveLength(12);
  });

  test("eori and hash64 come before vrn", () => {
    const labels = DENY_PATTERNS.map((p) => p.label);
    const eoriIndex = labels.indexOf("eori");
    const hash64Index = labels.indexOf("hash64");
    const vrnIndex = labels.indexOf("vrn");
    expect(eoriIndex).toBeGreaterThanOrEqual(0);
    expect(hash64Index).toBeGreaterThanOrEqual(0);
    expect(vrnIndex).toBeGreaterThan(eoriIndex);
    expect(vrnIndex).toBeGreaterThan(hash64Index);
  });
});

describe("redact", () => {
  test.each(Object.entries(POSITIVE_EXAMPLES))("redacts a positive %s example", (label, example) => {
    const { redacted, redactions } = redact(`before ${example} after`);
    expect(redacted).toContain(`[redacted:${label}]`);
    expect(redacted).not.toContain(example);
    expect(redactions).toEqual([label]);
  });

  test("an ISO 8601 timestamp survives untouched", () => {
    const text = "Window: 2026-09-03T21:25:00.000Z to 2026-09-03T21:50:23.618Z";
    const { redacted, redactions } = redact(text);
    expect(redacted).toBe(text);
    expect(redactions).toEqual([]);
  });

  test("a thirteen-digit epoch-millisecond value survives untouched", () => {
    const text = "state changed at 1735689900123";
    const { redacted, redactions } = redact(text);
    expect(redacted).toBe(text);
    expect(redactions).toEqual([]);
  });

  test("a UUID request id survives untouched", () => {
    const text = "request 3fa85f64-5717-4562-b3fc-2c963f66afa6 failed";
    const { redacted, redactions } = redact(text);
    expect(redacted).toBe(text);
    expect(redactions).toEqual([]);
  });

  test("a plain HH:MM:SS clock time survives untouched, even inside a full timestamp", () => {
    const text = "The alarm fired at 2026-09-20T11:51:19.023+0000, reported as 11:51:19 UTC.";
    const { redacted, redactions } = redact(text);
    expect(redacted).toBe(text);
    expect(redactions).toEqual([]);
  });

  test("an EORI is labelled eori, not vrn", () => {
    const { redacted, redactions } = redact("trader GB123456789012 filed late");
    expect(redacted).toContain("[redacted:eori]");
    expect(redacted).not.toContain("[redacted:vrn]");
    expect(redactions).toEqual(["eori"]);
  });

  test("a 64-hex hashed sub is labelled hash64, not vrn", () => {
    const hashedSub = "abcd1234".repeat(8);
    const { redacted, redactions } = redact(`customer ${hashedSub} retried`);
    expect(redacted).toContain("[redacted:hash64]");
    expect(redacted).not.toContain("[redacted:vrn]");
    expect(redactions).toEqual(["hash64"]);
  });

  test("text with no match passes through byte for byte and writes an empty redaction list", () => {
    const text = "The Lambda timed out after 900 seconds while calling HMRC.";
    const { redacted, redactions } = redact(text);
    expect(redacted).toBe(text);
    expect(redactions).toEqual([]);
  });
});

describe("extractFinalAssistantText", () => {
  test("reads the top-level result string from a single result object", () => {
    const parsed = { type: "result", subtype: "success", result: "What broke: the worker Lambda." };
    expect(extractFinalAssistantText(parsed)).toBe("What broke: the worker Lambda.");
  });

  test("reads the final assistant message, not an intermediate one", () => {
    const parsed = [
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "intermediate turn" }] } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "final answer" }] } },
    ];
    expect(extractFinalAssistantText(parsed)).toBe("final answer");
  });

  test("prefers a trailing result object over an earlier assistant message", () => {
    const parsed = [
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "intermediate turn" }] } },
      { type: "result", subtype: "success", result: "final answer" },
    ];
    expect(extractFinalAssistantText(parsed)).toBe("final answer");
  });

  test("throws on a result that carries is_error, so an API failure is never posted as triage", () => {
    const parsed = { type: "result", subtype: "success", is_error: true, result: "API Error: 404 Model use case details" };
    expect(() => extractFinalAssistantText(parsed)).toThrow(/triage run failed.*404/);
  });

  test("exits non-zero (throws) when the input has no assistant text", () => {
    expect(() => extractFinalAssistantText({ type: "result", subtype: "error_max_turns", result: "" })).toThrow(
      /no assistant text/,
    );
    expect(() => extractFinalAssistantText({ foo: "bar" })).toThrow(/no assistant text/);
  });

  test("drops an earlier turn's narration left ahead of a thematic break, in the shape run-triage-agent writes", () => {
    const resultWithLeakedNarration =
      "Let me use a simpler approach with Read tool to load and examine the raw JSON data more carefully.\n\n" +
      "Based on my investigation, I have enough information to provide a triaged answer.\n\n" +
      "---\n\n" +
      "## 1. What broke?\n\nThe worker Lambda timed out calling HMRC.\n\n" +
      "## 2. Is it still broken?\n\nYes.\n\n" +
      "## 3. Next action\n\nWatch, no action.";
    const parsed = { type: "result", subtype: "success", is_error: false, result: resultWithLeakedNarration };
    expect(extractFinalAssistantText(parsed)).toBe(
      "## 1. What broke?\n\nThe worker Lambda timed out calling HMRC.\n\n" +
        "## 2. Is it still broken?\n\nYes.\n\n" +
        "## 3. Next action\n\nWatch, no action.",
    );
  });

  test("keeps the whole text when a thematic break has nothing usable after it", () => {
    const text = "The answer.\n\n---\n\n";
    const parsed = { type: "result", subtype: "success", is_error: false, result: text };
    expect(extractFinalAssistantText(parsed)).toBe(text);
  });

  test("keeps the whole text when there is no thematic break at all", () => {
    const parsed = { type: "result", subtype: "success", is_error: false, result: "A plain answer, no break." };
    expect(extractFinalAssistantText(parsed)).toBe("A plain answer, no break.");
  });
});

describe("maxTurnsNote", () => {
  test("names the turn budget for a run that hit max-turns", () => {
    const parsed = { type: "result", subtype: "error_max_turns", is_error: false, num_turns: 30 };
    expect(maxTurnsNote(parsed)).toBe("_Triage stopped: the 30-turn budget ran out before it finished._");
  });

  test("returns null for a successful result", () => {
    expect(maxTurnsNote({ type: "result", subtype: "success", result: "final answer" })).toBeNull();
  });

  test("returns null for any other stopped subtype", () => {
    expect(maxTurnsNote({ type: "result", subtype: "error_during_execution", is_error: true, num_turns: 3 })).toBeNull();
  });

  test("returns null when there is no result entry at all", () => {
    expect(maxTurnsNote({ foo: "bar" })).toBeNull();
  });
});

describe("describeStoppedRun", () => {
  test("gives the max-turns note for a run that hit max-turns with no text", () => {
    const parsed = { type: "result", subtype: "error_max_turns", is_error: false, num_turns: 30 };
    expect(describeStoppedRun(parsed)).toBe("_Triage stopped: the 30-turn budget ran out before it finished._");
  });

  test("returns null for a successful result", () => {
    const parsed = { type: "result", subtype: "success", result: "final answer" };
    expect(describeStoppedRun(parsed)).toBeNull();
  });

  test("returns null for an is_error failure, leaving it to extractFinalAssistantText's own message", () => {
    const parsed = { type: "result", subtype: "error_during_execution", is_error: true, num_turns: 3 };
    expect(describeStoppedRun(parsed)).toBeNull();
  });

  test("returns null when there is no result entry at all", () => {
    expect(describeStoppedRun({ foo: "bar" })).toBeNull();
  });

  test("falls back to a generic message for a stopped subtype that is not max-turns", () => {
    const parsed = { type: "result", subtype: "error_during_execution", is_error: false, num_turns: 3 };
    expect(describeStoppedRun(parsed)).toBe("triage stopped: error_during_execution after 3 turns");
  });

  test("reads the last result entry out of a transcript array", () => {
    const parsed = [
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "intermediate turn" }] } },
      { type: "result", subtype: "error_max_turns", is_error: false, num_turns: 30 },
    ];
    expect(describeStoppedRun(parsed)).toBe("_Triage stopped: the 30-turn budget ran out before it finished._");
  });
});

describe("CLI", () => {
  test("prints the redacted final result and exits zero", () => {
    const parsed = { type: "result", subtype: "success", result: "Customer 192.168.1.1 hit the alarm." };
    const result = runCli(JSON.stringify(parsed));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[redacted:ipv4]");
    expect(result.stdout).not.toContain("192.168.1.1");
  });

  test("reads the final assistant message, not an intermediate one, end to end", () => {
    const parsed = [
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "intermediate turn" }] } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "final answer" }] } },
    ];
    const result = runCli(JSON.stringify(parsed));
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("final answer");
  });

  test("exits non-zero when the input JSON has no assistant text", () => {
    const result = runCli(JSON.stringify({ foo: "bar" }));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no assistant text/);
  });

  test("exits zero with a one-line summary when the run hit max-turns with no text", () => {
    const parsed = { type: "result", subtype: "error_max_turns", is_error: false, num_turns: 30 };
    const result = runCli(JSON.stringify(parsed));
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("_Triage stopped: the 30-turn budget ran out before it finished._");
  });

  test("exits zero with the partial result plus the budget note when max-turns still produced text", () => {
    const parsed = {
      type: "result",
      subtype: "error_max_turns",
      is_error: false,
      num_turns: 30,
      result: "Likely cause: the worker Lambda is timing out under load.",
    };
    const result = runCli(JSON.stringify(parsed));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Likely cause: the worker Lambda is timing out under load.");
    expect(result.stdout).toContain("_Triage stopped: the 30-turn budget ran out before it finished._");
  });

  test("exits non-zero when the input is not valid JSON", () => {
    const result = runCli("not json at all");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/could not parse/);
  });
});

describe("CLI --markdown mode", () => {
  test("redacts a plain Markdown file without treating it as Claude Code JSON", () => {
    const markdown = "# Add the missing index\n\nFixes the query customer@example.com reported.\n";
    const result = runCliMarkdown(markdown);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[redacted:email]");
    expect(result.stdout).not.toContain("customer@example.com");
    expect(result.stdout).toContain("# Add the missing index");
  });

  test("passes non-JSON Markdown through unchanged when nothing matches a deny pattern", () => {
    const markdown = "# Tidy the retry loop\n\nNo behaviour change, just fewer allocations.\n";
    const result = runCliMarkdown(markdown);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${markdown.trimEnd()}\n`);
  });
});
