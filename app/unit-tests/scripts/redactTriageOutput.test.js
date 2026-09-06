// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/redactTriageOutput.test.js

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DENY_PATTERNS, redact, extractFinalAssistantText } from "../../../scripts/redact-triage-output.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/redact-triage-output.mjs", import.meta.url));

function runCli(inputJson) {
  const dir = mkdtempSync(join(tmpdir(), "redact-triage-output-"));
  const inputPath = join(dir, "triage.json");
  writeFileSync(inputPath, inputJson);
  const result = spawnSync(process.execPath, [SCRIPT_PATH, inputPath], { encoding: "utf8" });
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

  test("exits non-zero when the input is not valid JSON", () => {
    const result = runCli("not json at all");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/could not parse/);
  });
});
