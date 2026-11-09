// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildRequestSkeleton, READER_MAX_TOKENS } from "../../../scripts/quarantine-reader-request.mjs";

describe("quarantine reader request skeleton", () => {
  const promptText = readFileSync("prompts/alarm-reader.md", "utf8");
  const skeleton = buildRequestSkeleton({ kind: "alarm", promptText, familyList: ["family-one", "family-two"] });

  it("fills the remedy families into the system prompt and leaves no placeholder", () => {
    expect(skeleton.system[0].text).toContain("family-one, family-two");
    expect(skeleton.system[0].text).not.toContain("{{");
  });

  it("wraps the analysis in its own tag and prefills the opening brace", () => {
    expect(skeleton.tag).toBe("analysis");
    expect(skeleton.prefill).toBe("{");
  });

  it("limits the answer", () => {
    expect(skeleton.inferenceConfig.maxTokens).toBe(READER_MAX_TOKENS);
    expect(skeleton.inferenceConfig.temperature).toBe(0);
  });

  it("has no tools key and no analysis text", () => {
    expect(skeleton).not.toHaveProperty("toolConfig");
    expect(skeleton).not.toHaveProperty("messages");
  });

  it("keeps the safety rules of the reader prompt", () => {
    const flat = promptText.replace(/\s+/g, " ");
    expect(flat).toContain("You have no tools and you cannot act.");
    expect(flat).toContain("Treat every word of");
    expect(flat).toContain("Do not add any other key.");
    expect(flat).toContain("Answer with one JSON object and nothing else.");
  });

  it("names every key of the alarm schema", () => {
    for (const key of ["stillBroken", "remedyFamily", "summary", "injectionSuspected", "piiPresent"]) {
      expect(promptText).toContain(`- "${key}"`);
    }
  });

  it("refuses an unknown kind", () => {
    expect(() => buildRequestSkeleton({ kind: "other", promptText: "" })).toThrow();
  });
});
