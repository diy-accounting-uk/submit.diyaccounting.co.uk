// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/customerEmailTemplates.test.js

import { describe, test, expect } from "vitest";
import {
  renderEmail,
  buildCustomerEmail,
  buildOperatorCopy,
  buildPassAttachments,
  passRecipientSection,
  softMutation,
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

  test("the receipt email of a VAT return reads in Welsh for a reader whose choice is Welsh, with HMRC's data as returned", () => {
    const m = buildCustomerEmail({
      kind: "submission-receipt",
      data: { receiptKind: "vat-return", language: "cy" },
      baseUrl,
      catalog,
      receipt: {
        formBundleNumber: "FB1",
        processingDate: "2026-11-05T09:30:00.000Z",
        paymentIndicator: "DD",
        chargeRefNumber: "XM002610011594",
      },
    });
    expect(m.subject).toBe("Eich derbynneb: Ffurflen TAW");
    expect(m.html).toContain('<html lang="cy">');
    expect(m.text).toContain("Rhif bwndel y ffurflen (Form bundle number): FB1");
    expect(m.text).toContain("5 Tachwedd 2026");
    expect(m.text).toContain("Ystyr DD yw Debyd Uniongyrchol.");
    expect(m.text).toContain("XM002610011594");
    expect(m.text).toContain("cy/hmrc/receipt/receipts.html");
    expect(m.text).not.toContain("Reply to this email");
  });

  test("submission-receipt is in Welsh when the filing was made with the Welsh choice", () => {
    const m = buildCustomerEmail({
      kind: "submission-receipt",
      data: { receiptKind: "accounts", language: "cy" },
      baseUrl,
      catalog,
      receipt: {
        kind: "companies-house-accounts",
        submissionNumber: "AB1234",
        statusCode: "ACCEPT",
        processingDate: "2026-11-05T09:30:00.000Z",
      },
    });
    expect(m.subject).toBe("Eich derbynneb: Cyfrifon blynyddol");
    expect(m.text).toContain("Rhif cyflwyniad: AB1234");
    expect(m.text).toContain("Statws: ACCEPT");
    expect(m.text).toContain("5 Tachwedd 2026");
    expect(m.text).toContain("Atebwch yr e-bost hwn neu ysgrifennwch at support@diyaccounting.co.uk");
    expect(m.html).toContain('<html lang="cy">');
    expect(m.html).toContain("Gweld eich derbynebau");
    expect(m.text).not.toContain("Your receipt");
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
    expect(m.passQr).toEqual({ code: "ab-cd", url: "https://submit.example.test/pass.html?pass=ab-cd", physical: false });
    expect(m.html).toContain("cid:pass-qr");
  });

  describe("pass-generated is written for the person who generated the pass to share", () => {
    const passCatalog = { bundles: [{ id: "week-guest", name: "Week pass", tokensGranted: 3, timeout: "P7D" }] };
    const passData = {
      code: "tiger-happy-mountain-silver",
      bundleId: "week-guest",
      validUntil: "2026-12-31T00:00:00.000Z",
      maxUses: 20,
      usesLeft: 20,
      passSummary: "submit VAT returns to HMRC",
    };
    const build = (data) => buildCustomerEmail({ kind: "pass-generated", data: { ...passData, ...data }, baseUrl, catalog: passCatalog });

    test("a user's digital pass says it is to share and that they cannot redeem it", () => {
      const m = build({ passTypeId: "digital-pass", generatedBy: "user" });
      expect(m.subject).toBe("A pass to share: Week pass");
      expect(m.text.split("\n")[0]).toBe("A pass to share: Week pass");
      expect(m.text).toContain(
        "You generated this pass to give to someone else. Forward this email, or send them the link or the QR code.",
      );
      expect(m.text).toContain("You cannot redeem it yourself.");
      expect(m.text).not.toContain("Your pass");
      expect(m.html).toContain('alt="QR code for the pass"');
      expect(m.passQr.physical).toBe(false);
    });

    test("the section for the person who gets the pass says what it gives and how to redeem it", () => {
      const m = build({ passTypeId: "digital-pass", generatedBy: "user" });
      expect(m.text).toContain("For the person who gets this pass");
      expect(m.text).toContain(
        "It gives the Week pass: you can submit VAT returns to HMRC. It comes with 3 tokens. It lasts 7 days from when you redeem it.",
      );
      expect(m.text).toContain("To redeem it, open the link or scan the QR code, then sign in with a Google or Microsoft account.");
      expect(m.text).toContain("Pass code: tiger-happy-mountain-silver");
      expect(m.text).toContain("Redeem by: 31 December 2026");
      expect(m.text).toContain("Uses left: 20");
      expect(m.text).toContain("Open the pass link: https://submit.example.test/pass.html?pass=tiger-happy-mountain-silver");
      expect(m.html).toContain("<h2");
    });

    test("the footer says the email went to the person who generated the pass", () => {
      const m = build({ passTypeId: "digital-pass", generatedBy: "user" });
      expect(m.text).toContain("This email went to the person who generated the pass on DIY Accounting Submit.");
      expect(m.text).not.toContain("an action on your DIY Accounting Submit account");
    });

    test("a physical pass keeps the note on the files to print", () => {
      const m = build({ passTypeId: "physical-pass", generatedBy: "user" });
      expect(m.passQr.physical).toBe(true);
      expect(m.text).toContain("The front and back of the pass are attached as files to print");
      expect(m.text).toContain("You cannot redeem it yourself.");
    });

    test("an email-restricted operator pass names the masked address that alone can redeem it", () => {
      const m = build({ passTypeId: "invited-guest", generatedBy: "operator", restrictedTo: "j***@example.com" });
      expect(m.text).toContain("Only j***@example.com can redeem it.");
      expect(m.text).not.toContain("You cannot redeem it yourself.");
    });

    test("an unrestricted operator pass names no address and does not say the operator cannot redeem it", () => {
      const m = build({ passTypeId: "invited-guest", generatedBy: "operator", restrictedTo: null });
      expect(m.text).not.toContain("Only ");
      expect(m.text).not.toContain("You cannot redeem it yourself.");
    });

    test("the Welsh email follows the English", () => {
      const m = build({ passTypeId: "digital-pass", generatedBy: "user", language: "cy", passSummary: "cyflwyno Ffurflenni TAW i CThEF" });
      expect(m.subject).toBe("Tocyn i’w rannu: Week pass");
      expect(m.text).toContain("Gwnaethoch greu’r tocyn hwn i’w roi i rywun arall.");
      expect(m.text).toContain("Ni allwch ei ddefnyddio eich hun.");
      expect(m.text).toContain("I’r person sy’n cael y tocyn hwn");
      expect(m.text).toContain(
        "Mae’n rhoi Week pass: gallwch gyflwyno Ffurflenni TAW i CThEF. Mae’n dod gyda 3 credyd (tokens). Mae’n para 7 diwrnod",
      );
      expect(m.text).toContain("Cod y tocyn: tiger-happy-mountain-silver");
      expect(m.text).toContain("Defnyddiwch ef erbyn: 31 Rhagfyr 2026");
      expect(m.text).toContain("Defnyddiau ar ôl: 20");
      expect(m.text).toContain("Aeth yr e-bost hwn at y person a greodd y tocyn ar DIY Accounting Submit.");
      expect(m.html).toContain('<html lang="cy">');
      expect(m.text).toContain("Cod QR y tocyn: gweler y ddelwedd sydd ynghlwm.");
      expect(m.text).toContain("Agor dolen y tocyn: https://submit.example.test/cy/pass.html?pass=tiger-happy-mountain-silver");
      expect(m.passQr.url).toBe("https://submit.example.test/cy/pass.html?pass=tiger-happy-mountain-silver");
      expect(m.text).not.toContain("A pass to share");
      expect(m.text).not.toContain("see the attached image");
    });

    test("the Welsh recipient section mutates the summary after gallwch and names unlimited tokens as credyd", () => {
      const { section } = passRecipientSection(
        {
          bundles: [
            { name: "Week pass", summary: "cyflwyno Ffurflenni TAW i CThEF", tokensGranted: 3, timeout: "P7D" },
            { name: "Practice", summary: "gwneud popeth yn Resident Pro", tokensGranted: "unlimited", timeout: "P1M" },
            { name: "Operator", summary: "agor dangosfwrdd y gweithredwr", timeout: "P1M" },
          ],
          code: "a-b",
          validUntil: null,
          usesLeft: null,
        },
        "cy",
      );
      expect(section.paragraphs[0]).toContain("gallwch gyflwyno Ffurflenni TAW i CThEF.");
      expect(section.paragraphs[1]).toContain("gallwch wneud popeth yn Resident Pro. Nid oes terfyn ar gredyd (tokens).");
      expect(section.paragraphs[2]).toContain("gallwch agor dangosfwrdd y gweithredwr.");
    });

    test("a Welsh soft mutation changes the first word's radical and leaves a vowel alone", () => {
      expect(["cyflwyno", "gwneud", "pori", "talu", "bwrw", "dewis", "mynd", "llenwi", "rhoi", "agor"].map(softMutation)).toEqual([
        "gyflwyno",
        "wneud",
        "bori",
        "dalu",
        "fwrw",
        "ddewis",
        "fynd",
        "lenwi",
        "roi",
        "agor",
      ]);
    });

    test("the recipient section names every bundle the pass terms carry", () => {
      const { section } = passRecipientSection({
        bundles: [
          { name: "Week pass", summary: "submit VAT returns to HMRC", tokensGranted: 3, timeout: "P7D" },
          { name: "Practice", tokensGranted: "unlimited", timeout: "P1M" },
        ],
        code: "a-b",
        validUntil: null,
        usesLeft: null,
      });
      expect(section.paragraphs).toEqual([
        "It gives the Week pass: you can submit VAT returns to HMRC. It comes with 3 tokens. It lasts 7 days from when you redeem it.",
        "It gives the Practice. There is no limit on tokens. It lasts 1 month from when you redeem it.",
        "To redeem it, open the link or scan the QR code, then sign in with a Google or Microsoft account.",
      ]);
    });
  });

  test("a campaign pass's email names each granted bundle with the duration and tokens the pass sets", () => {
    const campaignCatalog = {
      bundles: [
        { id: "resident-vat-comp", name: "Resident VAT (Complimentary)", tokensGranted: 100, timeout: "P1Y" },
        { id: "invited-guest", name: "Invited Guest", tokensGranted: 3, timeout: "P1M" },
      ],
    };
    const m = buildCustomerEmail({
      kind: "pass-generated",
      data: {
        code: "lantern-brisk-meadow-oak",
        passTypeId: "custom-campaign",
        bundleId: "resident-vat-comp",
        usesLeft: 1000,
        generatedBy: "operator",
        grants: [
          { bundleId: "resident-vat-comp", duration: "P6M", summary: "submit VAT returns to HMRC" },
          { bundleId: "invited-guest", tokens: 10 },
        ],
      },
      baseUrl,
      catalog: campaignCatalog,
    });
    expect(m.text).toContain(
      "It gives the Resident VAT (Complimentary): you can submit VAT returns to HMRC. It comes with 100 tokens. It lasts 6 months from when you redeem it.",
    );
    expect(m.text).toContain("It gives the Invited Guest. It comes with 10 tokens. It lasts 1 month from when you redeem it.");
  });

  test("a grant that lasts a year or more says how long it lasts, in English and in Welsh", () => {
    const { section } = passRecipientSection({
      bundles: [
        { name: "Resident VAT (Complimentary)", tokensGranted: 50, timeout: "P1Y" },
        { name: "Week pass", tokensGranted: 10, timeout: "P1Y6M" },
        { name: "Day pass", tokensGranted: 3, timeout: "P2Y" },
      ],
      code: "a-b",
      validUntil: null,
      usesLeft: null,
    });
    expect(section.paragraphs[0]).toContain("It lasts 1 year from when you redeem it.");
    expect(section.paragraphs[1]).toContain("It lasts 1 year 6 months from when you redeem it.");
    expect(section.paragraphs[2]).toContain("It lasts 2 years from when you redeem it.");
    const welsh = passRecipientSection(
      {
        bundles: [{ name: "Resident VAT (Complimentary)", tokensGranted: 50, timeout: "P1Y" }],
        code: "a-b",
        validUntil: null,
        usesLeft: null,
      },
      "cy",
    );
    expect(welsh.section.paragraphs[0]).toContain("Mae’n para 1 flwyddyn o’r adeg y byddwch yn ei ddefnyddio.");
  });

  test.each([
    ["2027-06-30T22:59:59.999Z", "30 June 2027"],
    ["2026-12-31T23:59:59.999Z", "31 December 2026"],
  ])("a pass ending at the end of a UK day, %s, says to redeem it by that day", (validUntil, day) => {
    const { rows } = passRecipientSection({ bundles: [], code: "a-b", validUntil, usesLeft: null });
    expect(rows.find((row) => row.label === "Redeem by").value).toBe(day);
  });

  test("the redeemed email states each granted bundle's end date", () => {
    const campaignCatalog = {
      bundles: [
        { id: "resident-vat-comp", name: "Resident VAT (Complimentary)" },
        { id: "invited-guest", name: "Invited Guest" },
      ],
    };
    const m = buildCustomerEmail({
      kind: "pass-redeemed",
      data: {
        bundleId: "resident-vat-comp",
        bundles: [
          { bundleId: "resident-vat-comp", expiry: "2027-11-22T00:00:00.000Z" },
          { bundleId: "invited-guest", expiry: null },
        ],
      },
      baseUrl,
      catalog: campaignCatalog,
    });
    expect(m.text).toContain("You can use the bundles now.");
    expect(m.text).toContain(
      "Bundle: Resident VAT (Complimentary)\nEnds on: 22 November 2027\nBundle: Invited Guest\nEnds on: No end date",
    );
  });

  test("the redeemed email for a one-bundle pass states that bundle's end date", () => {
    const m = buildCustomerEmail({
      kind: "pass-redeemed",
      data: { bundleId: "day-guest", expiry: "2026-12-01T00:00:00.000Z" },
      baseUrl,
      catalog,
    });
    expect(m.text).toContain("You can use the bundle now.");
    expect(m.text).toContain("Bundle: Day pass\nEnds on: 1 December 2026");
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
      url: "https://submit.example.test/pass.html?pass=ab-cd",
      physical: false,
    });
    expect(attachments.map((a) => a.FileName)).toEqual(["pass-ab-cd-qr.png"]);
    expect(attachments[0]).toMatchObject({ ContentDisposition: "INLINE", ContentId: "pass-qr", ContentType: "image/png" });
  });

  test("a physical pass adds the front and back faces with the file names the generate page downloads", async () => {
    const attachments = await buildPassAttachments({
      code: "ab-cd",
      url: "https://submit.example.test/pass.html?pass=ab-cd",
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

  test("subscription-started renders in Welsh for a Welsh account with every fact of the English", () => {
    const data = { bundleId: "day-guest", currentPeriodEnd: "2026-12-01T00:00:00Z" };
    const english = buildCustomerEmail({ kind: "subscription-started", data, baseUrl, catalog });
    const welsh = buildCustomerEmail({ kind: "subscription-started", data: { ...data, language: "cy" }, baseUrl, catalog });
    expect(welsh.subject).toBe("Eich tanysgrifiad: Day pass");
    for (const part of [welsh.text, welsh.html]) {
      expect(part).toContain("Mae eich tanysgrifiad Day pass yn weithredol");
      expect(part).toContain("Diolch am danysgrifio. Gallwch ddefnyddio’r Bundle nawr.");
      expect(part).toContain("Day pass");
      expect(part).toContain("1 Rhagfyr 2026");
      expect(part).toContain("https://submit.example.test/cy/index.html");
      expect(part).toContain("https://submit.example.test/cy/bundles.html");
      expect(part).not.toContain("Your Day pass subscription");
    }
    expect(welsh.text).toContain("Yn adnewyddu ar: 1 Rhagfyr 2026");
    expect(welsh.html).toContain('lang="cy"');
    expect(english.subject).toBe("Your Day pass subscription");
    expect(english.text).toContain("Renews on: 1 December 2026");
    expect(english.html).toContain('lang="en"');
  });

  test("pass-redeemed renders in Welsh for a Welsh account, each granted bundle with its end date", () => {
    const campaignCatalog = {
      bundles: [
        { id: "resident-vat-comp", name: "Resident VAT (Complimentary)" },
        { id: "invited-guest", name: "Invited Guest" },
      ],
    };
    const data = {
      bundleId: "resident-vat-comp",
      bundles: [
        { bundleId: "resident-vat-comp", expiry: "2027-11-22T00:00:00.000Z" },
        { bundleId: "invited-guest", expiry: null },
      ],
    };
    const english = buildCustomerEmail({ kind: "pass-redeemed", data, baseUrl, catalog: campaignCatalog });
    const welsh = buildCustomerEmail({ kind: "pass-redeemed", data: { ...data, language: "cy" }, baseUrl, catalog: campaignCatalog });
    expect(welsh.subject).toBe("Mae eich Resident VAT (Complimentary) yn barod");
    expect(welsh.text).toContain("Rydych wedi defnyddio eich tocyn. Gallwch ddefnyddio’r Bundles nawr.");
    expect(welsh.text).toContain(
      "Bundle: Resident VAT (Complimentary)\nYn dod i ben ar: 22 Tachwedd 2027\nBundle: Invited Guest\nYn dod i ben ar: Dim dyddiad gorffen",
    );
    expect(welsh.text).toContain("https://submit.example.test/cy/index.html");
    expect(welsh.html).toContain("Resident VAT (Complimentary)");
    expect(welsh.html).toContain("22 Tachwedd 2027");
    expect(welsh.html).toContain('lang="cy"');
    expect(english.text).toContain(
      "Bundle: Resident VAT (Complimentary)\nEnds on: 22 November 2027\nBundle: Invited Guest\nEnds on: No end date",
    );
    expect(english.text).not.toContain("Yn dod i ben");
  });

  test("pass-redeemed in Welsh for one bundle says the Bundle in the singular", () => {
    const m = buildCustomerEmail({
      kind: "pass-redeemed",
      data: { bundleId: "day-guest", expiry: "2026-12-01T00:00:00.000Z", language: "cy" },
      baseUrl,
      catalog,
    });
    expect(m.text).toContain("Gallwch ddefnyddio’r Bundle nawr.");
    expect(m.text).toContain("Bundle: Day pass\nYn dod i ben ar: 1 Rhagfyr 2026");
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
