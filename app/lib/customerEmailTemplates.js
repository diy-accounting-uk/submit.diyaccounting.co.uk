// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/customerEmailTemplates.js

import { escapeRecordText, escapeRecordAttribute } from "./submissionRecord.js";
import { maskEmail } from "./activityAlert.js";
import { generatePassQrCodeBuffer, generatePassQrCodeSvgString } from "./qrCodeGenerator.js";
import { generateBackSvg, generateFrontSvg } from "./passMedia.js";

const SUPPORT_ADDRESS = "support@diyaccounting.co.uk";
const COMPANY_NAME = "DIY Accounting Limited";
const TEXT_COLOUR = "#0b0c0c";
const SECONDARY_COLOUR = "#45505e";
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const PASS_QR_CONTENT_ID = "pass-qr";
const PHYSICAL_PASS_TYPE_ID = "physical-pass";

const VAT_RECEIPT_EXPLANATION =
  "HMRC gives this receipt when it accepts a VAT return. The form bundle number is HMRC's reference for your return. Keep it: HMRC asks for it if you ask about the return.";

const PAYMENT_INDICATORS = {
  DD: "DD means Direct Debit.",
  BANK: "BANK means a payment through your bank.",
};

const RECEIPT_KIND_TITLES = {
  "vat-return": "VAT return",
  "itsa-period-self-employment": "Self-employment update",
  "itsa-period-uk-property": "UK property update",
  "itsa-period-foreign-property": "Foreign property update",
  "itsa-annual-self-employment": "Self-employment annual summary",
  "itsa-annual-uk-property": "UK property annual summary",
  "itsa-annual-foreign-property": "Foreign property annual summary",
  "itsa-losses-and-claims": "Losses and claims",
  "itsa-tax-liability-adjustments": "Tax liability adjustments",
  "itsa-final-declaration": "Final declaration",
  "ct-return": "Corporation Tax return",
  "accounts": "Annual accounts",
  "confirmation-statement": "Confirmation statement",
  "psc-verification-statement": "PSC verification statement",
};

const RECEIPT_FIELDS = [
  ["formBundleNumber", "Form bundle number"],
  ["processingDate", "Processing date"],
  ["paymentIndicator", "Payment indicator"],
  ["chargeRefNumber", "Charge reference"],
  ["submissionNumber", "Submission number"],
  ["correlationId", "Correlation id"],
  ["irmark", "IRmark"],
  ["calculationId", "Calculation id"],
  ["periodId", "Period"],
  ["taxYear", "Tax year"],
  ["statusCode", "Status"],
];

function stripLineBreaks(value) {
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function assertHttps(href) {
  if (typeof href !== "string" || !href.startsWith("https://")) {
    throw new Error("Email link must start with https://");
  }
}

/**
 * Render one message as a text part and an HTML part from one model, so the two cannot disagree.
 * Every value is escaped here; a model builder cannot miss one.
 *
 * @param {Object} model
 * @param {string} model.subject
 * @param {string} [model.preheader]
 * @param {string} model.heading
 * @param {string} [model.intro]
 * @param {{label: string, value: string}[]} [model.rows]
 * @param {{href: string, text: string}[]} [model.actions]
 * @param {string[]} [model.notes]
 * @param {{cid: string, alt: string}} [model.image] - an inline image attached under this content id
 * @param {string} model.reason - why the person gets this email
 * @returns {{subject: string, text: string, html: string}}
 */
export function renderEmail({ subject, preheader = "", heading, intro = "", rows = [], actions = [], notes = [], image = null, reason }) {
  for (const action of actions) assertHttps(action.href);
  const cleanSubject = stripLineBreaks(subject);
  const e = escapeRecordText;

  const textLines = [heading, ""];
  if (intro) textLines.push(intro, "");
  for (const row of rows) textLines.push(`${row.label}: ${row.value}`);
  if (rows.length) textLines.push("");
  for (const action of actions) textLines.push(`${action.text}: ${action.href}`);
  if (actions.length) textLines.push("");
  if (image) textLines.push(`${image.alt}: see the attached image.`, "");
  for (const note of notes) textLines.push(note, "");
  textLines.push("--", reason, `Reply to this email or write to ${SUPPORT_ADDRESS}`, COMPANY_NAME);
  const text = textLines.join("\n");

  const cell = `padding:6px 0;font-size:15px;line-height:1.5;color:${TEXT_COLOUR};`;
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr><td style="${cell}color:${SECONDARY_COLOUR};width:40%;vertical-align:top;padding-right:12px;">${e(row.label)}</td><td style="${cell}word-break:break-word;">${e(row.value)}</td></tr>`,
    )
    .join("");
  const actionsHtml = actions
    .map(
      (action) =>
        `<p style="margin:16px 0 0 0;"><a href="${escapeRecordAttribute(action.href)}" style="display:inline-block;padding:10px 18px;background:#1d70b8;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;border-radius:4px;">${e(action.text)}</a></p>`,
    )
    .join("");
  const imageHtml = image
    ? `<p style="margin:16px 0 0 0;"><img src="cid:${escapeRecordAttribute(image.cid)}" alt="${escapeRecordAttribute(image.alt)}" width="200" height="200" style="display:block;width:200px;height:200px;"></p>`
    : "";
  const notesHtml = notes.map((note) => `<p style="margin:16px 0 0 0;font-size:15px;line-height:1.5;">${e(note)}</p>`).join("");

  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(cleanSubject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT_STACK};color:${TEXT_COLOUR};">` +
    `<div style="display:none;max-height:0;overflow:hidden;">${e(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">` +
    `<tr><td style="padding-bottom:16px;font-size:14px;font-weight:bold;color:${SECONDARY_COLOUR};">DIY Accounting Submit</td></tr>` +
    `<tr><td><h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${TEXT_COLOUR};">${e(heading)}</h1>` +
    (intro ? `<p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;">${e(intro)}</p>` : "") +
    (rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>` : "") +
    actionsHtml +
    imageHtml +
    notesHtml +
    `</td></tr>` +
    `<tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:${SECONDARY_COLOUR};">${e(reason)}<br>Reply to this email or write to ${SUPPORT_ADDRESS}<br>${COMPANY_NAME}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { subject: cleanSubject, text, html };
}

function bundleName(catalog, bundleId) {
  const bundle = catalog?.bundles?.find((b) => b.id === bundleId);
  return bundle?.name || bundleId || "your bundle";
}

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDate(value);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatDate(value)}, ${time} UTC`;
}

function formatPeriod(value) {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(String(value));
  return match ? `${formatDate(match[1])} to ${formatDate(match[2])}` : String(value);
}

const RECEIPT_FIELD_FORMATTERS = { processingDate: formatDateTime, periodId: formatPeriod };

function siteUrl(baseUrl, path = "") {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${path}`;
}

function receiptRows(receipt) {
  const rows = [];
  for (const [field, label] of RECEIPT_FIELDS) {
    const value = receipt?.[field];
    if (value !== undefined && value !== null && value !== "")
      rows.push({ label, value: (RECEIPT_FIELD_FORMATTERS[field] ?? String)(value) });
  }
  return rows;
}

function receiptNotes(receipt) {
  const isVat = !receipt?.kind && Boolean(receipt?.formBundleNumber) && Boolean(receipt?.processingDate);
  if (!isVat) return [];
  const indicator = Object.hasOwn(PAYMENT_INDICATORS, receipt.paymentIndicator) ? PAYMENT_INDICATORS[receipt.paymentIndicator] : "";
  const charge = receipt.chargeRefNumber ? `Quote charge reference ${receipt.chargeRefNumber} when you pay.` : "";
  return [[VAT_RECEIPT_EXPLANATION, indicator, charge].filter(Boolean).join(" ")];
}

/**
 * Build the message for a customer email.
 *
 * @param {Object} params
 * @param {string} params.kind
 * @param {Object} [params.data] - the request's data
 * @param {string} params.baseUrl - DIY_SUBMIT_BASE_URL
 * @param {Object} [params.catalog] - the product catalogue, for bundle names
 * @param {Object} [params.receipt] - the stored receipt, for submission-receipt
 * @returns {{subject: string, text: string, html: string, passQr: {code: string, url: string, physical: boolean}|null}}
 */
export function buildCustomerEmail({ kind, data = {}, baseUrl, catalog, receipt }) {
  const name = bundleName(catalog, data.bundleId);
  const reason = "You get this email because of an action on your DIY Accounting Submit account.";
  const home = siteUrl(baseUrl);

  switch (kind) {
    case "subscription-started":
      return {
        ...renderEmail({
          subject: `Your ${name} subscription`,
          preheader: `Your ${name} subscription is active.`,
          heading: `Your ${name} subscription is active`,
          intro: "Thank you for subscribing. You can use the bundle now.",
          rows: [
            { label: "Bundle", value: name },
            { label: "Renews on", value: formatDate(data.currentPeriodEnd) },
          ],
          actions: [
            { href: home, text: "Open the site" },
            { href: siteUrl(baseUrl, "bundles.html"), text: "Manage billing" },
          ],
          reason,
        }),
        passQr: null,
      };
    case "submission-receipt": {
      const title = RECEIPT_KIND_TITLES[data.receiptKind] || "Submission";
      return {
        ...renderEmail({
          subject: `Your receipt: ${title}`,
          preheader: `Your receipt for the ${title}.`,
          heading: `Your receipt: ${title}`,
          intro: "This is a copy of the receipt for your submission. The full copy is on the site.",
          rows: receiptRows(receipt),
          actions: [{ href: siteUrl(baseUrl, "hmrc/receipt/receipts.html"), text: "See your receipts" }],
          notes: receiptNotes(receipt),
          reason,
        }),
        passQr: null,
      };
    }
    case "pass-generated": {
      const passUrl = `${siteUrl(baseUrl, "bundles.html")}?pass=${encodeURIComponent(data.code)}`;
      const physical = data.passTypeId === PHYSICAL_PASS_TYPE_ID;
      return {
        ...renderEmail({
          subject: `Your pass: ${name}`,
          preheader: `Your pass for ${name}.`,
          heading: `Your pass: ${name}`,
          intro: "Open the link or scan the QR code to redeem the pass.",
          rows: [
            { label: "Pass code", value: data.code },
            { label: "Bundle", value: name },
            { label: "Valid until", value: data.validUntil ? formatDate(data.validUntil) : "No end date" },
            { label: "Uses", value: data.maxUses ? String(data.maxUses) : "Unlimited" },
          ],
          actions: [{ href: passUrl, text: "Open the pass link" }],
          image: { cid: PASS_QR_CONTENT_ID, alt: "QR code for your pass" },
          notes: physical
            ? ["The front and back of the pass are attached as files to print: the front shows the words, the back shows the QR code."]
            : [],
          reason,
        }),
        passQr: { code: data.code, url: passUrl, physical },
      };
    }
    case "pass-redeemed":
      return {
        ...renderEmail({
          subject: `Your ${name} is ready`,
          preheader: `Your ${name} is ready to use.`,
          heading: `Your ${name} is ready`,
          intro: "You redeemed your pass. You can use the bundle now.",
          rows: [
            { label: "Bundle", value: name },
            { label: "Ends on", value: formatDate(data.expiry) },
          ],
          actions: [{ href: home, text: "Open the site" }],
          reason,
        }),
        passQr: null,
      };
    default:
      throw new Error("UnknownEmailKind");
  }
}

/**
 * The SES attachments of a pass email: the inline QR code, and for a physical pass the front and
 * back faces to print, with the file names the generate page downloads.
 *
 * @param {{code: string, url: string, physical: boolean}} passQr - from buildCustomerEmail
 * @returns {Promise<Object[]>}
 */
export async function buildPassAttachments({ code, url, physical }) {
  const attachment = (FileName, content, ContentType, extra = {}) => ({
    FileName,
    RawContent: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
    ContentType,
    ContentTransferEncoding: "BASE64",
    ...extra,
  });
  const attachments = [
    attachment(`pass-${code}-qr.png`, await generatePassQrCodeBuffer({ code, url }), "image/png", {
      ContentDisposition: "INLINE",
      ContentId: PASS_QR_CONTENT_ID,
    }),
  ];
  if (physical) {
    const qrSvg = await generatePassQrCodeSvgString({ code, url });
    const backPng = await generatePassQrCodeBuffer({ code, url, options: { width: 600, margin: 2, errorCorrectionLevel: "H" } });
    attachments.push(
      attachment(`pass-${code}-front.svg`, generateFrontSvg(code.split("-")), "image/svg+xml", { ContentDisposition: "ATTACHMENT" }),
      attachment(`pass-${code}-back.svg`, generateBackSvg(qrSvg, code), "image/svg+xml", { ContentDisposition: "ATTACHMENT" }),
      attachment(`pass-${code}-back.png`, backPng, "image/png", { ContentDisposition: "ATTACHMENT" }),
    );
  }
  return attachments;
}

/**
 * Build the short notice that goes to the operator after a subscription or a redemption.
 *
 * @param {Object} params
 * @param {"subscription-started"|"pass-redeemed"} params.kind
 * @param {Object} [params.data]
 * @param {string} params.address - the customer address, masked in the message
 * @param {string} params.environmentName
 * @param {Object} [params.catalog]
 * @returns {{subject: string, text: string, html: string}}
 */
export function buildOperatorCopy({ kind, data = {}, address, environmentName, catalog }) {
  const name = bundleName(catalog, data.bundleId);
  const subscribed = kind === "subscription-started";
  const subject = subscribed ? `Subscribed: ${name}` : `Pass redeemed: ${name}`;
  return renderEmail({
    subject,
    preheader: subject,
    heading: subject,
    rows: [
      { label: "Bundle", value: name },
      { label: "Environment", value: environmentName },
      { label: "Customer", value: maskEmail(address) },
    ],
    reason: "You get this notice as an operator of DIY Accounting Submit.",
  });
}
