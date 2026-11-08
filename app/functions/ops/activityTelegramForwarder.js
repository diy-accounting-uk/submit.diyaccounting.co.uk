// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-70 Forward operational activity events to Telegram
// - **Use when:** an EventBridge activity event needs routing to the ops or live Telegram group as formatted text, or the approved set changes.
// - **Does:** activityTelegramForwarder.js is the EventBridge target Lambda for operational activity events. It sends only the approved set: alarm state changes, cost alerts and failed or rolled-back stack changes to the ops chat; subscription, pass redemption, support ticket, VAT submission and any failure from real customers to the live chat. Everything else reaches the lake only. handler(event) posts it to the Telegram Bot API. It runs on the activity EventBridge trigger, not on demand.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/ops/activityTelegramForwarder.js:handler`
// - **Files:** app/functions/ops/activityTelegramForwarder.js, app/unit-tests/functions/activityTelegramForwarder.test.js
// - **Keywords:** telegram, activity events, eventbridge, ops notifications, chat routing, alerts, forwarder
// - **Related:** OPS-72
// @end-capability

// app/functions/ops/activityTelegramForwarder.js
//
// EventBridge target Lambda: receives ActivityEvent events and forwards them
// to the appropriate Telegram group via the Telegram Bot API.
//
// Routing: resolveRoute holds the approved set. Every other event reaches the lake only.
// The ops chat gets alarm state changes, cost alerts and failed or rolled-back stack changes.
// The live chat gets a few customer events and any customer event that failed.

import { SSMClient } from "@aws-sdk/client-ssm";
import { createLogger } from "../../lib/logger.js";
import { alarmDeploymentSlug, resolveAlarmEnv } from "../../lib/alarmName.js";
import { isDeploymentSilenced } from "../../lib/alarmSilence.js";
import { readSecret, refreshAfterAuthFailure } from "../../lib/cachedSecret.js";

const logger = createLogger({ source: "app/functions/ops/activityTelegramForwarder.js" });

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });

// Bounds one sendTelegramMessage call (including a possible 429 retry) well inside the
// Lambda's 10s timeout: an unbounded fetch under load was itself the failure mode (see
// postToTelegram) and a large retry wait would reintroduce the same problem.
const TELEGRAM_FETCH_TIMEOUT_MS = 4000;
const TELEGRAM_RETRY_AFTER_CAP_MS = 3000;

async function resolveBotToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

  const arn = process.env.TELEGRAM_BOT_TOKEN_ARN;
  if (!arn) throw new Error("Neither TELEGRAM_BOT_TOKEN nor TELEGRAM_BOT_TOKEN_ARN is set");
  return readSecret(arn);
}

/**
 * Read Telegram chat IDs from individual env vars.
 * Returns { live, ops } where each is a chat ID string or empty.
 */
export function resolveChatConfig() {
  return {
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
  // Backslash is MarkdownV1's own escape character, so it must be escaped along with the
  // other special characters in the same pass. Escaping it in a later, separate pass would
  // also double-escape the backslashes this function has just inserted.
  return text.replace(/([\\_*`[])/g, "\\$1");
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

const OPS_STACK_STATUSES = ["CREATE_FAILED", "UPDATE_FAILED", "DELETE_FAILED", "UPDATE_ROLLBACK_COMPLETE"];
const OPS_EVENTS = ["alarm-state-change", "cost-alert"];
const LIVE_CUSTOMER_EVENTS = ["subscription-activated", "pass-redeemed", "support-ticket", "vat-return-submitted"];

/**
 * Decide which chat an event belongs to. The approved set is the only way to a chat.
 * @param {Object} detail - Event detail with actor, event, outcome and requestId fields
 * @returns {"ops"|"live"|null} the chat name, or null when the event reaches the lake only
 */
export function resolveRoute(detail) {
  if ((detail.requestId || "").startsWith("test_")) return null;

  if (OPS_EVENTS.includes(detail.event)) return "ops";
  if (detail.event === "stack-status-change") {
    return OPS_STACK_STATUSES.includes(detail.stackStatus) ? "ops" : null;
  }

  if (detail.actor !== "customer") return null;
  if (detail.outcome === "failure") return "live";
  return LIVE_CUSTOMER_EVENTS.includes(detail.event) ? "live" : null;
}

/**
 * Determine which chat IDs to send to based on event attributes.
 * @param {Object} detail - Event detail
 * @param {Object} chatConfig - { live, ops } chat IDs
 * @returns {string[]} Array of target chat IDs
 */
export function resolveTargetChatIds(detail, chatConfig) {
  const route = resolveRoute(detail);
  if (!route || !chatConfig[route]) return [];
  return [chatConfig[route]];
}

/**
 * POST to the Telegram Bot API with a hard per-attempt timeout. Without a timeout, a slow or
 * stalled connection runs until the Lambda's own 10s timeout kills the invocation, which counts
 * as a platform Error rather than the application-level failure this function reports.
 */
async function postToTelegram(url, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read a 429 response body's `parameters.retry_after` (seconds) as milliseconds, or null when
 * the body doesn't carry one.
 */
function parseRetryAfterMs(body) {
  try {
    const retryAfter = JSON.parse(body)?.parameters?.retry_after;
    return typeof retryAfter === "number" ? retryAfter * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Send a message to a Telegram chat via the Bot API. A 429 with a `retry_after` inside
 * TELEGRAM_RETRY_AFTER_CAP_MS is retried once after waiting that long; any other outcome
 * (including a second 429) is reported through the warn below and the response is returned,
 * never thrown.
 */
export async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" });

  let response = await postToTelegram(url, payload);
  let body;

  if (response.status === 429) {
    body = await response.text();
    const retryAfterMs = parseRetryAfterMs(body);
    if (retryAfterMs !== null && retryAfterMs <= TELEGRAM_RETRY_AFTER_CAP_MS) {
      await sleep(retryAfterMs);
      response = await postToTelegram(url, payload);
      body = undefined;
    }
  }

  if (!response.ok) {
    if (body === undefined) body = await response.text();
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
    stackStatus: status,
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
 * Synthesize an ActivityEvent detail from an SNS notification, the shape AWS Budgets and Cost
 * Anomaly Detection both use since neither can target EventBridge directly. The message body is
 * plain text for a budget alert and a JSON string for an anomaly, so this keeps only the subject
 * and the message's first line rather than trying to parse either shape.
 */
export function synthesizeFromSns(snsRecord) {
  const subject = snsRecord.Subject || "Cost alert";
  const message = snsRecord.Message || "";
  const firstLine = message.split("\n").find((line) => line.trim().length > 0) || message;

  return {
    actor: "system",
    flow: "operational",
    env: process.env.ENVIRONMENT_NAME || "unknown",
    event: "cost-alert",
    site: "submit",
    summary: `${subject}: ${firstLine}`.slice(0, 300),
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
  if (event.Records?.[0]?.Sns) {
    return synthesizeFromSns(event.Records[0].Sns);
  }
  return event.detail || {};
}

/**
 * EventBridge target handler.
 * Handles both custom ActivityEvent events (from custom bus) and
 * raw AWS service events (CloudFormation, CloudWatch from default bus).
 */
export async function handler(event) {
  if (event.source === "aws.cloudwatch") {
    const alarmName = event.detail?.alarmName || "unknown";
    const deployment = alarmDeploymentSlug(alarmName);
    const env = resolveAlarmEnv(alarmName, process.env.ENVIRONMENT_NAME);
    if (await isDeploymentSilenced({ ssmClient, env, deployment, now: new Date() })) {
      logger.info({ message: "Deployment is silenced, skipping Telegram forward", alarmName, deployment });
      return;
    }
  }

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
    const route = resolveRoute(detail);
    logger.info({
      message: route ? `[[TELEGRAM_${route.toUpperCase()}_CHAT]] ${message}` : "Event is outside the Telegram set, lake only",
      detail,
    });
    return;
  }

  const botToken = await resolveBotToken();

  const results = await Promise.allSettled(targets.map((chatId) => sendTelegramMessage(botToken, chatId, message)));

  // A 401 from Telegram means the token was rolled. One forced read of the secret, and one more
  // send to the chats that were refused, only when the secret now holds another token.
  const refused = targets.filter((_, index) => results[index].status === "fulfilled" && results[index].value.status === 401);
  const arn = process.env.TELEGRAM_BOT_TOKEN_ARN;
  if (refused.length > 0 && !process.env.TELEGRAM_BOT_TOKEN && arn) {
    const refreshedToken = await refreshAfterAuthFailure(arn, botToken);
    if (refreshedToken) {
      const retried = await Promise.allSettled(refused.map((chatId) => sendTelegramMessage(refreshedToken, chatId, message)));
      refused.forEach((chatId, retryIndex) => {
        results[targets.indexOf(chatId)] = retried[retryIndex];
      });
    }
  }

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn({ message: "Failed to send Telegram message", error: result.reason?.message });
    }
  }
}
