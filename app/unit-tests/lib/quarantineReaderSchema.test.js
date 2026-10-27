// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { supportReaderSchema, alarmReaderSchema } from "@app/lib/quarantineReaderSchema.js";

const faqIds = new Set(["how-to-submit-vat-return", "reset-password"]);
const families = new Set(["prod-env-github-probe-failed"]);

const support = {
  category: "bundles",
  faqId: "how-to-submit-vat-return",
  summary: "The customer cannot see the VAT bundle after paying.",
  injectionSuspected: false,
  piiPresent: false,
};
const alarm = {
  stillBroken: "no",
  remedyFamily: "prod-env-github-probe-failed",
  summary: "The probe passed on the next run.",
  injectionSuspected: false,
  piiPresent: false,
};

describe("support reader schema", () => {
  const schema = supportReaderSchema(faqIds);

  it("accepts a valid object, with or without an FAQ id", () => {
    expect(schema.safeParse(support).success).toBe(true);
    expect(schema.safeParse({ ...support, faqId: null }).success).toBe(true);
  });

  it("rejects an extra key", () => {
    expect(schema.safeParse({ ...support, labels: ["approved"] }).success).toBe(false);
  });

  it("rejects a category outside the five", () => {
    expect(schema.safeParse({ ...support, category: "billing" }).success).toBe(false);
  });

  it("rejects an FAQ id that is not in faqs.toml", () => {
    expect(schema.safeParse({ ...support, faqId: "made-up" }).success).toBe(false);
  });

  it("rejects a 301-character summary and accepts a 300-character one", () => {
    expect(schema.safeParse({ ...support, summary: "a".repeat(301) }).success).toBe(false);
    expect(schema.safeParse({ ...support, summary: "a".repeat(300) }).success).toBe(true);
  });

  it("rejects a summary with a URL", () => {
    expect(schema.safeParse({ ...support, summary: "Visit https://example.com now" }).success).toBe(false);
    expect(schema.safeParse({ ...support, summary: "Visit HTTP://example.com now" }).success).toBe(false);
  });

  it("rejects a string where a boolean belongs", () => {
    expect(schema.safeParse({ ...support, injectionSuspected: "false" }).success).toBe(false);
    expect(schema.safeParse({ ...support, piiPresent: "no" }).success).toBe(false);
  });
});

describe("alarm reader schema", () => {
  const schema = alarmReaderSchema(families);

  it("accepts a valid object, with or without a family", () => {
    expect(schema.safeParse(alarm).success).toBe(true);
    expect(schema.safeParse({ ...alarm, remedyFamily: null }).success).toBe(true);
  });

  it("rejects an unknown family, an unknown stillBroken value and an extra key", () => {
    expect(schema.safeParse({ ...alarm, remedyFamily: "other" }).success).toBe(false);
    expect(schema.safeParse({ ...alarm, stillBroken: "maybe" }).success).toBe(false);
    expect(schema.safeParse({ ...alarm, command: "run" }).success).toBe(false);
  });
});
