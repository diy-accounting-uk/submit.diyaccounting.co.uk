// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-29 Render the customer emails to files for a visual check
// - **Use when:** a customer email template changed and a person or a browser test must see each message as a reader does.
// - **Does:** render-customer-emails.mjs builds each email kind from fixed fixtures (physical pass, digital pass, VAT receipt, ITSA receipt, subscription, notice digest) with the production template code and writes the HTML and text parts to target/customer-emails/. A pass email writes its QR PNG beside the HTML and points the image at that file, because a cid: image does not load from disk. A physical pass also writes the three print files.
// - **Run:** `node scripts/render-customer-emails.mjs`; `npx playwright test --project=browser-tests web/browser-tests/customerEmail.browser.test.js`
// - **Entry:** `scripts/render-customer-emails.mjs:renderCustomerEmails`
// - **Files:** scripts/render-customer-emails.mjs, web/browser-tests/customerEmail.browser.test.js, app/lib/customerEmailTemplates.js
// - **Keywords:** customer email, render, fixtures, screenshot, visual check, pass email, receipt email
// - **Related:** SITE-27
// @end-capability

// Usage: node scripts/render-customer-emails.mjs [output-directory]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCustomerEmail, buildPassAttachments, PASS_QR_CONTENT_ID } from "../app/lib/customerEmailTemplates.js";
import { parseCatalog } from "../app/services/productCatalog.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUTPUT = join(ROOT, "target", "customer-emails");

const BASE_URL = "https://submit.diyaccounting.co.uk/";
const CATALOG = parseCatalog(readFileSync(join(ROOT, "web/public/submit.catalogue.toml"), "utf-8"));

/** The cases: a name, the kind, the request data, and the stored receipt where the kind reads one. */
export const CASES = [
  {
    name: "physical-pass",
    kind: "pass-generated",
    data: {
      code: "tiger-happy-mountain-silver",
      passTypeId: "physical-pass",
      bundleId: "day-guest",
      validUntil: "2026-12-31T00:00:00.000Z",
      maxUses: 1,
    },
  },
  {
    name: "digital-pass",
    kind: "pass-generated",
    data: { code: "river-quiet-amber-cloud", passTypeId: "digital-pass", bundleId: "day-guest", validUntil: null, maxUses: null },
  },
  {
    name: "vat-receipt",
    kind: "submission-receipt",
    data: { receiptId: "fixture", receiptKind: "vat-return" },
    receipt: {
      formBundleNumber: "123456789012",
      processingDate: "2026-11-05T09:30:00.000Z",
      paymentIndicator: "DD",
      chargeRefNumber: "XM002610011594",
    },
  },
  {
    name: "itsa-receipt",
    kind: "submission-receipt",
    data: { receiptId: "fixture", receiptKind: "itsa-period-self-employment" },
    receipt: {
      kind: "itsa-period-self-employment",
      correlationId: "c1f2d3e4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      periodId: "2026-04-06_2026-07-05",
      taxYear: "2026-27",
      statusCode: "accepted",
    },
  },
  {
    name: "subscription",
    kind: "subscription-started",
    data: { bundleId: "resident-vat", currentPeriodEnd: "2026-12-05T00:00:00.000Z" },
  },
  {
    name: "notice-digest",
    kind: "notice-digest",
    data: { count: 3, nearestDeadline: "2026-11-12" },
  },
];

/**
 * Write each case to outputDirectory as <name>.html and <name>.txt. A pass case also writes its
 * attachments there, and its HTML points the QR image at the written PNG instead of cid:.
 * @param {string} [outputDirectory]
 * @returns {Promise<{name: string, subject: string, htmlFile: string, hasQr: boolean}[]>}
 */
export async function renderCustomerEmails(outputDirectory = DEFAULT_OUTPUT) {
  mkdirSync(outputDirectory, { recursive: true });
  const written = [];
  for (const { name, kind, data, receipt } of CASES) {
    const message = buildCustomerEmail({ kind, data, baseUrl: BASE_URL, catalog: CATALOG, receipt });
    let html = message.html;
    if (message.passQr) {
      const attachments = await buildPassAttachments(message.passQr);
      for (const attachment of attachments) {
        const fileName = `${name}-${attachment.FileName}`;
        writeFileSync(join(outputDirectory, fileName), attachment.RawContent);
        if (attachment.ContentId === PASS_QR_CONTENT_ID) html = html.replace(`cid:${PASS_QR_CONTENT_ID}`, fileName);
      }
    }
    const htmlFile = `${name}.html`;
    writeFileSync(join(outputDirectory, htmlFile), html);
    writeFileSync(join(outputDirectory, `${name}.txt`), `Subject: ${message.subject}\n\n${message.text}\n`);
    written.push({ name, subject: message.subject, htmlFile, hasQr: Boolean(message.passQr) });
  }
  return written;
}

async function main() {
  const outputDirectory = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT;
  const written = await renderCustomerEmails(outputDirectory);
  for (const { htmlFile } of written) console.log(`Wrote ${join(outputDirectory, htmlFile)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
