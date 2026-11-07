// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bedrockErrorLine } from "../../../scripts/bedrock-error-line.mjs";

describe("bedrockErrorLine", () => {
  it("adds the service message to a ValidationException", () => {
    const stderr =
      "\nAn error occurred (ValidationException) when calling the Converse operation: This model does not support assistant message prefill.\n";
    expect(bedrockErrorLine(stderr)).toBe("ValidationException: This model does not support assistant message prefill.");
  });

  it("prints only the exception name for any other exception", () => {
    const stderr = "An error occurred (ThrottlingException) when calling the Converse operation: Too many requests, SECRET text";
    expect(bedrockErrorLine(stderr)).toBe("ThrottlingException");
  });

  it("drops stderr lines after the error line and non-printable characters", () => {
    const stderr =
      "An error occurred (ValidationException) when calling the Converse operation: bad\u0007 input\nTraceback: private text\n";
    expect(bedrockErrorLine(stderr)).toBe("ValidationException: bad input");
  });

  it("cuts a long message to 300 characters", () => {
    const stderr = `An error occurred (ValidationException) when calling the Converse operation: ${"x".repeat(500)}`;
    expect(bedrockErrorLine(stderr)).toBe(`ValidationException: ${"x".repeat(300)}`);
  });

  it("names the exception alone when the message is missing, and prints nothing for no exception", () => {
    expect(bedrockErrorLine("An error occurred (ValidationException) when calling")).toBe("ValidationException");
    expect(bedrockErrorLine("connection reset")).toBe("");
  });

  it("is called by every workflow that makes a converse call", () => {
    for (const file of ["alarm-triage", "support-replay", "support-reader"]) {
      const text = readFileSync(`.github/workflows/${file}.yml`, "utf8");
      expect(text).toContain("converse failed: $(node scripts/bedrock-error-line.mjs /tmp/invoke.err)");
    }
  });
});
