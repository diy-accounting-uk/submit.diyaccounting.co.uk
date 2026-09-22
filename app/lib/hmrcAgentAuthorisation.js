// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hmrcAgentAuthorisation.js
//
// Client for HMRC's Agent Authorisation API (PLAN_PRICE_UPDATE.md (d), "The authorisation
// flow"). The practice's own HMRC access token carries the ASA enrolment; HMRC resolves the
// delegated relationship from the client's identifier sent on each call, so no client credential
// is ever stored or sent by this service.

import { createLogger, context } from "./logger.js";
import {
  http400BadRequestResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "./httpResponseHelper.js";

const logger = createLogger({ source: "app/lib/hmrcAgentAuthorisation.js" });

/**
 * Base URI for the Agent Authorisation API: HMRC's sandbox host for ci, the real host for prod,
 * and whatever the test/simulator lane points it at (PU-7f's build step).
 *
 * @returns {string}
 */
export function getAgentAuthorisationBaseUrl() {
  const base = process.env.HMRC_AGENT_AUTHORISATION_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error("Missing required environment variable HMRC_AGENT_AUTHORISATION_BASE_URI");
  }
  return base;
}

function getHeaderValue(headers, name) {
  if (!headers || !name) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return null;
}

/**
 * Builds the request headers the Agent Authorisation API expects: the fraud-prevention headers
 * every HMRC call carries, the practice's bearer token, and the API version accept header.
 *
 * @param {string} accessToken
 * @param {object} [govClientHeaders]
 * @param {string} [testScenario]
 * @returns {object}
 */
export function buildAgentAuthorisationHeaders(accessToken, govClientHeaders = {}, testScenario = undefined) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    ...govClientHeaders,
  };
  if (context.get("requestId")) headers["x-request-id"] = context.get("requestId");
  if (context.get("traceparent")) headers["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) headers["x-correlationid"] = context.get("correlationId");
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;
  return headers;
}

async function agentAuthorisationRequest(method, url, { accessToken, govClientHeaders, testScenario, body } = {}) {
  const headers = buildAgentAuthorisationHeaders(accessToken, govClientHeaders, testScenario);
  const init = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  logger.info({ message: `Request to ${method} ${url}`, url, method });
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  logger.info({ message: `Response from ${method} ${url}`, url, status: response.status });

  return { ok: response.ok, status: response.status, data, response };
}

/**
 * Creates an invitation for a client to authorise this practice for one HMRC service
 * (`POST /agents/{arn}/invitations`). The invitation id comes back on the `Location` header, not
 * the body.
 *
 * @param {object} params
 * @param {string} params.arn - the practice's HMRC agent reference number
 * @param {string} params.service - "MTD-VAT" or "MTD-IT"
 * @param {string} params.clientIdType - "vrn" or "ni"
 * @param {string} params.clientId - the client's VRN or NINO
 * @param {string} params.knownFact - the VAT registration date, or the client's postcode
 * @param {string} params.accessToken
 * @param {object} [params.govClientHeaders]
 * @param {string} [params.testScenario]
 * @returns {Promise<{ok: boolean, status: number, data: object, invitationId: string|null}>}
 */
export async function createInvitation({ arn, service, clientIdType, clientId, knownFact, accessToken, govClientHeaders, testScenario }) {
  const url = `${getAgentAuthorisationBaseUrl()}/agents/${encodeURIComponent(arn)}/invitations`;
  const body = { service: [service], clientType: "business", clientIdType, clientId, knownFact };
  const result = await agentAuthorisationRequest("POST", url, { accessToken, govClientHeaders, testScenario, body });
  const location = getHeaderValue(result.response.headers, "location");
  const invitationId = location ? location.split("/").filter(Boolean).pop() : null;
  return { ...result, invitationId };
}

/**
 * Reads an invitation's status (`GET /agents/{arn}/invitations/{invitationId}`): "pending",
 * "accepted", "rejected" or "expired".
 */
export async function getInvitationStatus({ arn, invitationId, accessToken, govClientHeaders, testScenario }) {
  const url = `${getAgentAuthorisationBaseUrl()}/agents/${encodeURIComponent(arn)}/invitations/${encodeURIComponent(invitationId)}`;
  return agentAuthorisationRequest("GET", url, { accessToken, govClientHeaders, testScenario });
}

/**
 * Cancels a pending invitation (`DELETE /agents/{arn}/invitations/{invitationId}`).
 */
export async function cancelInvitation({ arn, invitationId, accessToken, govClientHeaders, testScenario }) {
  const url = `${getAgentAuthorisationBaseUrl()}/agents/${encodeURIComponent(arn)}/invitations/${encodeURIComponent(invitationId)}`;
  return agentAuthorisationRequest("DELETE", url, { accessToken, govClientHeaders, testScenario });
}

/**
 * Checks for a relationship already in place, such as one carried over when the practice linked
 * its old Government Gateway to the ASA (`GET /agents/{arn}/relationships`).
 */
export async function getRelationship({ arn, service, clientIdType, clientId, accessToken, govClientHeaders, testScenario }) {
  const query = new URLSearchParams({ service, clientIdType, clientId }).toString();
  const url = `${getAgentAuthorisationBaseUrl()}/agents/${encodeURIComponent(arn)}/relationships?${query}`;
  return agentAuthorisationRequest("GET", url, { accessToken, govClientHeaders, testScenario });
}

// The two stored statuses that mean HMRC has granted this practice authority over the client:
// "authorised" comes from a relationship already in place (getRelationship), "accepted" from an
// invitation the client has accepted (getInvitationStatus). Anything else - "pending",
// "rejected", "expired", "unauthorised", or no stored status at all - refuses.
const AUTHORISED_STATUSES = new Set(["authorised", "accepted"]);

/**
 * Whether a practice's client row carries a granted authorisation for one service. Read by every
 * client-scoped submission route (PLAN_PRICE_UPDATE.md (d), "Security boundaries") so a
 * submission never reaches HMRC on a client the practice was never authorised for.
 *
 * @param {object|null} client - a practice-clients row, as `dynamoDbPracticeClientRepository.getClient` returns it
 * @param {string} service - e.g. "MTD-VAT" or "MTD-IT"
 * @returns {boolean}
 */
export function isClientAuthorisedForService(client, service) {
  return AUTHORISED_STATUSES.has(client?.authorisations?.[service]?.status);
}

/**
 * Maps a non-ok Agent Authorisation API result to this service's own JSON error response. HMRC
 * answers "no relationship found" and "no invitation found" both with 404, which is not an error
 * here - the caller decides what a 404 means for its own operation.
 */
export function agentAuthorisationErrorResponse(request, result, responseHeaders) {
  const errorResponse = { hmrcResponseCode: result.status, responseBody: result.data };
  if (result.status === 404) {
    return http404NotFoundResponse({ request, headers: responseHeaders, message: "Not found", error: errorResponse });
  }
  if (result.status === 403) {
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Forbidden - the practice's HMRC access token may be invalid or lack the agent enrolment",
      error: errorResponse,
    });
  }
  if (result.status === 400) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "HMRC rejected the request",
      error: errorResponse,
    });
  }
  return http500ServerErrorResponse({
    request,
    headers: responseHeaders,
    message: "HMRC Agent Authorisation request failed",
    error: errorResponse,
  });
}
