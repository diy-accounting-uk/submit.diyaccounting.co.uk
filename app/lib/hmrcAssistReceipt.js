// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hmrcAssistReceipt.js

import { createLogger } from "./logger.js";
import { getReceipt, putReceipt } from "../data/dynamoDbReceiptRepository.js";
import { resolveActorClass } from "./activityAlert.js";

const logger = createLogger({ source: "app/lib/hmrcAssistReceipt.js" });

/**
 * Stamp the stored Assist report receipt with the time HMRC accepted the acknowledgement:
 * read it and put it back with acknowledgedAt.
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - The receipt the report request returned
 */
export async function acknowledgeReceipt(userSub, receiptId) {
  const receipt = await getReceipt(userSub, receiptId);
  if (!receipt) {
    logger.warn({ message: "Assist report receipt not found to acknowledge", receiptId });
    return;
  }
  await putReceipt(userSub, receiptId, { ...receipt, acknowledgedAt: new Date().toISOString() }, resolveActorClass());
}
