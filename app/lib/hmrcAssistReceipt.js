// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hmrcAssistReceipt.js

import { createLogger } from "./logger.js";
import { acknowledgeStoredReceipt } from "../data/dynamoDbReceiptRepository.js";

const logger = createLogger({ source: "app/lib/hmrcAssistReceipt.js" });

/**
 * Stamp the stored Assist report receipt with the time HMRC accepted the acknowledgement. The
 * receipt keeps the actor, client and ttl it was filed with.
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - The receipt the report request returned
 * @param {"en"|"cy"} [presentedLanguage] - The language of the messages on screen when they were first displayed
 */
export async function acknowledgeReceipt(userSub, receiptId, presentedLanguage) {
  const acknowledged = await acknowledgeStoredReceipt(userSub, receiptId, { acknowledgedAt: new Date().toISOString(), presentedLanguage });
  if (!acknowledged) {
    logger.warn({ message: "Assist report receipt not found to acknowledge", receiptId });
  }
}
