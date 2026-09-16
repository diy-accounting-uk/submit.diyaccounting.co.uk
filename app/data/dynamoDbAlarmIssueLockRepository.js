// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbAlarmIssueLockRepository.js
//
// Repository for the {env}-env-alarm-issue-locks table: one item per CloudWatch alarm
// state-change transition (dedupeKey = "{alarmName}#{timestamp}"), written with a
// conditional put so two deployments that both received the same alarm transition (see
// alarmToGithubIssue.js's AlarmStateChangeRule comment) race on one write instead of each
// raising its own GitHub issue. Every item carries a short TTL; none of it is customer data.

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";

const LOCK_LIFETIME = { days: 3 };

/**
 * Claims one alarm state-change transition for this invocation.
 *
 * @param {Object} params
 * @param {string} params.alarmName
 * @param {string} params.timestamp - the alarm's state-change timestamp, exact to the
 *   millisecond, so two deliveries of the same transition share a key and a later, genuinely
 *   new transition of the same alarm claims a key of its own
 * @returns {Promise<boolean>} true when this invocation claimed the transition, false when
 *   another invocation (this deployment's or another deployment's) claimed it first
 */
export async function claimAlarmStateChange({ alarmName, timestamp }) {
  const tableName = getResourceName("ALARM_ISSUE_LOCK_DYNAMODB_TABLE_NAME", true);
  const dedupeKey = `${alarmName}#${timestamp}`;

  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: { dedupeKey, ttl: calculateTtl(new Date(), LOCK_LIFETIME).ttl },
          ConditionExpression: "attribute_not_exists(dedupeKey)",
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}
