// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-01 Publish activity events to the bus
// - **Use when:** a Lambda or route must record a business event for the analytics lake and Telegram alerts.
// - **Does:** publishActivityEvent and publishActivityFailureEvent send structured events to the ACTIVITY_BUS_NAME EventBridge bus. Calls are fire-and-forget and never block the caller. ActivityStack.java provisions the bus and a rule that forwards every event to a Telegram-forwarding Lambda.
// - **Run:** `import { publishActivityEvent, publishActivityFailureEvent } from "app/lib/activityAlert.js"`
// - **Entry:** `app/lib/activityAlert.js:publishActivityEvent`; `app/lib/activityAlert.js:publishActivityFailureEvent`
// - **Files:** app/lib/activityAlert.js, app/unit-tests/lib/activityAlert.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/ActivityStack.java
// - **Keywords:** activity event, eventbridge, activity bus, telegram alert, fire and forget, business event, actor class, hashed sub
// - **Related:** DATA-02
// @end-capability

// app/lib/activityAlert.js

import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { createLogger, context } from "./logger.js";
import { hashSub, isSaltInitialized } from "../services/subHasher.js";
import { isOperatorEmailLoaded, warmOperators } from "./operators.js";

const logger = createLogger({ source: "app/lib/activityAlert.js" });

/**
 * The region the EventBridge client publishes into. ACTIVITY_BUS_REGION overrides AWS_REGION so
 * a Lambda running outside the activity bus's home region (the WAF scan-detect Lambda runs in
 * us-east-1; the bus lives in eu-west-2) can still publish to it. Every Lambda in the bus's own
 * region leaves ACTIVITY_BUS_REGION unset and this falls through to AWS_REGION as before.
 *
 * @returns {string}
 */
export function resolveActivityBusRegion() {
  return process.env.ACTIVITY_BUS_REGION || process.env.AWS_REGION || "eu-west-2";
}

const ebClient = new EventBridgeClient({ region: resolveActivityBusRegion() });

/**
 * Publish an activity event to the EventBridge custom bus.
 * Fire-and-forget for every existing caller: never throws, graceful no-op when
 * ACTIVITY_BUS_NAME not set. The returned result lets a caller that runs unattended (no
 * dashboard, no watchdog watching its own logs) notice a swallowed failure and act on it -
 * see scripts/fraud-header-email-check.js, whose launchd job has nothing else to fail loudly to.
 *
 * @param {Object} params
 * @param {string} params.event - Event name (e.g. "login", "vat-return-submitted")
 * @param {string} params.site - Site identifier (e.g. "submit")
 * @param {string} params.summary - Human-readable summary for alerting
 * @param {string} [params.actor] - Actor classification
 * @param {string} [params.flow] - Flow classification
 * @param {string} [params.userSub] - Raw sub of the authenticated user; hashed before it reaches the event, never logged raw
 * @param {string} [params.clientId] - The practice's client id when the submission was client-scoped; absent otherwise
 * @param {string} [params.appClient] - The Cognito app client the sign-in or refresh happened on ("submit", "books", "mcp")
 * @param {string} [params.sessionId] - Opaque session id from the sign-in session rule; absent for non-session events
 * @param {Object} [params.detail] - Additional detail fields
 * @returns {Promise<{published: boolean, error?: string}>} published is false when
 *   ACTIVITY_BUS_NAME was unset (skipped) or the EventBridge send failed (error holds the message)
 */
export async function publishActivityEvent({
  event,
  site = "submit",
  summary,
  actor,
  flow,
  userSub,
  clientId,
  appClient,
  sessionId,
  detail = {},
}) {
  const busName = process.env.ACTIVITY_BUS_NAME;
  if (!busName) {
    logger.info({ message: "ACTIVITY_BUS_NAME not set, skipping activity event", event });
    return { published: false, error: "ACTIVITY_BUS_NAME not set" };
  }

  const requestId = context.get("requestId") || null;
  const effectiveUserSub = userSub || context.get("userSub") || null;
  const hashedSub = hashSubForEvent(effectiveUserSub);
  await warmOperators();
  const effectiveActor = resolveActorClass(actor, hashedSub);
  const effectiveFlow = flow || (effectiveUserSub ? "user-journey" : "unknown");

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
              ...(hashedSub ? { hashedSub } : {}),
              ...(clientId ? { clientId } : {}),
              ...(appClient ? { appClient } : {}),
              ...(sessionId ? { sessionId } : {}),
              ...detail,
            }),
          },
        ],
      }),
    );
    logger.info({ message: "Activity event published", event, summary, requestId });
    return { published: true };
  } catch (err) {
    logger.warn({ message: "Failed to publish activity event", event, error: err.message });
    return { published: false, error: err.message };
  }
}

/**
 * Resolve the actor class for the current invocation.
 *
 * Fail-safe routing: customer-journey work whose actor was never explicitly set
 * should still reach the LIVE telegram channel rather than silently going to TEST.
 * The forwarder routes `customer` to LIVE; only `test_`-prefixed requestIds route to TEST.
 *
 * This is the single source of the actor class, so activity events, receipt items
 * and business metrics all agree on whether a submission came from a real customer.
 *
 * Preference order: an explicit override, then the signed-in user's email (set into
 * context by extractUserFromAuthorizerContext from the email claim, or from the username
 * when the token is an access token and the username is an email address), then the `test_` requestId prefix a browser session sets. A probe or canary that
 * calls a protected endpoint directly (no browser, no sessionStorage) never sets that
 * prefix, but it does carry a Cognito access token for its own synthetic user, whose
 * username is its email address, so the email tier is what classifies it. A federated
 * caller (username like Google_<id>) has no email on an access token and falls through to
 * the requestId prefix.
 *
 * The class belongs to the account, not to one event: once an event of a warm container shows an
 * account is a test user or probe, every later event of that account in the container carries the
 * same class, including events that arrive without an email.
 *
 * @param {string} [explicitActor] - Overrides the derived class when supplied
 * @param {string|null} [hashedSub] - Hashed sub of the account the event belongs to
 * @returns {"customer"|"operator"|"test-user"|"probe"|"system"}
 */
export function resolveActorClass(explicitActor, hashedSub = null) {
  if (explicitActor) return explicitActor;
  const email = context.get("userEmail") || null;
  if (email) {
    const actor = classifyActor(email);
    if (hashedSub && actor !== "customer") nonCustomerActorBySub.set(hashedSub, actor);
    return actor;
  }
  const remembered = hashedSub ? nonCustomerActorBySub.get(hashedSub) : null;
  if (remembered) return remembered;
  const requestId = context.get("requestId") || null;
  const actor = requestId?.startsWith("test_") ? "test-user" : "customer";
  if (hashedSub && actor !== "customer") nonCustomerActorBySub.set(hashedSub, actor);
  return actor;
}

const nonCustomerActorBySub = new Map();

/** Forget the accounts remembered as non-customers (for tests). */
export function resetRememberedActors() {
  nonCustomerActorBySub.clear();
}

/**
 * Hash a user sub for inclusion in an activity event, matching the hash stored
 * alongside customer records. Returns null when the sub or the salt is unavailable.
 *
 * @param {string} [userSub]
 * @returns {string|null}
 */
function hashSubForEvent(userSub) {
  if (!userSub || !isSaltInitialized()) return null;
  try {
    return hashSub(userSub);
  } catch (err) {
    logger.warn({ message: "Could not hash user sub for activity event", error: err.message });
    return null;
  }
}

/**
 * Publish an activity event for a customer-facing operation that failed.
 *
 * Carries the failure category and the hashed user sub so a failed journey can be
 * traced back to its records. Never carries PII, VRNs or raw upstream payloads.
 *
 * @param {Object} params
 * @param {string} params.event - Event name (e.g. "vat-return-failed")
 * @param {string} [params.site]
 * @param {string} params.summary - Human-readable summary for alerting
 * @param {string} params.failure - Failure category (e.g. "auth-expired", "hmrc-rejected")
 * @param {string} [params.userSub] - Raw sub; hashed before it reaches the event
 * @param {string} [params.actor]
 * @param {string} [params.flow]
 * @param {string} [params.clientId] - The practice's client id when the submission was client-scoped; absent otherwise
 * @param {Object} [params.detail] - Additional non-identifying detail fields
 */
export async function publishActivityFailureEvent({
  event,
  site = "submit",
  summary,
  failure,
  userSub,
  actor,
  flow,
  clientId,
  detail = {},
}) {
  await publishActivityEvent({
    event,
    site,
    summary,
    actor,
    flow,
    userSub,
    clientId,
    detail: {
      outcome: "failure",
      failure,
      ...detail,
    },
  });
}

/**
 * Classify an actor based on email. An operator is recognised once the operator list is loaded
 * (see warmOperators); before that an operator's email reads as a customer.
 * @param {string} email
 * @returns {"customer"|"operator"|"test-user"|"probe"|"system"}
 */
export function classifyActor(email) {
  if (!email) return "system";
  if (email.endsWith("@test.diyaccounting.co.uk")) return "test-user";
  if (email.startsWith("probe-") || email.includes("+probe")) return "probe";
  if (isOperatorEmailLoaded(email)) return "operator";
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
