// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// practice-tools.js -- the practice's own client operations: the client list itself
// (list_clients, add_client), the HMRC Agent Authorisation flow (invite_client,
// client_authorisation_status), and moving a book to a client's book set. Unlike the rest of
// this server's tools, these reach DIY Accounting Submit's own API rather than the local
// filesystem: a client row lives in the deployed backend's DynamoDB table and a client's book
// set in its S3 storage (PLAN_PRICE_UPDATE.md (d)), never on this machine.
//
// list_clients, add_client, invite_client and client_authorisation_status call
// submit-tools.js's callSubmitApi and requireField rather than a second HTTP layer of their
// own; move_book_to_client predates that and keeps its own small fetch below.
//
// Configuration comes from the environment: DIYA_SUBMIT_BASE_URL (the deployed site's base URL,
// e.g. https://submit.diyaccounting.co.uk/) and DIYA_SUBMIT_ACCESS_TOKEN (the signed-in
// practice's own session bearer token). Obtaining that token is outside this tool's scope.

import { callSubmitApi, requireField } from "./submit-tools.js";

function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

function accessToken() {
  const value = process.env.DIYA_SUBMIT_ACCESS_TOKEN;
  if (!value) throw new Error("DIYA_SUBMIT_ACCESS_TOKEN is not set");
  return value;
}

/**
 * Moves one of the practice's own books to a client's book set, by calling DIY Accounting
 * Submit's own move route. The route itself verifies every copy before any delete and refuses
 * when the destination already holds a book with this id; this tool just carries that answer
 * back, or throws with the API's own message when it refuses.
 *
 * @param {Object} _session - unused; this tool carries no local session state
 * @param {{clientId: string, bookId: string}} params
 * @returns {Promise<{bookId: string, clientId: string, movedObjectCount: number}>}
 */
export async function moveBookToClient(_session, { clientId, bookId } = {}) {
  if (!clientId) throw new Error("move_book_to_client requires a clientId");
  if (!bookId) throw new Error("move_book_to_client requires a bookId");

  const url = `${baseUrl()}/api/v1/practice/clients/${encodeURIComponent(clientId)}/books/${encodeURIComponent(bookId)}/move`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `move_book_to_client failed with HTTP ${response.status}`);
  }
  return body;
}

/**
 * list_clients: the signed-in practice's own client list (archived clients excluded), over
 * GET /api/v1/practice/clients.
 * @param {Object} _session - unused; this tool carries no local session state
 * @returns {Promise<{clients: Object[]}>}
 */
export async function listClients(_session, _params = {}) {
  return callSubmitApi("/api/v1/practice/clients");
}

/**
 * add_client: adds one client to the practice's list, over POST /api/v1/practice/clients. Every
 * identifier is optional, but a given one must match its HMRC or Companies House format, checked
 * by the route itself.
 * @param {Object} _session
 * @param {{displayName: string, vrn?: string, nino?: string, utr?: string, companyNumber?: string}} params
 * @returns {Promise<{client: Object}>}
 */
export async function addClient(_session, params = {}) {
  const displayName = requireField("add_client", params, "displayName");
  const { vrn, nino, utr, companyNumber } = params;
  return callSubmitApi("/api/v1/practice/clients", {
    method: "POST",
    body: { displayName, vrn, nino, utr, companyNumber },
  });
}

/**
 * invite_client: sends an HMRC Agent Authorisation invitation for one client and one service,
 * over POST /api/v1/practice/clients/{clientId}/authorisation/invitations. The client's own VRN
 * or NINO (whichever the service needs) comes from the client row, not from this call; the
 * practice's HMRC access token travels in the body, alongside the known fact HMRC's invitation
 * check asks for. arn, when given, is stored as the practice's agent reference number for reuse;
 * when omitted, the route reads back whatever the practice stored on an earlier call.
 * @param {Object} _session
 * @param {{clientId: string, service: string, knownFact: string, hmrcAccessToken: string, arn?: string}} params
 * @returns {Promise<{client: Object, invitationId: string, status: string}>}
 */
export async function inviteClient(_session, params = {}) {
  const clientId = requireField("invite_client", params, "clientId");
  const service = requireField("invite_client", params, "service");
  const knownFact = requireField("invite_client", params, "knownFact");
  const hmrcAccessToken = requireField("invite_client", params, "hmrcAccessToken");
  const { arn } = params;
  return callSubmitApi(`/api/v1/practice/clients/${encodeURIComponent(clientId)}/authorisation/invitations`, {
    method: "POST",
    body: { service, knownFact, accessToken: hmrcAccessToken, ...(arn ? { arn } : {}) },
  });
}

/**
 * client_authorisation_status: one client's current authorisation status for one HMRC service,
 * over GET /api/v1/practice/clients/{clientId}/authorisation?service=. The route reads the HMRC
 * access token from the plain Authorization header (extractHmrcAccessTokenFromLambdaEvent), the
 * same header callSubmitApi puts the practice's own session bearer on for this route (it sits
 * behind the standard Cognito JWT authoriser, not the custom one that frees Authorization for an
 * HMRC token on list_vat_obligations and submit_vat_return); this call overrides that header with
 * the HMRC access token instead, matching what the route itself reads.
 * @param {Object} _session
 * @param {{clientId: string, service: string, hmrcAccessToken: string}} params
 * @returns {Promise<{client: Object, status: string, invitationId: string|null}>}
 */
export async function clientAuthorisationStatus(_session, params = {}) {
  const clientId = requireField("client_authorisation_status", params, "clientId");
  const service = requireField("client_authorisation_status", params, "service");
  const hmrcAccessToken = requireField("client_authorisation_status", params, "hmrcAccessToken");
  const query = new URLSearchParams({ service });
  return callSubmitApi(`/api/v1/practice/clients/${encodeURIComponent(clientId)}/authorisation?${query.toString()}`, {
    headers: { Authorization: `Bearer ${hmrcAccessToken}` },
  });
}
