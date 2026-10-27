// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildRequestSkeleton, READER_MAX_TOKENS } from "../../../scripts/quarantine-reader-request.mjs";

describe("quarantine reader request skeleton", () => {
  const promptText = readFileSync("prompts/support-reader.md", "utf8");
  const skeleton = buildRequestSkeleton({
    kind: "support",
    promptText,
    categories: ["connection", "other"],
    faqIdList: ["faq-one", "faq-two"],
    familyList: [],
  });

  it("fills the allowed values into the system prompt", () => {
    expect(skeleton.system).toContain("connection, other");
    expect(skeleton.system).toContain("faq-one, faq-two");
    expect(skeleton.system).not.toContain("{{");
  });

  it("limits the answer and prefills the opening brace", () => {
    expect(skeleton.max_tokens).toBe(READER_MAX_TOKENS);
    expect(skeleton.temperature).toBe(0);
    expect(skeleton.prefill).toBe("{");
  });

  it("has no tools key and no ticket text", () => {
    expect(skeleton).not.toHaveProperty("tools");
    expect(skeleton).not.toHaveProperty("messages");
  });

  it("refuses an unknown kind", () => {
    expect(() => buildRequestSkeleton({ kind: "other", promptText: "" })).toThrow();
  });
});
