// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/hmrc-field-table.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("hmrc-field-table value column heading", () => {
  let table;

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/money-format.js");
    await import("../public/lib/hmrc-field-table.js");
    table = window.HmrcFieldTable;
  });

  const heading = (html) => html.match(/<th scope="col" class="field-amount">([^<]*)<\/th>/)[1];

  it("heads a column of money Amount", () => {
    const html = table.renderFieldTable([{ field: "a", label: "A", value: 12.5 }]);
    expect(heading(html)).toBe("Amount");
  });

  it("heads a column with a text value Value", () => {
    const html = table.renderFieldTable([
      { field: "paymentIndicator", label: "Payment indicator", value: "DD", kind: "text" },
      { field: "a", label: "A", value: 12.5 },
    ]);
    expect(heading(html)).toBe("Value");
  });
});
