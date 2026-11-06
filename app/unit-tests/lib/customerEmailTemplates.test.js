// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/customerEmailTemplates.test.js

import { describe, test, expect } from "vitest";
import {
  renderEmail,
  buildCustomerEmail,
  buildOperatorCopy,
  buildPassAttachments,
  NOTICE_LIST_URL,
} from "@app/lib/customerEmailTemplates.js";

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
      { kind: "notice-digest", data: { count: 2, nearestDeadline: hostile } },
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

  test("submission-receipt shows a processing time and a period in words", () => {
    const vat = buildCustomerEmail({
      kind: "submission-receipt",
      data: { receiptKind: "vat-return" },
      baseUrl,
      catalog,
      receipt: { formBundleNumber: "FB1", processingDate: "2026-11-05T09:30:00.000Z" },
    });
    expect(vat.text).toContain("5 November 2026, 09:30 UTC");
    expect(vat.text).not.toContain("2026-11-05T09:30");

    const dateOnly = buildCustomerEmail({
      kind: "submission-receipt",
      data: { receiptKind: "vat-return" },
      baseUrl,
      catalog,
      receipt: { formBundleNumber: "FB1", processingDate: "2026-11-01" },
    });
    expect(dateOnly.text).toContain("1 November 2026");
    expect(dateOnly.text).not.toContain("UTC");

    const itsa = buildCustomerEmail({
      kind: "submission-receipt",
      data: { receiptKind: "itsa-period-self-employment" },
      baseUrl,
      catalog,
      receipt: { kind: "itsa-period-self-employment", correlationId: "c1", periodId: "2026-04-06_2026-07-05", taxYear: "2026-27" },
    });
    expect(itsa.text).toContain("6 April 2026 to 5 July 2026");
  });

  test("a pass with no end date says so", () => {
    const m = buildCustomerEmail({ kind: "pass-generated", data: { code: "a-b-c-d", bundleId: "day-guest" }, baseUrl, catalog });
    expect(m.text).toContain("No end date");
    expect(m.text).not.toContain("Not set");
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
    expect(m.passQr).toEqual({ code: "ab-cd", url: "https://submit.example.test/bundles.html?pass=ab-cd", physical: false });
    expect(m.html).toContain("cid:pass-qr");
  });

  test("a physical pass asks for the media to print", () => {
    const m = buildCustomerEmail({
      kind: "pass-generated",
      data: { code: "ab-cd", passTypeId: "physical-pass", bundleId: "day-guest" },
      baseUrl,
      catalog,
    });
    expect(m.passQr.physical).toBe(true);
  });

  test("a digital pass has the inline QR code as its only attachment", async () => {
    const attachments = await buildPassAttachments({
      code: "ab-cd",
      url: "https://submit.example.test/bundles.html?pass=ab-cd",
      physical: false,
    });
    expect(attachments.map((a) => a.FileName)).toEqual(["pass-ab-cd-qr.png"]);
    expect(attachments[0]).toMatchObject({ ContentDisposition: "INLINE", ContentId: "pass-qr", ContentType: "image/png" });
  });

  test("a physical pass adds the front and back faces with the file names the generate page downloads", async () => {
    const attachments = await buildPassAttachments({
      code: "ab-cd",
      url: "https://submit.example.test/bundles.html?pass=ab-cd",
      physical: true,
    });
    expect(attachments.map((a) => [a.FileName, a.ContentType, a.ContentDisposition])).toEqual([
      ["pass-ab-cd-qr.png", "image/png", "INLINE"],
      ["pass-ab-cd-front.svg", "image/svg+xml", "ATTACHMENT"],
      ["pass-ab-cd-back.svg", "image/svg+xml", "ATTACHMENT"],
      ["pass-ab-cd-back.png", "image/png", "ATTACHMENT"],
    ]);
    const front = attachments[1].RawContent.toString("utf8");
    expect(front).toContain(">ab<");
    expect(front).toContain(">cd<");
    expect(attachments[2].RawContent.toString("utf8")).toContain("ab-cd</text>");
    expect(attachments[3].RawContent.subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  test("pass-redeemed names the bundle", () => {
    const m = buildCustomerEmail({ kind: "pass-redeemed", data: { bundleId: "day-guest" }, baseUrl, catalog });
    expect(m.subject).toBe("Your Day pass is ready");
  });

  test("pass-redeemed with no expiry says there is no end date, in both parts", () => {
    const m = buildCustomerEmail({ kind: "pass-redeemed", data: { bundleId: "day-guest", expiry: null }, baseUrl, catalog });
    for (const part of [m.text, m.html]) {
      expect(part).toContain("No end date");
      expect(part).not.toContain("Not set");
    }
  });

  test("pass-redeemed with an expiry gives the date", () => {
    const m = buildCustomerEmail({ kind: "pass-redeemed", data: { bundleId: "day-guest", expiry: "2026-12-01" }, baseUrl, catalog });
    expect(m.text).toContain("Ends on: 1 December 2026");
  });

  test("notice-digest holds the count, the nearest deadline and the issue list link, in both parts", () => {
    const message = buildCustomerEmail({ kind: "notice-digest", data: { count: 3, nearestDeadline: "2026-11-12" }, baseUrl, catalog });
    expect(message.subject).toBe("3 notices wait for you");
    for (const part of [message.text, message.html]) {
      expect(part).toContain("Notices waiting");
      expect(part).toContain("12 November 2026");
    }
    expect(message.text).toContain(`Open the issue list: ${NOTICE_LIST_URL}`);
    expect(message.html).toContain("label%3Amail-notice+label%3Amaintainer-review");
    expect(message.passQr).toBeNull();
  });

  test("notice-digest says none when no deadline is set and uses the singular for one notice", () => {
    const message = buildCustomerEmail({ kind: "notice-digest", data: { count: 1 }, baseUrl, catalog });
    expect(message.subject).toBe("1 notice waits for you");
    expect(message.text).toContain("Nearest deadline: none");
  });

  test("notice-digest refuses a count below one or a count that is not a number", () => {
    for (const count of [0, -1, 1.5, "x", undefined]) {
      expect(() => buildCustomerEmail({ kind: "notice-digest", data: { count }, baseUrl, catalog })).toThrow("InvalidNoticeDigest");
    }
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
