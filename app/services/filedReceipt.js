// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-28 Store a filed receipt and email a copy
// - **Use when:** a handler records the receipt of a filing that HMRC or Companies House accepted.
// - **Does:** recordFiledReceipt stores the receipt with putReceipt, then asks for a submission-receipt email. A failed email request never fails the filing. recordFiledReceiptForSubmission does the same for a submission a status poll may record more than once: it reuses the submission's stored receipt and marks the email on the receipt, so the email is asked for once and a stopped record's retry completes it. A new filing handler calls it in place of putReceipt; a source scan test fails on any other importer of putReceipt.
// - **Run:** `import { recordFiledReceipt } from "app/services/filedReceipt.js"`
// - **Entry:** `app/services/filedReceipt.js:recordFiledReceipt`
// - **Files:** app/services/filedReceipt.js, app/unit-tests/services/filedReceipt.test.js, app/unit-tests/putReceiptImporters.test.js
// - **Keywords:** receipt, filed receipt, receipt email, putReceipt, submission receipt
// - **Related:** SITE-27
// @end-capability

// app/services/filedReceipt.js

import { putReceipt, putReceiptIfNew, findReceiptForSubmission, markReceiptStepDone } from "../data/dynamoDbReceiptRepository.js";
import { requestCustomerEmail } from "../lib/customerEmailRequest.js";

/**
 * Store the receipt of a filing, then ask for a copy by email. The receipt write fails the caller
 * as putReceipt does. The email request never throws, so it never fails a filing.
 *
 * @param {Object} params
 * @param {string} params.userSub
 * @param {string} params.receiptId
 * @param {Object} params.receipt
 * @param {string} params.actor
 * @param {string} [params.clientId]
 * @param {string} params.receiptKind - e.g. "vat-return", "itsa-final-declaration", "ct-return"
 * @param {boolean} params.synthetic - True when a test or sandbox flow caused the filing
 * @param {"en"|"cy"} [params.language] - "cy" when the reader filed with the Welsh choice: the email is in Welsh
 */
export async function recordFiledReceipt({ userSub, receiptId, receipt, actor, clientId, receiptKind, synthetic, language }) {
  await putReceipt(userSub, receiptId, receipt, actor, clientId);
  await requestReceiptEmail({ userSub, receiptId, clientId, receiptKind, synthetic, language });
}

/**
 * Store the receipt of one submission that a status poll may record more than once, and ask for
 * its email once. A receipt of the submission already stored (under this receipt id form or an
 * earlier one dated by its record time) is reused as it is. The email is asked for unless the
 * receipt shows it asked for, then the receipt records it, so a record stopped between the two is
 * completed by its retry. A receipt in the earlier id form was emailed when it was stored.
 *
 * @param {Object} params
 * @param {string} params.userSub
 * @param {string} params.submissionNumber
 * @param {string} params.sentAt - ISO time the submission was sent; the new receipt id starts with it
 * @param {Object} params.receipt
 * @param {string} params.actor
 * @param {string} [params.clientId]
 * @param {string} params.receiptKind
 * @param {boolean} params.synthetic
 * @param {"en"|"cy"} [params.language]
 * @returns {Promise<{receiptId: string, hashedSub: string, tokenChargedAt?: string}>}
 */
export async function recordFiledReceiptForSubmission({
  userSub,
  submissionNumber,
  sentAt,
  receipt,
  actor,
  clientId,
  receiptKind,
  synthetic,
  language,
}) {
  const receiptId = `${sentAt}-${submissionNumber}`;
  let stored = await findReceiptForSubmission(userSub, submissionNumber, sentAt);
  if (!stored) {
    const hashedSub = await putReceiptIfNew(userSub, receiptId, receipt, actor, clientId);
    stored = hashedSub ? { receiptId, hashedSub } : await findReceiptForSubmission(userSub, submissionNumber, sentAt);
    if (!stored) throw new Error(`Receipt of submission ${submissionNumber} is neither new nor found`);
  }
  if (!stored.emailRequestedAt) {
    if (stored.receiptId === receiptId) {
      await requestReceiptEmail({ userSub, receiptId, clientId, receiptKind, synthetic, language });
    }
    await markReceiptStepDone(stored.hashedSub, stored.receiptId, "emailRequestedAt");
  }
  return stored;
}

async function requestReceiptEmail({ userSub, receiptId, clientId, receiptKind, synthetic, language }) {
  const data = { receiptId, receiptKind, clientId, ...(language === "cy" ? { language } : {}) };
  await requestCustomerEmail({ kind: "submission-receipt", userSub, synthetic, data });
}
