// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-28 Store a filed receipt and email a copy
// - **Use when:** a handler records the receipt of a filing that HMRC or Companies House accepted.
// - **Does:** recordFiledReceipt stores the receipt with putReceipt, then asks for a submission-receipt email. A failed email request never fails the filing. A new filing handler calls it in place of putReceipt; a source scan test fails on any other importer of putReceipt.
// - **Run:** `import { recordFiledReceipt } from "app/services/filedReceipt.js"`
// - **Entry:** `app/services/filedReceipt.js:recordFiledReceipt`
// - **Files:** app/services/filedReceipt.js, app/unit-tests/services/filedReceipt.test.js, app/unit-tests/putReceiptImporters.test.js
// - **Keywords:** receipt, filed receipt, receipt email, putReceipt, submission receipt
// - **Related:** SITE-27
// @end-capability

// app/services/filedReceipt.js

import { putReceipt } from "../data/dynamoDbReceiptRepository.js";
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
 */
export async function recordFiledReceipt({ userSub, receiptId, receipt, actor, clientId, receiptKind, synthetic }) {
  await putReceipt(userSub, receiptId, receipt, actor, clientId);
  await requestCustomerEmail({ kind: "submission-receipt", userSub, synthetic, data: { receiptId, receiptKind, clientId } });
}
