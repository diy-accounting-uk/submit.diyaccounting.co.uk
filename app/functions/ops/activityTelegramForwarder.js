// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/ops/activityTelegramForwarder.js
//
// EventBridge target Lambda: receives ActivityEvent events and forwards them
// to the appropriate Telegram group via the Telegram Bot API.
//
// Routing: EventBridge rules determine which group(s) receive each event.
// The target chat ID is passed via the rule's input transformer or the
// TELEGRAM_CHAT_ID environment variable set per-rule invocation.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../../lib/logger.js";
import { resolveAlarmEnv } from "../../lib/alarmName.js";

const logger = createLogger({ source: "app/functions/ops/activityTelegramForwarder.js" });

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedBotToken = null;

async function resolveBotToken() {
  if (cachedBotToken) return cachedBotToken;

  if (process.env.TELEGRAM_BOT_TOKEN) {
    cachedBotToken = process.env.TELEGRAM_BOT_TOKEN;
    return cachedBotToken;
  }

  const arn = process.env.TELEGRAM_BOT_TOKEN_ARN;
  if (!arn) throw new Error("Neither TELEGRAM_BOT_TOKEN nor TELEGRAM_BOT_TOKEN_ARN is set");

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  cachedBotToken = result.SecretString;
  return cachedBotToken;
}

/**
 * Read Telegram chat IDs from individual env vars.
 * Returns { test, live, ops } where each is a chat ID string or empty.
 */
export function resolveChatConfig() {
  return {
    test: process.env.TELEGRAM_TEST_CHAT_ID || "",
    live: process.env.TELEGRAM_LIVE_CHAT_ID || "",
    ops: process.env.TELEGRAM_OPS_CHAT_ID || "",
  };
}

/**
 * Escape special characters for Telegram MarkdownV1.
 * Only escapes in dynamic content, not in our own formatting.
 */
export function escapeTelegramMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*`[])/g, "\\$1");
}

/**
 * Format an ActivityEvent into a Telegram message.
 */
export function formatMessage(detail) {
  const site = escapeTelegramMarkdown(detail.site || "unknown");
  const env = escapeTelegramMarkdown(detail.env || process.env.ENVIRONMENT_NAME || "unknown");
  const summary = escapeTelegramMarkdown(detail.summary || detail.event || "unknown event");
  return `*[${site}/${env}]* ${summary}`;
}

/**
 * Determine which chat IDs to send to based on event attributes.
 * @param {Object} detail - Event detail with actor, flow fields
 * @param {Object} chatConfig - { test, live, ops } chat IDs
 * @returns {string[]} Array of target chat IDs
 */
export function resolveTargetChatIds(detail, chatConfig) {
  const actor = detail.actor || "";
  const flow = detail.flow || "";
  const requestId = detail.requestId || "";

  // Test-prefixed requestId always routes to test channel
  if (requestId.startsWith("test_")) {
    return chatConfig.test ? [chatConfig.test] : [];
  }

  // Infrastructure and operational events → ops channel
  if (flow === "infrastructure" || flow === "operational") {
    return chatConfig.ops ? [chatConfig.ops] : [];
  }

  // User-journey events → live or test based on actor.
  // `customer` is the live default (publishActivityEvent fills it in for non-test_
  // requestIds when no explicit actor is set), so anonymous customer journeys reach
  // the LIVE telegram channel instead of silently being misrouted to TEST.
  if (actor === "customer" || actor === "visitor") {
    return chatConfig.live ? [chatConfig.live] : [];
  }

  // test-user, synthetic, ci-pipeline, system → test channel
  return chatConfig.test ? [chatConfig.test] : [];
}

/**
 * Send a message to a Telegram chat via the Bot API.
 */
export async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.warn({ message: "Telegram API error", statusCode: response.status, body, chatId });
  }

  return response;
}

/**
 * Synthesize an ActivityEvent detail from a CloudFormation Stack Status Change event.
 * Extracts stack name and status from the raw AWS event.
 */
export function synthesizeFromCloudFormation(event) {
  const cfnDetail = event.detail || {};
  const stackId = cfnDetail["stack-id"] || "";
  // Extract stack name from ARN: arn:aws:cloudformation:region:account:stack/STACK-NAME/uuid
  const stackName = stackId.includes("/") ? stackId.split("/")[1] : stackId;
  const status = cfnDetail["status-details"]?.status || "UNKNOWN";

  // Extract env from stack name prefix (e.g., "ci-app-ApiStack" → "ci")
  const env = resolveAlarmEnv(stackName, process.env.ENVIRONMENT_NAME || "unknown");

  return {
    actor: "ci-pipeline",
    flow: "infrastructure",
    env,
    event: "stack-status-change",
    site: "submit",
    summary: `Stack ${stackName}: ${status}`,
  };
}

/**
 * Synthesize an ActivityEvent detail from a CloudWatch Alarm State Change event.
 * Extracts alarm name and state transition from the raw AWS event.
 */
export function synthesizeFromCloudWatchAlarm(event) {
  const alarmDetail = event.detail || {};
  const alarmName = alarmDetail.alarmName || "unknown";
  const state = alarmDetail.state?.value || "UNKNOWN";
  const previousState = alarmDetail.previousState?.value || "UNKNOWN";

  // Extract env from alarm name prefix
  const env = resolveAlarmEnv(alarmName, process.env.ENVIRONMENT_NAME || "unknown");

  return {
    actor: "system",
    flow: "operational",
    env,
    event: "alarm-state-change",
    site: "submit",
    summary: `Alarm ${alarmName}: ${previousState} \u2192 ${state}`,
  };
}

/**
 * Resolve the event detail, handling both custom ActivityEvents and raw AWS service events.
 */
export function resolveEventDetail(event) {
  if (event.source === "aws.cloudformation") {
    return synthesizeFromCloudFormation(event);
  }
  if (event.source === "aws.cloudwatch") {
    return synthesizeFromCloudWatchAlarm(event);
  }
  return event.detail || {};
}

/**
 * EventBridge target handler.
 * Handles both custom ActivityEvent events (from custom bus) and
 * raw AWS service events (CloudFormation, CloudWatch from default bus).
 */
export async function handler(event) {
  const detail = resolveEventDetail(event);

  logger.info({
    message: "Processing activity event for Telegram",
    source: event.source,
    eventType: detail.event,
    actor: detail.actor,
    flow: detail.flow,
    env: detail.env,
  });

  const chatConfig = resolveChatConfig();
  const targets = resolveTargetChatIds(detail, chatConfig);
  const message = formatMessage(detail);

  if (targets.length === 0) {
    // Log with channel-specific prefix when no Telegram destination is configured
    const flow = detail.flow || "";
    const actor = detail.actor || "";
    const requestId = detail.requestId || "";
    let channel;
    if (requestId.startsWith("test_")) {
      channel = "TELEGRAM_TEST_CHAT";
    } else if (flow === "infrastructure" || flow === "operational") {
      channel = "TELEGRAM_OPS_CHAT";
    } else if (actor === "customer" || actor === "visitor") {
      channel = "TELEGRAM_LIVE_CHAT";
    } else {
      channel = "TELEGRAM_TEST_CHAT";
    }
    logger.info({ message: `[[${channel}]] ${message}`, detail });
    return;
  }

  const botToken = await resolveBotToken();

  const results = await Promise.allSettled(targets.map((chatId) => sendTelegramMessage(botToken, chatId, message)));

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn({ message: "Failed to send Telegram message", error: result.reason?.message });
    }
  }
}
