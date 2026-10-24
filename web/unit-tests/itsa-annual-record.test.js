// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/itsa-annual-record.test.js

import { describe, test, expect } from "vitest";
import { annualCopyHtml } from "../public/lib/itsa-submission-record.js";

const SAVED = {
  kind: "self-employment",
  nino: "AB123456C",
  businessId: "XAIS12345678901",
  taxYear: "2024-25",
  savedAt: "2025-06-01T10:30:00Z",
  sent: { adjustments: { includedNonTaxableProfits: 200 } },
};

describe("annualCopyHtml HMRC correlation ID", () => {
  test("shows the id after the business ID when HMRC sent one", () => {
    const html = annualCopyHtml({ ...SAVED, correlationId: "7a1c-0042" });
    expect(html).toContain("HMRC correlation ID 7a1c-0042");
    expect(html.indexOf("Business ID XAIS12345678901")).toBeLessThan(html.indexOf("HMRC correlation ID"));
  });

  test.each([undefined, null, ""])("leaves the line out when the id is %s", (correlationId) => {
    const html = annualCopyHtml({ ...SAVED, correlationId });
    expect(html).not.toContain("HMRC correlation ID");
    expect(html).toContain("Business ID XAIS12345678901");
  });

  test("escapes the id", () => {
    const html = annualCopyHtml({ ...SAVED, correlationId: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
