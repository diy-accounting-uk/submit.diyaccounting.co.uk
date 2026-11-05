// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/customerEmailTemplates.test.js

import { describe, test, expect } from "vitest";
import { renderEmail, buildCustomerEmail, buildOperatorCopy } from "@app/lib/customerEmailTemplates.js";

const catalog = { bundles: [{ id: "day-guest", name: "Day pass" }] };
const baseUrl = "https://submit.example.test/";
const hostile = '<script>alert(1)</script>"x\r\nBcc: a@b.c';

describe("lib/customerEmailTemplates", () => {
  test("renderEmail writes the same facts to text and html", () => {
    const { text, html, subject } = renderEmail({
      subject: "Hello",
      heading: "Heading",
      rows: [{ label: "Bundle", value: "Day pass" }],
      actions: [{ href: "https://x.example.test/a", text: "Go" }],
      notes: ["A note"],
      reason: "Because",
    });
    expect(subject).toBe("Hello");
    for (const part of ["Heading", "Bundle", "Day pass", "https://x.example.test/a", "A note", "Because", "support@diyaccounting.co.uk"]) {
      expect(text).toContain(part);
      expect(html).toContain(part);
    }
  });

  test("renderEmail refuses a link that is not https", () => {
    expect(() =>
      renderEmail({ subject: "s", heading: "h", reason: "r", actions: [{ href: "http://x.example.test", text: "Go" }] }),
    ).toThrow();
    expect(() =>
      renderEmail({ subject: "s", heading: "h", reason: "r", actions: [{ href: "javascript:alert(1)", text: "Go" }] }),
    ).toThrow();
  });

  test("renderEmail escapes every field and removes line breaks from the subject", () => {
    const { html, subject } = renderEmail({
      subject: hostile,
      preheader: hostile,
      heading: hostile,
      intro: hostile,
      rows: [{ label: hostile, value: hostile }],
      actions: [{ href: `https://x.example.test/?q=${hostile}`, text: hostile }],
      notes: [hostile],
      image: { cid: "c", alt: hostile },
      reason: hostile,
    });
    expect(html).not.toContain("<script>");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  test("every kind escapes hostile data", () => {
    const cases = [
      { kind: "subscription-started", data: { bundleId: hostile, currentPeriodEnd: hostile } },
      {
        kind: "submission-receipt",
        data: { receiptKind: hostile },
        receipt: { formBundleNumber: hostile, processingDate: hostile, taxYear: hostile },
      },
      { kind: "pass-generated", data: { code: hostile, bundleId: hostile, validUntil: hostile, maxUses: hostile } },
      { kind: "pass-redeemed", data: { bundleId: hostile, expiry: hostile } },
    ];
    for (const input of cases) {
      const message = buildCustomerEmail({ ...input, baseUrl, catalog });
      expect(message.html).not.toContain("<script>");
      expect(message.subject).not.toMatch(/[\r\n]/);
    }
  });

  test("subscription-started names the bundle and links to the site", () => {
    const m = buildCustomerEmail({
      kind: "subscription-started",
      data: { bundleId: "day-guest", currentPeriodEnd: "2026-12-01T00:00:00Z" },
      baseUrl,
      catalog,
    });
    expect(m.subject).toBe("Your Day pass subscription");
    expect(m.text).toContain("1 December 2026");
    expect(m.text).toContain("https://submit.example.test/bundles.html");
    expect(m.passQr).toBeNull();
  });

  test("submission-receipt copies the allowlisted fields only", () => {
    const receipt = {
      formBundleNumber: "FB1",
      processingDate: "2026-11-01",
      paymentIndicator: "DD",
      chargeRefNumber: "CH1",
      nino: "QQ123456C",
      utr: "1234567890",
      vrn: "123456789",
      figures: { box1: 99999 },
    };
    const m = buildCustomerEmail({ kind: "submission-receipt", data: { receiptKind: "vat-return" }, baseUrl, catalog, receipt });
    expect(m.subject).toBe("Your receipt: VAT return");
    expect(m.text).toContain("FB1");
    expect(m.text).toContain("DD means Direct Debit.");
    for (const secret of ["QQ123456C", "1234567890", "123456789", "99999"]) {
      expect(m.text).not.toContain(secret);
      expect(m.html).not.toContain(secret);
    }
  });

  test("pass-generated asks for a QR code and builds the pass link", () => {
    const m = buildCustomerEmail({ kind: "pass-generated", data: { code: "ab-cd", bundleId: "day-guest", maxUses: 1 }, baseUrl, catalog });
    expect(m.passQr).toEqual({ code: "ab-cd", url: "https://submit.example.test/bundles.html?pass=ab-cd" });
    expect(m.html).toContain("cid:pass-qr");
  });

  test("pass-redeemed names the bundle", () => {
    const m = buildCustomerEmail({ kind: "pass-redeemed", data: { bundleId: "day-guest" }, baseUrl, catalog });
    expect(m.subject).toBe("Your Day pass is ready");
  });

  test("an unknown kind throws", () => {
    expect(() => buildCustomerEmail({ kind: "nope", baseUrl, catalog })).toThrow();
  });

  test("operator copy masks the customer address", () => {
    const m = buildOperatorCopy({
      kind: "subscription-started",
      data: { bundleId: "day-guest" },
      address: "person@example.com",
      environmentName: "ci",
      catalog,
    });
    expect(m.subject).toBe("Subscribed: Day pass");
    expect(m.text).toContain("p***@example.com");
    expect(m.text).not.toContain("person@example.com");
    expect(buildOperatorCopy({ kind: "pass-redeemed", data: {}, address: "a@b.c", environmentName: "ci", catalog }).subject).toBe(
      "Pass redeemed: your bundle",
    );
  });
});
