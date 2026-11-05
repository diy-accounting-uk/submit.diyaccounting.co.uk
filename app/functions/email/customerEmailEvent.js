// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/email/customerEmailEvent.js

import { createLogger } from "../../lib/logger.js";
import { publishActivityEvent, publishActivityFailureEvent } from "../../lib/activityAlert.js";
import { emitMetric } from "../../lib/emfMetrics.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/email/customerEmailEvent.js" });

const FAILURE_EVENTS = {
  "Complaint": { event: "customer-email-complained", failure: "complaint" },
  "Reject": { event: "customer-email-bounced", failure: "reject" },
  "Rendering Failure": { event: "customer-email-bounced", failure: "rendering-failure" },
};

function tagValue(tags, name) {
  const value = tags?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function classify(message) {
  const type = message.eventType;
  if (type === "Bounce") {
    return message.bounce?.bounceType === "Permanent"
      ? { event: "customer-email-bounced", failure: "bounce-permanent" }
      : { delayed: true };
  }
  if (type === "DeliveryDelay") return { delayed: true };
  return Object.hasOwn(FAILURE_EVENTS, type) ? FAILURE_EVENTS[type] : null;
}

/**
 * SNS subscriber for the SES configuration set. It reads the event type and the mail tags only,
 * and never the recipient fields.
 */
export async function handler(event) {
  await initializeSalt();
  for (const record of event.Records || []) {
    let message;
    try {
      message = JSON.parse(record.Sns.Message);
    } catch {
      logger.warn({ message: "Customer email event is not JSON" });
      continue;
    }
    const outcome = classify(message);
    if (!outcome) {
      logger.info({ message: "Customer email event ignored", eventType: message.eventType });
      continue;
    }
    const tags = message.mail?.tags;
    const kind = tagValue(tags, "kind") || "unknown";
    const actor = tagValue(tags, "actor") || "customer";
    const hashedSub = tagValue(tags, "hashedsub");
    const detail = { kind, sesEventType: message.eventType, ...(hashedSub ? { hashedSub } : {}) };

    if (outcome.delayed) {
      await publishActivityEvent({ event: "customer-email-delayed", summary: `Customer email delayed: ${kind}`, actor, detail });
      continue;
    }
    emitMetric({ namespace: "Submit/Business", metricName: "CustomerEmailFailure", dimensions: { Actor: actor } });
    await publishActivityFailureEvent({
      event: outcome.event,
      summary: `Customer email ${outcome.failure}: ${kind}`,
      failure: outcome.failure,
      actor,
      detail,
    });
  }
}
