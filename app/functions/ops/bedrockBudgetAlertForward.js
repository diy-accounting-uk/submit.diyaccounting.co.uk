// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/ops/bedrockBudgetAlertForward.js
//
// Subscribed directly to ObservabilityUE1Stack's bedrockBudgetAlertsTopic (the Bedrock daily
// budget's SNS subscriber). AWS Budgets notifications are plain SNS text, not an EventBridge
// event with a stable shape, and Budgets offers no other subscriber type, so this Lambda is the
// bridge: it turns each notification into an ActivityEvent on the shared activity bus, the same
// contract wafScanDetect.js uses for a WAF finding raised in this same us-east-1 region. From
// there the ActivityTelegramRule that already exists in every live deployment's OpsStack picks it
// up and forwards it to the ops Telegram chat, exactly like any other operational activity event.

import { publishActivityEvent } from "../../lib/activityAlert.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/ops/bedrockBudgetAlertForward.js" });

/**
 * Pull the subject and body out of one SNS record. Returns null when the record carries no
 * message, so a caller can filter with a plain truthiness check.
 *
 * @param {{Sns?: {Subject?: string, Message?: string}}} record
 * @returns {{subject: string, message: string}|null}
 */
export function parseBudgetSnsRecord(record) {
  const sns = record?.Sns;
  if (!sns?.Message) return null;
  return {
    subject: sns.Subject || "",
    message: sns.Message,
  };
}

/**
 * Build the one-line Telegram summary for a budget notification. Prefers the subject line AWS
 * Budgets sends ("AWS Budgets: <name> has exceeded your alert threshold"); falls back to the
 * first line of the message body when a notification carries no subject.
 *
 * @param {{subject: string, message: string}} parsed
 * @returns {string}
 */
export function summarizeBudgetAlert(parsed) {
  if (parsed.subject) return parsed.subject;
  return parsed.message.split("\n")[0].trim();
}

/**
 * SNS-subscribed handler: one ActivityEvent per notification record, carrying the full message
 * text as detail so the ops chat has the complete notification, not just the summary line.
 *
 * @param {{Records: {Sns?: {Subject?: string, Message?: string}}[]}} event
 * @returns {Promise<{published: number}>}
 */
export async function handler(event) {
  const records = (event.Records ?? []).map(parseBudgetSnsRecord).filter((record) => record !== null);

  for (const record of records) {
    await publishActivityEvent({
      event: "bedrock-budget-alert",
      flow: "operational",
      summary: summarizeBudgetAlert(record),
      detail: { message: record.message },
    });
  }

  logger.info({ message: "Bedrock budget alert forward run complete", published: records.length });

  return { published: records.length };
}
