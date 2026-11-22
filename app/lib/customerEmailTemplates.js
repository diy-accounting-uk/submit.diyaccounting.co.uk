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
const FONT_STACK = "Arial,Helvetica,sans-serif";

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

// The receipt email in Welsh, for a filing made with the Welsh language choice. Terms follow HMRC's
// and Companies House's Welsh pages (CThEF, Tŷ'r Cwmnïau, datganiad cadarnhau).
const WELSH_RECEIPT_KIND_TITLES = {
  "vat-return": "Ffurflen TAW",
  "itsa-period-self-employment": "Diweddariad hunangyflogaeth",
  "itsa-period-uk-property": "Diweddariad eiddo yn y DU",
  "itsa-period-foreign-property": "Diweddariad eiddo tramor",
  "itsa-annual-self-employment": "Crynodeb blynyddol hunangyflogaeth",
  "itsa-annual-uk-property": "Crynodeb blynyddol eiddo yn y DU",
  "itsa-annual-foreign-property": "Crynodeb blynyddol eiddo tramor",
  "itsa-losses-and-claims": "Colledion a hawliadau",
  "itsa-tax-liability-adjustments": "Addasiadau i’r rhwymedigaeth dreth",
  "itsa-final-declaration": "Datganiad terfynol",
  "ct-return": "Ffurflen Dreth Gorfforaeth",
  "accounts": "Cyfrifon blynyddol",
  "confirmation-statement": "Datganiad cadarnhau",
  "psc-verification-statement": "Datganiad gwirio PRhA",
};

const WELSH_RECEIPT_FIELD_LABELS = {
  formBundleNumber: "Rhif bwndel y ffurflen (Form bundle number)",
  processingDate: "Dyddiad prosesu",
  paymentIndicator: "Dangosydd talu",
  chargeRefNumber: "Cyfeirnod y tâl",
  submissionNumber: "Rhif cyflwyno",
  correlationId: "ID cydberthynas",
  irmark: "IRmark",
  calculationId: "ID cyfrifiad",
  periodId: "Cyfnod",
  taxYear: "Blwyddyn dreth",
  statusCode: "Statws",
};

// The explanation under a VAT receipt in Welsh, in HMRC's Welsh terms; HMRC's data stays as returned.
const WELSH_VAT_RECEIPT_EXPLANATION =
  "Mae CThEF yn rhoi’r dderbynneb hon pan fydd yn derbyn Ffurflen TAW. Rhif bwndel y ffurflen yw cyfeirnod CThEF ar gyfer eich Ffurflen TAW. Cadwch ef: bydd CThEF yn gofyn amdano os byddwch yn holi am y Ffurflen.";
const WELSH_PAYMENT_INDICATORS = { DD: "Ystyr DD yw Debyd Uniongyrchol.", BANK: "Ystyr BANK yw taliad drwy’ch banc." };

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
 * @param {{heading: string, paragraphs: string[]}} [model.section] - a sub-heading and its paragraphs, before the rows
 * @param {{label: string, value: string}[]} [model.rows]
 * @param {{href: string, text: string}[]} [model.actions]
 * @param {string[]} [model.notes]
 * @param {{cid: string, alt: string}} [model.image] - an inline image attached under this content id
 * @param {string} model.reason - why the person gets this email
 * @param {"en"|"cy"} [model.language] - the language of the fixed footer and the html lang
 * @returns {{subject: string, text: string, html: string}}
 */
export function renderEmail({
  subject,
  preheader = "",
  heading,
  intro = "",
  section = null,
  rows = [],
  actions = [],
  notes = [],
  image = null,
  reason,
  language = "en",
}) {
  const welsh = language === "cy";
  const replyLine = welsh
    ? `Atebwch yr e-bost hwn neu ysgrifennwch at ${SUPPORT_ADDRESS}`
    : `Reply to this email or write to ${SUPPORT_ADDRESS}`;
  for (const action of actions) assertHttps(action.href);
  const cleanSubject = stripLineBreaks(subject);
  const e = escapeRecordText;

  const textLines = [heading, ""];
  if (intro) textLines.push(intro, "");
  if (section) textLines.push(section.heading, "", ...section.paragraphs.flatMap((paragraph) => [paragraph, ""]));
  for (const row of rows) textLines.push(`${row.label}: ${row.value}`);
  if (rows.length) textLines.push("");
  for (const action of actions) textLines.push(`${action.text}: ${action.href}`);
  if (actions.length) textLines.push("");
  if (image) textLines.push(`${image.alt}: ${welsh ? "gweler y ddelwedd sydd ynghlwm." : "see the attached image."}`, "");
  for (const note of notes) textLines.push(note, "");
  textLines.push("--", reason, replyLine, COMPANY_NAME);
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
  const sectionHtml = section
    ? `<h2 style="margin:24px 0 8px 0;font-size:18px;line-height:1.3;color:${TEXT_COLOUR};">${e(section.heading)}</h2>` +
      section.paragraphs.map((paragraph) => `<p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;">${e(paragraph)}</p>`).join("")
    : "";
  const notesHtml = notes.map((note) => `<p style="margin:16px 0 0 0;font-size:15px;line-height:1.5;">${e(note)}</p>`).join("");

  const html =
    `<!DOCTYPE html><html lang="${welsh ? "cy" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(cleanSubject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT_STACK};color:${TEXT_COLOUR};">` +
    `<div style="display:none;max-height:0;overflow:hidden;">${e(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">` +
    `<tr><td style="padding-bottom:16px;font-size:14px;font-weight:bold;color:${SECONDARY_COLOUR};">DIY Accounting Submit</td></tr>` +
    `<tr><td><h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${TEXT_COLOUR};">${e(heading)}</h1>` +
    (intro ? `<p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;">${e(intro)}</p>` : "") +
    sectionHtml +
    (rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>` : "") +
    actionsHtml +
    imageHtml +
    notesHtml +
    `</td></tr>` +
    `<tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:${SECONDARY_COLOUR};">${e(reason)}<br>${e(replyLine)}<br>${COMPANY_NAME}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { subject: cleanSubject, text, html };
}

function bundleName(catalog, bundleId) {
  const bundle = catalog?.bundles?.find((b) => b.id === bundleId);
  return bundle?.name || bundleId || "your bundle";
}

function formatDate(value, locale = "en-GB") {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(value, locale = "en-GB") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDate(value, locale);
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatDate(value, locale)}, ${time} UTC`;
}

function formatPeriod(value, locale = "en-GB") {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(String(value));
  if (!match) return String(value);
  const join = locale === "cy-GB" ? "i" : "to";
  return `${formatDate(match[1], locale)} ${join} ${formatDate(match[2], locale)}`;
}

const RECEIPT_FIELD_FORMATTERS = { processingDate: formatDateTime, periodId: formatPeriod };

// "1 year", "6 months", "1 year 6 months" or "7 days" from an ISO 8601 duration of years, months
// and days, worded as the pass card words it; null for any other form.
function durationWords(isoDuration, welsh) {
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(isoDuration || "");
  if (!match || !(match[1] || match[2] || match[3])) return null;
  const [years, months, days] = [match[1], match[2], match[3]].map((value) => (value ? Number(value) : 0));
  const parts = welsh
    ? [years && (years === 1 ? "1 flwyddyn" : `${years} blynedd`), months && `${months} mis`, days && `${days} diwrnod`]
    : [
        years && `${years} year${years === 1 ? "" : "s"}`,
        months && `${months} month${months === 1 ? "" : "s"}`,
        days && `${days} day${days === 1 ? "" : "s"}`,
      ];
  return parts.filter(Boolean).join(" ");
}

// What one bundle of a pass gives, in a sentence: its summary, its tokens and how long it lasts from redemption.
function passBundleSentence({ name, summary, tokensGranted, timeout }, welsh) {
  const lasts = durationWords(timeout, welsh);
  if (welsh) {
    const parts = [summary ? `Mae’n rhoi ${name}: gallwch ${summary}.` : `Mae’n rhoi ${name}.`];
    if (tokensGranted === "unlimited") parts.push("Nid oes terfyn ar gredydau (tokens).");
    else if (typeof tokensGranted === "number") parts.push(`Mae’n dod gyda ${tokensGranted} credyd (tokens).`);
    parts.push(lasts ? `Mae’n para ${lasts} o’r adeg y byddwch yn ei ddefnyddio.` : "Nid oes ganddo ddyddiad gorffen.");
    return parts.join(" ");
  }
  const parts = [summary ? `It gives the ${name}: you can ${summary}.` : `It gives the ${name}.`];
  if (tokensGranted === "unlimited") parts.push("There is no limit on tokens.");
  else if (typeof tokensGranted === "number") parts.push(`It comes with ${tokensGranted} token${tokensGranted === 1 ? "" : "s"}.`);
  parts.push(lasts ? `It lasts ${lasts} from when you redeem it.` : "It has no end date.");
  return parts.join(" ");
}

/**
 * The part of a pass email for the person the pass is given to, so it reads correctly when the
 * email is forwarded: what the pass gives, how to redeem it, its code, the date by which to redeem
 * it and the uses left.
 *
 * @param {Object} terms
 * @param {{name: string, summary?: string, tokensGranted?: number|string, timeout?: string}[]} terms.bundles
 * @param {string} terms.code
 * @param {string|null} terms.validUntil - the date by which the pass must be redeemed
 * @param {number|null} terms.usesLeft
 * @param {"en"|"cy"} [language]
 * @returns {{section: {heading: string, paragraphs: string[]}, rows: {label: string, value: string}[], action: string, imageAlt: string}}
 */
export function passRecipientSection({ bundles, code, validUntil, usesLeft }, language = "en") {
  const welsh = language === "cy";
  const locale = welsh ? "cy-GB" : "en-GB";
  const gives = bundles.map((bundle) => passBundleSentence(bundle, welsh));
  if (welsh) {
    return {
      section: {
        heading: "I’r person sy’n cael y tocyn hwn",
        paragraphs: [
          ...gives,
          "I’w ddefnyddio, agorwch y ddolen neu sganiwch y cod QR, yna mewngofnodwch gyda chyfrif Google neu Microsoft.",
        ],
      },
      rows: [
        { label: "Cod y tocyn", value: code },
        { label: "Defnyddiwch ef erbyn", value: validUntil ? formatDate(validUntil, locale) : "Dim dyddiad gorffen" },
        { label: "Defnyddiau ar ôl", value: usesLeft === null || usesLeft === undefined ? "Dim terfyn" : String(usesLeft) },
      ],
      action: "Agor dolen y tocyn",
      imageAlt: "Cod QR y tocyn",
    };
  }
  return {
    section: {
      heading: "For the person who gets this pass",
      paragraphs: [...gives, "To redeem it, open the link or scan the QR code, then sign in with a Google or Microsoft account."],
    },
    rows: [
      { label: "Pass code", value: code },
      { label: "Redeem by", value: validUntil ? formatDate(validUntil, locale) : "No end date" },
      { label: "Uses left", value: usesLeft === null || usesLeft === undefined ? "Unlimited" : String(usesLeft) },
    ],
    action: "Open the pass link",
    imageAlt: "QR code for the pass",
  };
}

// The top of a pass email, for the person who generated the pass.
function passIssuerIntro({ generatedBy, restrictedTo }, welsh) {
  if (welsh) {
    const parts = [
      "Gwnaethoch greu’r tocyn hwn i’w roi i rywun arall. Anfonwch yr e-bost hwn ymlaen, neu anfonwch y ddolen neu’r cod QR atynt.",
    ];
    if (generatedBy === "user") parts.push("Ni allwch ei ddefnyddio eich hun.");
    if (restrictedTo) parts.push(`Dim ond ${restrictedTo} all ei ddefnyddio.`);
    return parts.join(" ");
  }
  const parts = ["You generated this pass to give to someone else. Forward this email, or send them the link or the QR code."];
  if (generatedBy === "user") parts.push("You cannot redeem it yourself.");
  if (restrictedTo) parts.push(`Only ${restrictedTo} can redeem it.`);
  return parts.join(" ");
}

function siteUrl(baseUrl, path = "") {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${path}`;
}

function receiptRows(receipt, language = "en") {
  const welsh = language === "cy";
  const locale = welsh ? "cy-GB" : "en-GB";
  const rows = [];
  for (const [field, label] of RECEIPT_FIELDS) {
    const value = receipt?.[field];
    const format = RECEIPT_FIELD_FORMATTERS[field];
    if (value !== undefined && value !== null && value !== "")
      rows.push({ label: welsh ? WELSH_RECEIPT_FIELD_LABELS[field] : label, value: format ? format(value, locale) : String(value) });
  }
  return rows;
}

function chargeSentence(reference, welsh) {
  if (!reference) return "";
  if (welsh) return `Dyfynnwch gyfeirnod y tâl ${reference} pan fyddwch yn talu.`;
  return `Quote charge reference ${reference} when you pay.`;
}

function receiptNotes(receipt, language = "en") {
  const isVat = !receipt?.kind && Boolean(receipt?.formBundleNumber) && Boolean(receipt?.processingDate);
  if (!isVat) return [];
  const welsh = language === "cy";
  const indicators = welsh ? WELSH_PAYMENT_INDICATORS : PAYMENT_INDICATORS;
  const indicator = Object.hasOwn(indicators, receipt.paymentIndicator) ? indicators[receipt.paymentIndicator] : "";
  const charge = chargeSentence(receipt.chargeRefNumber, welsh);
  return [[welsh ? WELSH_VAT_RECEIPT_EXPLANATION : VAT_RECEIPT_EXPLANATION, indicator, charge].filter(Boolean).join(" ")];
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
      if (data.language === "cy") {
        const welshTitle = WELSH_RECEIPT_KIND_TITLES[data.receiptKind] || "Cyflwyniad";
        return {
          ...renderEmail({
            subject: `Eich derbynneb: ${welshTitle}`,
            preheader: `Eich derbynneb ar gyfer: ${welshTitle}.`,
            heading: `Eich derbynneb: ${welshTitle}`,
            intro: "Dyma gopi o’r dderbynneb ar gyfer eich cyflwyniad. Mae’r copi llawn ar y wefan.",
            rows: receiptRows(receipt, "cy"),
            actions: [{ href: siteUrl(baseUrl, "cy/hmrc/receipt/receipts.html"), text: "Gweld eich derbynebau" }],
            notes: receiptNotes(receipt, "cy"),
            reason: "Rydych yn cael yr e-bost hwn oherwydd gweithred ar eich cyfrif DIY Accounting Submit.",
            language: "cy",
          }),
          passQr: null,
        };
      }
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
      const passUrl = `${siteUrl(baseUrl, "pass.html")}?pass=${encodeURIComponent(data.code)}`;
      const physical = data.passTypeId === PHYSICAL_PASS_TYPE_ID;
      const welsh = data.language === "cy";
      // A campaign pass names each bundle it grants, with the duration and tokens it sets; any other
      // pass names its one bundle with the catalogue's terms.
      const terms = (data.grants ?? [{ bundleId: data.bundleId, summary: data.passSummary }]).map((grant) => {
        const bundle = catalog?.bundles?.find((b) => b.id === grant.bundleId);
        return {
          name: bundleName(catalog, grant.bundleId),
          summary: grant.summary,
          tokensGranted: grant.tokens ?? bundle?.tokensGranted,
          timeout: grant.duration ?? bundle?.timeout,
        };
      });
      const recipient = passRecipientSection(
        {
          bundles: terms,
          code: data.code,
          validUntil: data.validUntil,
          usesLeft: data.usesLeft,
        },
        welsh ? "cy" : "en",
      );
      const printNote = welsh
        ? "Mae blaen a chefn y tocyn wedi’u hatodi fel ffeiliau i’w hargraffu: mae’r blaen yn dangos y geiriau, mae’r cefn yn dangos y cod QR."
        : "The front and back of the pass are attached as files to print: the front shows the words, the back shows the QR code.";
      const subject = welsh ? `Tocyn i’w rannu: ${name}` : `A pass to share: ${name}`;
      return {
        ...renderEmail({
          subject,
          preheader: welsh ? `Tocyn ar gyfer ${name} i’w roi i rywun arall.` : `A pass for the ${name} to give to someone else.`,
          heading: subject,
          intro: passIssuerIntro(data, welsh),
          section: recipient.section,
          rows: recipient.rows,
          actions: [{ href: passUrl, text: recipient.action }],
          image: { cid: PASS_QR_CONTENT_ID, alt: recipient.imageAlt },
          notes: physical ? [printNote] : [],
          reason: welsh
            ? "Aeth yr e-bost hwn at y person a greodd y tocyn ar DIY Accounting Submit."
            : "This email went to the person who generated the pass on DIY Accounting Submit.",
          language: welsh ? "cy" : "en",
        }),
        passQr: { code: data.code, url: passUrl, physical },
      };
    }
    case "pass-redeemed": {
      // Each bundle the pass granted, with its own end date.
      const granted = data.bundles ?? [{ bundleId: data.bundleId, expiry: data.expiry }];
      const several = granted.length > 1;
      return {
        ...renderEmail({
          subject: `Your ${name} is ready`,
          preheader: `Your ${name} is ready to use.`,
          heading: `Your ${name} is ready`,
          intro: several ? "You redeemed your pass. You can use the bundles now." : "You redeemed your pass. You can use the bundle now.",
          rows: granted.flatMap((grant) => [
            { label: "Bundle", value: bundleName(catalog, grant.bundleId) },
            { label: "Ends on", value: grant.expiry ? formatDate(grant.expiry) : "No end date" },
          ]),
          actions: [{ href: home, text: "Open the site" }],
          reason,
        }),
        passQr: null,
      };
    }
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
