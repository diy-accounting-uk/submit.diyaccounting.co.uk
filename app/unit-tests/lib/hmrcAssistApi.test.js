// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/hmrcAssistApi.test.js

import { describe, test, expect } from "vitest";
import { vatAssist, itsaAssist } from "@app/lib/hmrcAssistApi.js";

const BASE = "https://hmrc.example";

describe("vatAssist", () => {
  const ids = { vrn: "123456789", reportId: "report-1", correlationId: "corr-1", presentedDateTime: "2026-06-09T10:30:00Z" };

  test("builds the feedback URL", () => {
    expect(vatAssist.reportUrl(BASE, ids)).toBe("https://hmrc.example/organisations/vat-assist/feedback/123456789");
  });

  test("builds the acknowledge URL with the presented time as a query parameter", () => {
    expect(vatAssist.acknowledgeUrl(BASE, ids)).toBe(
      "https://hmrc.example/organisations/vat-assist/acknowledge/123456789/report-1/corr-1?presentedDateTime=2026-06-09T10%3A30%3A00Z",
    );
  });

  test("builds a body of the period key and the nine boxes only", () => {
    const figures = {
      vatDueSales: 1,
      vatDueAcquisitions: 2,
      totalVatDue: 3,
      vatReclaimedCurrPeriod: 4,
      netVatDue: 5,
      totalValueSalesExVAT: 6,
      totalValuePurchasesExVAT: 7,
      totalValueGoodsSuppliedExVAT: 8,
      totalAcquisitionsExVAT: 9,
      vrn: "123456789",
      finalised: true,
    };
    expect(vatAssist.reportBody({ periodKey: "KEY" }, figures)).toEqual({
      periodKey: "KEY",
      vatDueSales: 1,
      vatDueAcquisitions: 2,
      totalVatDue: 3,
      vatReclaimedCurrPeriod: 4,
      netVatDue: 5,
      totalValueSalesExVAT: 6,
      totalValuePurchasesExVAT: 7,
      totalValueGoodsSuppliedExVAT: 8,
      totalAcquisitionsExVAT: 9,
    });
  });

  test("carries the write:vat scope and the version 1.0 Accept header", () => {
    expect(vatAssist.scopes).toEqual(["write:vat"]);
    expect(vatAssist.acceptHeader).toBe("application/vnd.hmrc.1.0+json");
  });
});

describe("itsaAssist", () => {
  test("builds the report URL", () => {
    expect(itsaAssist.reportUrl(BASE, { nino: "AA123456A", taxYear: "2025-26", calculationId: "calc-1" })).toBe(
      "https://hmrc.example/individuals/self-assessment/assist/reports/AA123456A/2025-26/calc-1",
    );
  });

  test("builds the acknowledge URL", () => {
    expect(itsaAssist.acknowledgeUrl(BASE, { nino: "AA123456A", reportId: "report-1", correlationId: "corr-1" })).toBe(
      "https://hmrc.example/individuals/self-assessment/assist/reports/acknowledge/AA123456A/report-1/corr-1",
    );
  });

  test("sends no request body", () => {
    expect(itsaAssist.reportBody({}, {})).toBeUndefined();
  });

  test("carries the Self Assessment Assist scopes and the version 1.0 Accept header", () => {
    expect(itsaAssist.scopes).toEqual(["read:self-assessment-assist", "write:self-assessment-assist"]);
    expect(itsaAssist.acceptHeader).toBe("application/vnd.hmrc.1.0+json");
  });
});

describe("normaliseReport", () => {
  const itsaReport = {
    reportId: "report-1",
    correlationId: "c".repeat(64),
    nino: "AA123456A",
    messages: [
      { title: "T1", body: "B1", action: "A1", links: [{ title: "L1", url: "https://www.gov.uk/one" }], path: "/p1" },
      { title: "T2", body: "B2", path: "/p2" },
    ],
  };

  test("itsa keeps ids, message text, links, paths and order unchanged", () => {
    const report = itsaAssist.normaliseReport(itsaReport);
    expect(report.reportId).toBe("report-1");
    expect(report.correlationId).toBe("c".repeat(64));
    expect(report.messages.map((message) => message.title)).toEqual(["T1", "T2"]);
    expect(report.messages[0]).toEqual({
      title: "T1",
      body: "B1",
      action: "A1",
      links: [{ title: "L1", url: "https://www.gov.uk/one" }],
      path: "/p1",
    });
    expect(report.messages[1].links).toEqual([]);
  });

  test("itsa returns no messages for a report without any", () => {
    expect(itsaAssist.normaliseReport({ reportId: "r", correlationId: "c" }).messages).toEqual([]);
  });
});

describe("vatAssist feedback response", () => {
  const feedback = {
    reportId: "report-1",
    correlationId: "C".repeat(64),
    englishFeedback: [
      {
        itemNumber: "1",
        title: "T1",
        body: "B1",
        action: "A1",
        links: [{ title: "L1", url: "https://www.gov.uk/one" }],
        path: "vatDueSales",
      },
      { itemNumber: "2", title: "T2", body: "B2", path: "totalValuePurchasesExVAT" },
    ],
    welshFeedback: [
      {
        itemNumber: "1",
        title: "W1",
        body: "WB1",
        action: "WA1",
        links: [{ title: "WL1", url: "https://www.gov.uk/one" }],
        path: "vatDueSales",
      },
    ],
  };

  test("normalises the English feedback to the shared shape, text, links, paths and order unchanged", () => {
    const report = vatAssist.normaliseReport(feedback);
    expect(report.reportId).toBe("report-1");
    expect(report.correlationId).toBe("C".repeat(64));
    expect(report.messages).toEqual([
      { title: "T1", body: "B1", action: "A1", links: [{ title: "L1", url: "https://www.gov.uk/one" }], path: "vatDueSales" },
      { title: "T2", body: "B2", action: undefined, links: [], path: "totalValuePurchasesExVAT" },
    ]);
  });

  test("normalises the Welsh feedback the same way", () => {
    expect(vatAssist.normaliseWelshMessages(feedback).map((message) => message.title)).toEqual(["W1"]);
  });

  test("a response with feedback is not the no-feedback answer", () => {
    expect(vatAssist.isNoFeedback(feedback)).toBe(false);
  });

  test("a single message numbered 0 is the no-feedback answer", () => {
    expect(vatAssist.isNoFeedback({ reportId: "r", englishFeedback: [{ itemNumber: "0", title: "none", body: "none" }] })).toBe(true);
  });
});
