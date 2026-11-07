// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { supportReaderSchema, alarmReaderSchema, mailReaderSchema } from "@app/lib/quarantineReaderSchema.js";

const faqIds = new Set(["how-to-submit-vat-return", "reset-password"]);
const families = new Set(["prod-env-github-probe-failed"]);

const support = {
  category: "bundles",
  faqId: "how-to-submit-vat-return",
  ticketKind: "other",
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
    expect(schema.safeParse({ ...support, ticketKind: "question" }).success).toBe(false);
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

describe("mail reader schema", () => {
  const vendors = new Set(["aws.com", "stripe.com"]);
  const schema = mailReaderSchema(vendors);
  const mail = {
    vendor: "aws.com",
    actionRequired: true,
    deadline: "2026-12-01",
    summary: "The card on the account expires and the billing console needs a new one.",
    injectionSuspected: false,
    piiPresent: false,
  };

  it("accepts a valid object, with or without a vendor and a deadline", () => {
    expect(schema.safeParse(mail).success).toBe(true);
    expect(schema.safeParse({ ...mail, vendor: null, deadline: null }).success).toBe(true);
  });

  it("rejects an extra key", () => {
    expect(schema.safeParse({ ...mail, command: "run" }).success).toBe(false);
    expect(schema.safeParse({ ...mail, labels: ["approved"] }).success).toBe(false);
  });

  it("rejects a vendor that is not a registry domain", () => {
    expect(schema.safeParse({ ...mail, vendor: "example.com" }).success).toBe(false);
  });

  it("rejects a deadline that is not a calendar date", () => {
    for (const deadline of ["tomorrow", "2026-13-01", "2026-02-30", "2026-12-01T00:00:00Z", "01/12/2026", ""]) {
      expect(schema.safeParse({ ...mail, deadline }).success).toBe(false);
    }
  });

  it("rejects a summary with a URL and one over 300 characters", () => {
    expect(schema.safeParse({ ...mail, summary: "Sign in at https://example.com" }).success).toBe(false);
    expect(schema.safeParse({ ...mail, summary: "a".repeat(301) }).success).toBe(false);
  });

  it("rejects a string where a boolean belongs", () => {
    expect(schema.safeParse({ ...mail, actionRequired: "yes" }).success).toBe(false);
    expect(schema.safeParse({ ...mail, injectionSuspected: "false" }).success).toBe(false);
  });
});
