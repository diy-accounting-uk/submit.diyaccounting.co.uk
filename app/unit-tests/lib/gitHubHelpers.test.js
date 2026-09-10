// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";

import { appendAutomationDisclosure } from "@app/lib/gitHubHelpers.js";

describe("gitHubHelpers", () => {
  describe("appendAutomationDisclosure", () => {
    test("appends automation disclosure footer to body text", () => {
      const body = "Some issue content";
      const result = appendAutomationDisclosure(body);
      expect(result).toContain("Some issue content");
      expect(result).toContain("---");
      expect(result).toContain("Raised automatically by an automated pipeline.");
    });

    test("preserves multiline body content", () => {
      const body = "Line 1\nLine 2\nLine 3";
      const result = appendAutomationDisclosure(body);
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
      expect(result).toContain("Line 3");
      expect(result).toContain("Raised automatically by an automated pipeline.");
    });

    test("ends with disclosure footer", () => {
      const body = "Content";
      const result = appendAutomationDisclosure(body);
      expect(result).toContain("*Raised automatically by an automated pipeline.*");
      expect(result.endsWith("*")).toBe(true);
    });
  });
});
