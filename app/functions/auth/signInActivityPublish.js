// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/auth/signInActivityPublish.js
//
// EventBridge target for the Pre Token Generation trigger's fire-and-forget invoke. Every
// sign-in and refresh, on every app client, arrives here, so this is the single place that
// tells a fresh sign-in from a resumed session from a routine refresh (see PLAN_SIGN_IN_PARITY.md
// "The session rule") and publishes the activity event both the lake and Telegram read.

import crypto from "crypto";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { initializeSalt, hashSub, isSaltInitialized } from "../../services/subHasher.js";
import { getSignInSession, putSignInSession } from "../../data/dynamoDbSecurityStateRepository.js";

// A refresh starts a new session when the previous token issue is older than the access-token
// lifetime (60 minutes, the Cognito default) plus 5 minutes' grace: the old tokens lapsed and
// nothing kept the session alive.
export const SESSION_RESUME_THRESHOLD_MS = (60 + 5) * 60 * 1000;

/**
 * Extract the identity provider name from a Cognito `identities` attribute, which is a JSON
 * string for a federated user and absent for a native Cognito user.
 *
 * @param {string|Array} [identities]
 * @returns {string} the provider name, or "" when there is none
 */
export function extractProvider(identities) {
  if (!identities) return "";
  try {
    const parsed = typeof identities === "string" ? JSON.parse(identities) : identities;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].providerName || "";
  } catch {
    return "";
  }
  return "";
}

/**
 * Classify a Pre Token Generation `triggerSource` and prior session state into the sign-in
 * event this token issue represents. See PLAN_SIGN_IN_PARITY.md "The session rule".
 *
 * @param {string} triggerSource
 * @param {{lastIssuedAt?: number, sessionId?: string, sessionStartedAt?: number}|null} priorSession
 * @param {number} now - epoch milliseconds
 * @returns {{event: "login"|"session-resumed"|"token-refresh", sessionKind: "sign-in"|"resumed"|"continued", sessionId: string, sessionStartedAt: number}}
 */
export function classifySignInEvent(triggerSource, priorSession, now) {
  const isRefresh = triggerSource === "TokenGeneration_RefreshTokens";

  if (!isRefresh) {
    return { event: "login", sessionKind: "sign-in", sessionId: crypto.randomUUID(), sessionStartedAt: now };
  }

  const resumed = !priorSession || now - priorSession.lastIssuedAt > SESSION_RESUME_THRESHOLD_MS;
  if (resumed) {
    return { event: "session-resumed", sessionKind: "resumed", sessionId: crypto.randomUUID(), sessionStartedAt: now };
  }

  return {
    event: "token-refresh",
    sessionKind: "continued",
    sessionId: priorSession.sessionId,
    sessionStartedAt: priorSession.sessionStartedAt,
  };
}

const EVENT_LABELS = {
  "login": "Login",
  "session-resumed": "Session resumed",
  "token-refresh": "Token refresh",
};

/**
 * EventBridge target handler, invoked fire-and-forget from the Pre Token Generation trigger.
 *
 * @param {Object} payload
 * @param {string} payload.triggerSource
 * @param {string} [payload.clientId]
 * @param {string} [payload.sub]
 * @param {string} [payload.email]
 * @param {string|Array} [payload.identities]
 */
export async function handler(payload) {
  await initializeSalt();

  const { triggerSource, clientId, sub, email, identities } = payload;
  const appClient = await resolveAppClient(clientId);
  const provider = extractProvider(identities);
  const actor = classifyActor(email);
  const hashedSub = sub && isSaltInitialized() ? hashSub(sub) : null;
  const now = Date.now();

  const priorSession = hashedSub && appClient ? await getSignInSession(hashedSub, appClient) : null;
  const { event, sessionKind, sessionId, sessionStartedAt } = classifySignInEvent(triggerSource, priorSession, now);

  if (hashedSub && appClient) {
    await putSignInSession(hashedSub, appClient, { lastIssuedAt: now, sessionId, sessionStartedAt });
  }

  const providerLabel = provider ? ` via ${provider}` : "";
  await publishActivityEvent({
    event,
    summary: `${EVENT_LABELS[event]}${providerLabel}: ${maskEmail(email)}`,
    actor,
    flow: "user-journey",
    userSub: sub || undefined,
    appClient,
    sessionId,
    detail: {
      triggerSource,
      sessionKind,
      ...(provider ? { provider } : {}),
    },
  });
}
