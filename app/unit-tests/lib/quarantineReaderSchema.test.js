// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { alarmReaderSchema } from "@app/lib/quarantineReaderSchema.js";

const families = new Set(["prod-env-github-probe-failed"]);

const alarm = {
  stillBroken: "no",
  remedyFamily: "prod-env-github-probe-failed",
  summary: "The probe passed on the next run.",
  injectionSuspected: false,
  piiPresent: false,
};

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

  it("rejects a 301-character summary and accepts a 300-character one", () => {
    expect(schema.safeParse({ ...alarm, summary: "a".repeat(301) }).success).toBe(false);
    expect(schema.safeParse({ ...alarm, summary: "a".repeat(300) }).success).toBe(true);
  });

  it("rejects a summary with a URL", () => {
    expect(schema.safeParse({ ...alarm, summary: "Visit https://example.com now" }).success).toBe(false);
    expect(schema.safeParse({ ...alarm, summary: "Visit HTTP://example.com now" }).success).toBe(false);
  });

  it("rejects a string where a boolean belongs", () => {
    expect(schema.safeParse({ ...alarm, injectionSuspected: "false" }).success).toBe(false);
    expect(schema.safeParse({ ...alarm, piiPresent: "no" }).success).toBe(false);
  });
});
