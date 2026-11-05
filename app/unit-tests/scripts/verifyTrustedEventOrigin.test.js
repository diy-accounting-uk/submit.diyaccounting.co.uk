// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/verifyTrustedEventOrigin.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send() {
      throw new Error("the real client must not be used");
    }
  },
  InvokeCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { parseArgs, invokeVerify, main, functionNameFor } from "../../../scripts/verify-trusted-event-origin.mjs";

const answerOf = (value) => ({ Payload: new TextEncoder().encode(JSON.stringify(value)) });
const clientReturning = (response) => ({ send: vi.fn().mockResolvedValue(response) });

describe("verify-trusted-event-origin", () => {
  let dir;
  let logSpy;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "verify-trusted-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  test("parseArgs reads the three arguments", () => {
    expect(parseArgs(["--environment", "prod", "--issue", "12", "--out", "/tmp/x.json"])).toEqual({
      environment: "prod",
      issue: "12",
      out: "/tmp/x.json",
    });
  });

  test("parseArgs rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });

  test("names the function from the environment", () => {
    expect(functionNameFor("ci")).toBe("ci-env-trusted-event-to-github-issue");
  });

  test("invokes verify mode with the issue number", async () => {
    const client = clientReturning(answerOf({ verified: true, strength: "ledger", reason: "ok" }));
    const result = await invokeVerify({ environment: "prod", issueNumber: 7, client });
    expect(result).toEqual({ verified: true, strength: "ledger", reason: "ok" });
    const input = client.send.mock.calls[0][0].input;
    expect(input.FunctionName).toBe("prod-env-trusted-event-to-github-issue");
    expect(JSON.parse(input.Payload)).toEqual({ verify: { issueNumber: 7 } });
  });

  test("an invoke error gives verified false", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("AccessDenied")) };
    const result = await invokeVerify({ environment: "ci", issueNumber: 7, client });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("verify call failed: AccessDenied");
  });

  test("a FunctionError gives verified false", async () => {
    const client = clientReturning({ FunctionError: "Unhandled", ...answerOf({ errorMessage: "boom" }) });
    const result = await invokeVerify({ environment: "ci", issueNumber: 7, client });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/function error Unhandled/);
  });

  test("an answer without a boolean verified gives verified false", async () => {
    for (const answer of [{}, { verified: "true" }, null, "text"]) {
      const result = await invokeVerify({ environment: "ci", issueNumber: 7, client: clientReturning(answerOf(answer)) });
      expect(result.verified).toBe(false);
    }
  });

  test("a payload that is not JSON gives verified false", async () => {
    const client = clientReturning({ Payload: new TextEncoder().encode("not json") });
    expect((await invokeVerify({ environment: "ci", issueNumber: 7, client })).verified).toBe(false);
  });

  test("main prints only verified=true and writes the file", async () => {
    const out = path.join(dir, "v.json");
    const client = clientReturning(answerOf({ verified: true, strength: "source", reason: "the source shows this fact" }));
    const result = await main(["--environment", "ci", "--issue", "5", "--out", out], { client });
    expect(result.verified).toBe(true);
    expect(logSpy.mock.calls).toEqual([["verified=true"]]);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ verified: true, strength: "source", reason: "the source shows this fact" });
  });

  test("main keeps the reason out of stdout when unverified", async () => {
    const out = path.join(dir, "v.json");
    const client = clientReturning(answerOf({ verified: false, strength: "none", reason: "budget spend 123.45 is below" }));
    const result = await main(["--environment", "prod", "--issue", "5", "--out", out], { client });
    expect(result.verified).toBe(false);
    expect(logSpy.mock.calls).toEqual([["verified=false"]]);
    expect(readFileSync(out, "utf8")).toContain("123.45");
  });

  test("main fails closed on a bad environment, a bad issue and an unknown argument", async () => {
    const client = clientReturning(answerOf({ verified: true, strength: "source", reason: "ok" }));
    expect((await main(["--environment", "dev", "--issue", "5"], { client })).verified).toBe(false);
    expect((await main(["--environment", "ci", "--issue", "abc"], { client })).verified).toBe(false);
    expect((await main(["--environment", "ci", "--issue", "0"], { client })).verified).toBe(false);
    expect((await main(["--bogus"], { client })).verified).toBe(false);
    expect(client.send).not.toHaveBeenCalled();
  });

  test("main fails closed when the result file cannot be written", async () => {
    const client = clientReturning(answerOf({ verified: true, strength: "source", reason: "ok" }));
    const result = await main(["--environment", "ci", "--issue", "5", "--out", path.join(dir, "missing", "v.json")], { client });
    expect(result.verified).toBe(false);
    expect(logSpy.mock.calls).toEqual([["verified=false"]]);
  });
});
