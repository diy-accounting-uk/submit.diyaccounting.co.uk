// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/itsa-submission-model.test.js

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "web/public/lib/itsaSubmissionModel.js"), "utf-8");

describe("itsaSubmissionModel foreign property entry key", () => {
  let model;

  beforeAll(() => {
    globalThis.window = globalThis;
    // eslint-disable-next-line no-new-func
    new Function(source)();
    model = globalThis.itsaSubmissionModel;
  });

  it("keys the entries by country code up to 2025-26", () => {
    expect(model.resolveForeignPropertyEntryKey("2024-25")).toBe("countryCode");
    expect(model.resolveForeignPropertyEntryKey("2025-26")).toBe("countryCode");
  });

  it("keys the entries by property id from 2026-27", () => {
    expect(model.resolveForeignPropertyEntryKey("2026-27")).toBe("propertyId");
    expect(model.resolveForeignPropertyEntryKey("2027-28")).toBe("propertyId");
  });

  it("refuses a malformed tax year", () => {
    expect(() => model.resolveForeignPropertyEntryKey("2026-28")).toThrow(/Invalid taxYear/);
  });
});
