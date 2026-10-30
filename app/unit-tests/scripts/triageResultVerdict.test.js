// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/triageResultVerdict.test.js

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { triageVerdict, endsMidStep, stopLine } from "../../../scripts/triage-result-verdict.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/triage-result-verdict.mjs", import.meta.url));

const success = (result) => ({ type: "result", subtype: "success", is_error: false, num_turns: 9, result });

describe("endsMidStep", () => {
  test.each([
    "The alarm window is 2026-10-29 to 2026-10-30. Let me look at the code to understand what this function does:",
    "Checked the logs.\nLet me query the table",
    "Now let me check the deployment",
    "I'll look at the Lambda next.",
  ])("is true for narration: %s", (text) => {
    expect(endsMidStep(text)).toBe(true);
  });

  test.each(["Cause: the deploy rolled back.\n\nremedy: close-when-gone", "The alarm is cleared.\nLet me know if it recurs.", ""])(
    "is false for a conclusion: %s",
    (text) => {
      expect(endsMidStep(text)).toBe(false);
    },
  );
});

describe("triageVerdict", () => {
  test("complete for a success with a concluding answer", () => {
    expect(triageVerdict(success("Cause: a timeout.\n\nremedy: none"))).toEqual({ verdict: "complete", reason: "" });
  });

  test("incomplete for a success that ends mid-step", () => {
    const { verdict, reason } = triageVerdict(success("Let me check the current time context. Let me look at the code:"));
    expect(verdict).toBe("incomplete");
    expect(reason).toBe("the final message stopped mid-step after 9 turns");
  });

  test("incomplete for a success with an empty result", () => {
    expect(triageVerdict(success("  ")).verdict).toBe("incomplete");
  });

  test("max_turns for a run that spent its turn budget, even with partial text", () => {
    const parsed = { type: "result", subtype: "error_max_turns", num_turns: 60, result: "Cause: probably" };
    expect(triageVerdict(parsed)).toEqual({ verdict: "max_turns", reason: "the 60-turn budget ran out" });
  });

  test("incomplete for any other subtype", () => {
    const parsed = { type: "result", subtype: "error_during_execution", is_error: true, num_turns: 3 };
    expect(triageVerdict(parsed).reason).toBe("the run ended with error_during_execution after 3 turns");
  });

  test("incomplete for a success flagged as an error", () => {
    expect(triageVerdict({ ...success("done."), is_error: true }).verdict).toBe("incomplete");
  });

  test("none when there is no result entry", () => {
    expect(triageVerdict({ foo: "bar" }).verdict).toBe("none");
  });

  test("reads the last result entry of a transcript array", () => {
    const parsed = [{ type: "assistant" }, success("Cause: a timeout.")];
    expect(triageVerdict(parsed).verdict).toBe("complete");
  });
});

describe("stopLine", () => {
  test("names the reason and the run link", () => {
    expect(stopLine("the 60-turn budget ran out", "https://example.test/r/1")).toBe(
      "_Triage stopped before an answer: the 60-turn budget ran out. Run: https://example.test/r/1_",
    );
  });
});

describe("CLI", () => {
  function run(content) {
    const dir = mkdtempSync(join(tmpdir(), "triage-verdict-"));
    const path = join(dir, "result.json");
    writeFileSync(path, content);
    const out = spawnSync(process.execPath, [SCRIPT_PATH, path], { encoding: "utf8" });
    rmSync(dir, { recursive: true, force: true });
    return out;
  }

  test("prints verdict and reason lines", () => {
    const out = run(JSON.stringify(success("Let me check:")));
    expect(out.status).toBe(0);
    expect(out.stdout).toBe("verdict=incomplete\nreason=the final message stopped mid-step after 9 turns\n");
  });

  test("prints verdict none for unparseable input", () => {
    expect(run("not json").stdout).toContain("verdict=none");
  });
});
