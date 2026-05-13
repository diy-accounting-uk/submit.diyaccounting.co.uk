// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/activityAlert.js

import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { createLogger, context } from "./logger.js";

const logger = createLogger({ source: "app/lib/activityAlert.js" });

const ebClient = new EventBridgeClient({ region: process.env.AWS_REGION || "eu-west-2" });

/**
 * Publish an activity event to the EventBridge custom bus.
 * Fire-and-forget: never throws, graceful no-op when ACTIVITY_BUS_NAME not set.
 *
 * @param {Object} params
 * @param {string} params.event - Event name (e.g. "login", "vat-return-submitted")
 * @param {string} params.site - Site identifier (e.g. "submit")
 * @param {string} params.summary - Human-readable summary for alerting
 * @param {string} [params.actor] - Actor classification
 * @param {string} [params.flow] - Flow classification
 * @param {Object} [params.detail] - Additional detail fields
 */
export async function publishActivityEvent({ event, site = "submit", summary, actor, flow, detail = {} }) {
  const busName = process.env.ACTIVITY_BUS_NAME;
  if (!busName) {
    logger.info({ message: "ACTIVITY_BUS_NAME not set, skipping activity event", event });
    return;
  }

  const requestId = context.get("requestId") || null;
  const userSub = context.get("userSub") || null;
  // Fail-safe routing: customer-journey events whose actor was never explicitly set
  // should still reach the LIVE telegram channel rather than silently going to TEST.
  // The forwarder routes `customer` to LIVE; only `test_`-prefixed requestIds route to TEST.
  const effectiveActor = actor || (requestId?.startsWith("test_") ? "test-user" : "customer");
  const effectiveFlow = flow || (userSub ? "user-journey" : "unknown");

  try {
    await ebClient.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: busName,
            Source: `diy.${site}`,
            DetailType: "ActivityEvent",
            Detail: JSON.stringify({
              event,
              site,
              summary,
              actor: effectiveActor,
              flow: effectiveFlow,
              timestamp: new Date().toISOString(),
              ...(requestId ? { requestId } : {}),
              ...detail,
            }),
          },
        ],
      }),
    );
    logger.info({ message: "Activity event published", event, summary, requestId });
  } catch (err) {
    logger.warn({ message: "Failed to publish activity event", event, error: err.message });
  }
}

/**
 * Classify an actor based on email and auth method.
 * @param {string} email
 * @param {string} [authMethod] - e.g. "cognito-native", "cognito-federated"
 * @returns {"customer"|"test-user"|"synthetic"|"system"}
 */
export function classifyActor(email, authMethod) {
  if (!email) return "system";
  if (email.endsWith("@test.diyaccounting.co.uk")) return "test-user";
  if (authMethod === "cognito-native") return "test-user";
  if (email.startsWith("synthetic-") || email.includes("+synthetic")) return "synthetic";
  return "customer";
}

/**
 * Classify the flow based on invocation source.
 * @param {string} [invocationSource]
 * @returns {"user-journey"|"ci-pipeline"|"infrastructure"|"operational"}
 */
export function classifyFlow(invocationSource) {
  if (!invocationSource) return "user-journey";
  const src = invocationSource.toLowerCase();
  if (src.includes("schedule") || src.includes("cron") || src.includes("reconcile")) return "operational";
  if (src.includes("ci") || src.includes("pipeline") || src.includes("github")) return "ci-pipeline";
  if (src.includes("cloudformation") || src.includes("deploy")) return "infrastructure";
  return "user-journey";
}

/**
 * Mask an email address for display: first char + *** + @domain
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  if (!email || typeof email !== "string") return "***";
  const atIndex = email.indexOf("@");
  if (atIndex < 1) return "***";
  return email.charAt(0) + "***" + email.substring(atIndex);
}

/**
 * Mask a VRN for display: ***1234 (last 4 digits)
 * @param {string} vrn
 * @returns {string}
 */
export function maskVrn(vrn) {
  if (!vrn || typeof vrn !== "string") return "***";
  if (vrn.length <= 4) return "***" + vrn;
  return "***" + vrn.slice(-4);
}
