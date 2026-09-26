// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbWafScanBurstRepository.js
//
// Repository for the {resourceNamePrefix}-waf-scan-bursts table (EdgeStack, us-east-1): one
// item per client IP. The IP's first hit opens a fixed window; every later hit inside that
// window only adds to its count. wafScanDetect.js publishes a Telegram message only when a
// window opens, so a scan whose requests land in separate CloudWatch Logs deliveries (the
// subscription filter can split a fast burst across a few deliveries a few seconds apart)
// still produces one message per real-world burst, not one per delivery.

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbWafScanBurstRepository.js" });

// A burst window: the client IP's first hit opens it, every hit up to WINDOW_SECONDS later
// belongs to the same burst. TTL_BUFFER_SECONDS keeps the item alive a little past the
// window's close, so no separate flush or scheduler is needed to clear it — DynamoDB's own TTL
// sweep does it.
export const WINDOW_SECONDS = 600;
const TTL_BUFFER_SECONDS = 60;

/**
 * Opens a burst window for a client IP on its first hit, or adds to the count of a window
 * already open. Returns whether this call is the one that opened the window, so the caller
 * publishes at most one message per burst regardless of how many CloudWatch Logs deliveries it
 * is split across.
 *
 * Two round trips only on the rarer path: the first call always tries the conditional open: it
 * both resets and returns the window in one call when it succeeds. Only a delivery that lands
 * inside a window someone else already opened pays for a second call, to add its hits without
 * resetting the window's start or TTL.
 *
 * No-op (always reports a new window, no DynamoDB call) when the table isn't configured, e.g.
 * the simulator or a local proxy run.
 *
 * @param {Object} params
 * @param {string} params.clientIp
 * @param {number} params.hitCount - hits to add: the number of blocked records this delivery saw for this IP
 * @param {number} [params.now] - epoch ms, defaults to Date.now()
 * @returns {Promise<{isNewBurst: boolean, hitCount: number}>}
 */
export async function openOrExtendBurstWindow({ clientIp, hitCount, now = Date.now() }) {
  const tableName = getResourceName("WAF_SCAN_BURST_DYNAMODB_TABLE_NAME");
  if (!tableName) return { isNewBurst: true, hitCount };

  const windowCutoff = now - WINDOW_SECONDS * 1000;
  const ttl = Math.floor(now / 1000) + WINDOW_SECONDS + TTL_BUFFER_SECONDS;

  try {
    const { Attributes } = await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { clientIp },
          UpdateExpression: "SET windowStart = :now, hitCount = :hitCount, #ttl = :ttl",
          ConditionExpression: "attribute_not_exists(clientIp) OR windowStart < :windowCutoff",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: {
            ":now": now,
            ":hitCount": hitCount,
            ":ttl": ttl,
            ":windowCutoff": windowCutoff,
          },
          ReturnValues: "ALL_NEW",
        }),
    );
    logger.info({ message: "WAF scan burst window opened", clientIp, hitCount: Attributes.hitCount });
    return { isNewBurst: true, hitCount: Attributes.hitCount };
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") throw error;
  }

  const { Attributes } = await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName,
        Key: { clientIp },
        UpdateExpression: "ADD hitCount :hitCount",
        ExpressionAttributeValues: { ":hitCount": hitCount },
        ReturnValues: "UPDATED_NEW",
      }),
  );
  logger.info({ message: "WAF scan burst window extended", clientIp, hitCount: Attributes.hitCount });
  return { isNewBurst: false, hitCount: Attributes.hitCount };
}
