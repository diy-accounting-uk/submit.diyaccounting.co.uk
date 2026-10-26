// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// submit-tools.js -- the Submit-facing tools over the deployed REST API: the figures
// derive_vat_return and derive_micro_entity_accounts answered, filed or fetched through this
// service's own HMRC and Companies House routes. Like practice-tools.js, these reach DIY
// Accounting Submit's deployed API rather than the local filesystem or the engine.
//
// Configuration comes from the environment: DIYA_SUBMIT_BASE_URL (the deployed site's base URL).
// The session bearer is the Cognito access token the session's credentials answer (the stdio
// server's is auth.js's own sign-in; the hosted Lambda's is the request's bearer), whose client_id
// claim names the MCP client -- ApiStack.java's main and custom authorisers
// both accept it, the same way they accept the Submit web client's). Two routes here
// (list_vat_obligations, submit_vat_return) sit behind the API's custom Lambda authoriser, whose
// identity source is the X-Authorization header (ApiStack.java), which frees the plain
// Authorization header for the HMRC access token those two routes read directly
// (hmrcVatObligationGet.js reads it from the header; hmrcVatReturnPost.js takes it as the body's
// accessToken field). Those two routes also carry X-Id-Token (the session credentials' idToken(), when it answers one), so the
// custom authoriser can build Gov-Client-Multi-Factor from a verified claim rather than finding
// none (see app/functions/auth/customAuthorizer.js's extractMfaContext). Every other route here
// sits behind the standard Cognito JWT authoriser, so the session bearer goes in the plain
// Authorization header, as practice-tools.js sends it.
//
// The HMRC access token comes from the session's HMRC grant, which request_hmrc_authorisation
// starts: the user grants access in the browser, Submit's callback stores HMRC's tokens server
// side, and the tools that call HMRC read the access token back by the grant id for each call.
// No tool takes the token as an argument, and none answers the grant id or a token to the chat.

function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

export function requireField(toolName, params, key) {
  const value = params?.[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`${toolName} requires ${key}`);
  }
  return value;
}

// hmrcVatObligationGet.js and hmrcVatReturnPost.js run behind an AsyncApiLambda: a first request
// with no x-request-id header is the initial request, and it answers 202 with a Location header
// and an x-request-id to poll with. A poll re-sends the same request (same method, same body)
// carrying that x-request-id and without x-initial-request, until the status leaves 202 — the
// same contract web/public/lib/services/api-client.js's executeAsyncRequestPolling implements for
// the browser. Every route is polled the same way here, since only these two currently answer 202
// and a route that starts answering synchronously never takes the branch below.
const POLL_MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1000;
const POLL_BACKOFF_MAX_MS = 4000;

async function pollUntilSettled(session, url, requestInit, firstResponse) {
  let response = firstResponse;
  const pollHeaders = { ...requestInit.headers };
  delete pollHeaders["x-initial-request"];
  const requestId = response.headers.get("x-request-id");
  if (requestId) pollHeaders["x-request-id"] = requestId;
  const pollUrl = response.headers.get("Location") || url;
  const deadline = session.pollBudgetMs === null ? Infinity : Date.now() + session.pollBudgetMs;

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS && response.status === 202; attempt += 1) {
    const delayMs = Math.min(POLL_INTERVAL_MS * 2 ** (attempt - 1), POLL_BACKOFF_MAX_MS);
    if (Date.now() + delayMs > deadline) {
      throw new Error(`Timed out after ${session.pollBudgetMs} ms waiting for ${pollUrl} to complete`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    response = await fetch(url, { ...requestInit, headers: pollHeaders });
  }

  if (response.status === 202) {
    throw new Error(`Timed out after ${POLL_MAX_ATTEMPTS} polls waiting for ${pollUrl} to complete`);
  }
  return response;
}

/**
 * Calls one of this service's own API routes with the session's own bearer (its
 * credentials' accessToken()), over the custom authoriser's X-Authorization header when customAuthorizer is
 * set, or the standard Authorization header otherwise; extra headers (an HMRC access token,
 * Gov-Test-Scenario, hmrcAccount) merge in on top and are never overwritten by the session
 * header. A customAuthorizer call also carries X-Id-Token when the session's credentials answer an
 * id token, which customAuthorizer.js reads to build Gov-Client-Multi-Factor server-side. A 202 response is
 * polled to a terminal status before this returns (see pollUntilSettled); a poll that never
 * settles, or outlasts the session's pollBudgetMs, throws with the poll URL in the message rather than returning a partial result.
 * Exported so practice-tools.js's client tools (list_clients, add_client, invite_client,
 * client_authorisation_status) call the same routes over the same HTTP layer rather than a
 * second one of their own.
 * @param {{credentials: {accessToken: () => Promise<string>, idToken: () => Promise<string|null>}, pollBudgetMs: number|null}} session
 * @param {string} path - the route, e.g. "/api/v1/hmrc/vat/obligation?vrn=..."
 * @param {{method?: string, body?: Object, headers?: Object, customAuthorizer?: boolean}} [options]
 */
export async function callSubmitApi(session, path, { method = "GET", body, headers = {}, customAuthorizer = false } = {}) {
  const sessionHeaderName = customAuthorizer ? "X-Authorization" : "Authorization";
  const idToken = customAuthorizer ? await session.credentials.idToken() : null;
  const finalHeaders = {
    [sessionHeaderName]: `Bearer ${await session.credentials.accessToken()}`,
    ...(idToken ? { "X-Id-Token": idToken } : {}),
    "x-initial-request": "true",
    ...headers,
  };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  const url = `${baseUrl()}${path}`;
  const requestInit = { method, headers: finalHeaders, body: body !== undefined ? JSON.stringify(body) : undefined };
  let response = await fetch(url, requestInit);
  if (response.status === 202) {
    response = await pollUntilSettled(session, url, requestInit, response);
  }
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody?.message || `${path} failed with HTTP ${response.status}`);
  }
  return responseBody;
}

export const HMRC_SERVICES = ["vat", "itsa", "agent"];
export const HMRC_ACCOUNTS = ["synthetic", "live"];

const NO_GRANT_MESSAGE =
  "No HMRC authorisation is held for this session. Call request_hmrc_authorisation, show the user its link, " +
  "and call this tool again once they have granted access.";

/**
 * request_hmrc_authorisation: a new HMRC grant for this session, replacing any earlier one.
 * @param {Object} session
 * @param {{services?: string[], hmrcAccount?: string}} params
 * @returns {Promise<{url: string, expiresAt: string, scope: string, hmrcAccount: string}>}
 */
export async function requestHmrcAuthorisation(session, params = {}) {
  const services = params.services ?? ["vat"];
  const hmrcAccount = params.hmrcAccount ?? "live";
  if (!Array.isArray(services) || services.length === 0 || !services.every((service) => HMRC_SERVICES.includes(service))) {
    throw new Error(`request_hmrc_authorisation services must list one or more of ${HMRC_SERVICES.join(", ")}`);
  }
  if (!HMRC_ACCOUNTS.includes(hmrcAccount)) {
    throw new Error(`request_hmrc_authorisation hmrcAccount must be one of ${HMRC_ACCOUNTS.join(", ")}`);
  }
  const granted = await callSubmitApi(session, "/api/v1/mcp/hmrc-grants", { method: "POST", body: { services, hmrcAccount } });
  session.hmrcGrant = { grantId: granted.grantId, hmrcAccount: granted.hmrcAccount };
  return { url: granted.url, expiresAt: granted.expiresAt, scope: granted.scope, hmrcAccount: granted.hmrcAccount };
}

/**
 * The session's HMRC access token for one tool call, and the HMRC account it belongs to.
 * Throws a message naming request_hmrc_authorisation when the session holds no grant, when the
 * user has not finished the HMRC page, and when the call names the other HMRC account.
 * @param {Object} session
 * @param {string} toolName - named in the error messages
 * @param {string} [hmrcAccount] - the account the call asks for; the grant's own when omitted
 * @returns {Promise<{accessToken: string, hmrcAccount: string}>}
 */
export async function hmrcAccessTokenFor(session, toolName, hmrcAccount) {
  const grantId = session?.hmrcGrant?.grantId;
  if (!grantId) throw new Error(`${toolName}: ${NO_GRANT_MESSAGE}`);
  const grant = await callSubmitApi(session, `/api/v1/mcp/hmrc-grants/${encodeURIComponent(grantId)}`);
  if (grant.status !== "granted") {
    throw new Error(
      `${toolName}: the user has not finished granting HMRC access yet. Ask them to complete the page at the ` +
        "request_hmrc_authorisation link, then call this tool again.",
    );
  }
  if (hmrcAccount && hmrcAccount !== grant.hmrcAccount) {
    throw new Error(
      `${toolName}: the session's HMRC authorisation is for the ${grant.hmrcAccount} account, not ${hmrcAccount}. ` +
        `Call request_hmrc_authorisation with hmrcAccount ${hmrcAccount} first.`,
    );
  }
  return { accessToken: grant.accessToken, hmrcAccount: grant.hmrcAccount };
}

/**
 * list_vat_obligations: the open and fulfilled obligations for one VRN, or for one practice
 * client's VRN when clientId is given instead (hmrcVatObligationGet.js resolves it from the
 * client row; a client that is not this practice's own answers 403 client-not-found). The HMRC
 * access token is the session's HMRC grant's.
 * @param {Object} session
 * @param {{vrn?: string, clientId?: string, from?: string, to?: string, status?: string,
 *   hmrcAccount?: string, govTestScenario?: string}} params
 */
export async function listVatObligations(session, params = {}) {
  const { vrn, clientId, from, to, status, govTestScenario } = params;
  if (!vrn && !clientId) {
    throw new Error("list_vat_obligations requires vrn, or clientId to resolve it from the client row");
  }
  const { accessToken, hmrcAccount } = await hmrcAccessTokenFor(session, "list_vat_obligations", params.hmrcAccount);

  const query = new URLSearchParams();
  if (vrn) query.set("vrn", vrn);
  if (clientId) query.set("clientId", clientId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (status) query.set("status", status);
  if (govTestScenario) query.set("Gov-Test-Scenario", govTestScenario);

  const headers = { Authorization: `Bearer ${accessToken}`, hmrcAccount };

  return callSubmitApi(session, `/api/v1/hmrc/vat/obligation?${query.toString()}`, { customAuthorizer: true, headers });
}

// The VAT enquiry reads other than obligations: HMRC's liabilities, payments and penalties for one
// VRN over a date range, and one past return by its period key. They use the session's HMRC grant
// and the custom authoriser exactly as list_vat_obligations does.
async function vatEnquiry(session, toolName, route, params, extraQuery = {}) {
  const { vrn, from, to, govTestScenario } = params;
  if (!vrn) throw new Error(`${toolName} requires vrn`);
  const { accessToken, hmrcAccount } = await hmrcAccessTokenFor(session, toolName, params.hmrcAccount);
  const query = new URLSearchParams({ vrn });
  for (const [key, value] of Object.entries({ from, to, ...extraQuery })) {
    if (value) query.set(key, value);
  }
  if (govTestScenario) query.set("Gov-Test-Scenario", govTestScenario);
  return callSubmitApi(session, `${route}?${query.toString()}`, {
    customAuthorizer: true,
    headers: { Authorization: `Bearer ${accessToken}`, hmrcAccount },
  });
}

/**
 * list_vat_liabilities: what HMRC says the business owes for VAT, by period.
 * @param {Object} session
 * @param {{vrn: string, from?: string, to?: string, hmrcAccount?: string, govTestScenario?: string}} params
 */
export function listVatLiabilities(session, params = {}) {
  return vatEnquiry(session, "list_vat_liabilities", "/api/v1/hmrc/vat/liability", params);
}

/**
 * list_vat_payments: the VAT payments HMRC has received, by date.
 * @param {Object} session
 * @param {{vrn: string, from?: string, to?: string, hmrcAccount?: string, govTestScenario?: string}} params
 */
export function listVatPayments(session, params = {}) {
  return vatEnquiry(session, "list_vat_payments", "/api/v1/hmrc/vat/payment", params);
}

/**
 * list_vat_penalties: the VAT penalties and late-submission points HMRC holds.
 * @param {Object} session
 * @param {{vrn: string, from?: string, to?: string, hmrcAccount?: string, govTestScenario?: string}} params
 */
export function listVatPenalties(session, params = {}) {
  return vatEnquiry(session, "list_vat_penalties", "/api/v1/hmrc/vat/penalty", params);
}

/**
 * get_vat_return: one past return as HMRC holds it, by its period key.
 * @param {Object} session
 * @param {{vrn: string, periodKey: string, hmrcAccount?: string, govTestScenario?: string}} params
 */
export async function getVatReturn(session, params = {}) {
  const periodKey = requireField("get_vat_return", params, "periodKey");
  return vatEnquiry(session, "get_vat_return", "/api/v1/hmrc/vat/return", params, { periodKey });
}

const VAT_RETURN_BOX_FIELDS = [
  "vatDueSales",
  "vatDueAcquisitions",
  "vatReclaimedCurrPeriod",
  "totalValueSalesExVAT",
  "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT",
  "totalAcquisitionsExVAT",
];

/**
 * submit_vat_return: files the nine boxes the user has confirmed (seven filed fields; boxes 3 and
 * 5 are HMRC's own totals and the route derives them itself), for vatNumber or, when clientId is
 * given instead, for that practice client's own VRN (hmrcVatReturnPost.js resolves it from the
 * client row and ignores vatNumber; a client that is not this practice's own answers 403
 * client-not-authorised). Returns {receipt, hmrcResponse, hmrcResponseBody, periodKey, receiptId}
 * — the filed receipt sits under `receipt` (also duplicated at `hmrcResponseBody`), `periodKey` is
 * the obligation period this route resolved from periodStart/periodEnd, and `receiptId` is the
 * receipt's file name without its .json suffix (get_vat_receipt takes `${receiptId}.json`). The
 * HMRC access token is the session's HMRC grant's.
 * @param {Object} session
 * @param {{vatNumber?: string, clientId?: string, periodStart: string, periodEnd: string,
 *   vatDueSales: number, vatDueAcquisitions: number,
 *   vatReclaimedCurrPeriod: number, totalValueSalesExVAT: number, totalValuePurchasesExVAT: number,
 *   totalValueGoodsSuppliedExVAT: number, totalAcquisitionsExVAT: number,
 *   hmrcAccount?: string, govTestScenario?: string, runFraudPreventionHeaderValidation?: boolean,
 *   allowSyntheticObligations?: boolean}} params
 */
export async function submitVatReturn(session, params = {}) {
  const { vatNumber, clientId } = params;
  if (!vatNumber && !clientId) {
    throw new Error("submit_vat_return requires vatNumber, or clientId to resolve it from the client row");
  }
  const periodStart = requireField("submit_vat_return", params, "periodStart");
  const periodEnd = requireField("submit_vat_return", params, "periodEnd");
  const boxes = {};
  for (const field of VAT_RETURN_BOX_FIELDS) {
    boxes[field] = requireField("submit_vat_return", params, field);
  }
  const { govTestScenario, runFraudPreventionHeaderValidation, allowSyntheticObligations } = params;
  const { accessToken, hmrcAccount } = await hmrcAccessTokenFor(session, "submit_vat_return", params.hmrcAccount);

  const headers = { hmrcAccount };
  if (govTestScenario) headers["Gov-Test-Scenario"] = govTestScenario;

  return callSubmitApi(session, "/api/v1/hmrc/vat/return", {
    method: "POST",
    customAuthorizer: true,
    headers,
    body: {
      ...(vatNumber ? { vatNumber } : {}),
      ...(clientId ? { clientId } : {}),
      periodStart,
      periodEnd,
      accessToken,
      ...boxes,
      ...(runFraudPreventionHeaderValidation !== undefined ? { runFraudPreventionHeaderValidation } : {}),
      ...(allowSyntheticObligations !== undefined ? { allowSyntheticObligations } : {}),
    },
  });
}

/**
 * get_vat_receipt: a stored receipt by its file name. clientId narrows the fetch to one of the
 * practice's clients (hmrcReceiptGet.js checks the client belongs to this practice before
 * reading; a client that is not this practice's own answers 403 client-not-found) — it does not
 * change which receipt is read, since a receipt's key is the signed-in user's own regardless.
 * @param {Object} session
 * @param {{name: string, clientId?: string}} params
 */
export async function getVatReceipt(session, params = {}) {
  const name = requireField("get_vat_receipt", params, "name");
  const { clientId } = params;
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return callSubmitApi(session, `/api/v1/hmrc/receipt/${encodeURIComponent(name)}${query}`);
}

/**
 * list_vat_receipts: the stored receipts the account page lists, newest first as the route
 * answers them, each with the name get_vat_receipt takes. clientId narrows the list to one of the
 * practice's clients (hmrcReceiptGet.js answers 403 client-not-found for a client that is not this
 * practice's own).
 * @param {Object} session
 * @param {{clientId?: string}} params
 * @returns {Promise<{receipts: Object[]}>}
 */
export async function listVatReceipts(session, params = {}) {
  const { clientId } = params;
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return callSubmitApi(session, `/api/v1/hmrc/receipt${query}`);
}

const ACCOUNTS_STATEMENT_FIELDS = ["section477Exemption", "membersNotRequiredAudit", "directorsResponsibilities", "microEntityProvisions"];

/**
 * The body both companies-house/accounts routes take, common to the render and the submit
 * calls; the submit call adds companyAuthCode on top. Only the submit route resolves companyNumber
 * from a practice client's row (companiesHouseAccountsPost.js); the render route never reads
 * clientId at all, so allowClientId stays false there and companyNumber stays required.
 */
function accountsFilingBody(toolName, params, { allowClientId = false } = {}) {
  const clientId = allowClientId ? params?.clientId : undefined;
  if (!params?.companyNumber && !clientId) {
    requireField(toolName, params, "companyNumber");
  }
  const companyName = requireField(toolName, params, "companyName");
  const periodStart = requireField(toolName, params, "periodStart");
  const periodEnd = requireField(toolName, params, "periodEnd");
  const balanceSheet = requireField(toolName, params, "balanceSheet");
  const averageEmployees = requireField(toolName, params, "averageEmployees");
  const director = requireField(toolName, params, "director");
  const statementsAccepted = requireField(toolName, params, "statementsAccepted");
  for (const yearLabel of ["currentYear", "priorYear"]) {
    if (!balanceSheet?.[yearLabel]) throw new Error(`${toolName} requires balanceSheet.${yearLabel}`);
  }
  for (const field of ACCOUNTS_STATEMENT_FIELDS) {
    if (statementsAccepted?.[field] !== true) throw new Error(`${toolName} requires statementsAccepted.${field} to be accepted`);
  }
  return {
    ...(params.companyNumber ? { companyNumber: params.companyNumber } : {}),
    ...(clientId ? { clientId } : {}),
    companyName,
    periodStart,
    periodEnd,
    balanceSheet,
    averageEmployees: Number(averageEmployees),
    director,
    statementsAccepted,
  };
}

/**
 * render_micro_entity_accounts_sandbox: the rendered iXBRL for confirmed figures, without reaching the
 * Companies House XML Gateway. The render route never resolves a company from a practice
 * client's row, so this tool takes companyNumber only, not clientId.
 * @param {Object} session
 * @param {{companyNumber: string, companyName: string, periodStart: string, periodEnd: string,
 *   balanceSheet: {currentYear: Object, priorYear: Object}, averageEmployees: number,
 *   director: {name: string, dateApproved: string}, statementsAccepted: Object}} params
 */
export async function renderMicroEntityAccounts(session, params = {}) {
  const body = accountsFilingBody("render_micro_entity_accounts_sandbox", params);
  return callSubmitApi(session, "/api/v1/companies-house/accounts/render", { method: "POST", body });
}

/**
 * submit_micro_entity_accounts_sandbox: files confirmed figures with the company authentication code
 * the user typed on the page request_companies_house_codes linked to (the call carries the entry's
 * id, never the code; the route takes the entry once), for
 * companyNumber or, when clientId is given instead, for that practice client's own company number
 * (companiesHouseAccountsPost.js resolves it from the client row; a client that is not this
 * practice's own, or not yet authorised for Companies House filing, answers 403). Returns
 * {submissionNumber, gatewayTimestamp, pollInterval}; poll_accounts_submission_sandbox takes the
 * submissionNumber to reach the filing's outcome. This route answers synchronously (200/201),
 * unlike list_vat_obligations and submit_vat_return.
 * @param {Object} session
 * @param {Object} params - as renderMicroEntityAccounts, but companyNumber is optional when
 *   clientId is given, plus codesEntryId
 */
export async function submitMicroEntityAccounts(session, params = {}) {
  const codesEntryId = requireField("submit_micro_entity_accounts_sandbox", params, "codesEntryId");
  const body = accountsFilingBody("submit_micro_entity_accounts_sandbox", params, { allowClientId: true });
  return callSubmitApi(session, "/api/v1/companies-house/accounts", { method: "POST", body: { ...body, codesEntryId } });
}

/**
 * poll_accounts_submission_sandbox: the filing's outcome — {submissionNumber, statusCode, companyNumber,
 * rejections}, where statusCode is "PENDING" while Companies House has not answered yet, "ACCEPT"
 * once filed (with a receiptId added), or "REJECT" with rejections carrying the reasons.
 * @param {Object} session
 * @param {{submissionNumber: string}} params
 */
export async function pollAccountsSubmission(session, params = {}) {
  const submissionNumber = requireField("poll_accounts_submission_sandbox", params, "submissionNumber");
  return callSubmitApi(session, `/api/v1/companies-house/accounts/${encodeURIComponent(submissionNumber)}`);
}

/**
 * get_confirmation_statement_data_sandbox: the register data a confirmation statement form is built
 * from — MadeUpDate, NextDueDate, SIC codes, RegisteredEmailAddress, officers, PSCs,
 * StatementOfCapital, Shareholdings, TradingOnMarket, DTR5Applies, the PSC exemption flags, and
 * paymentPeriods/paymentPeriodPaid — over the deployed API. Confirmation statement routes never
 * resolve a company from a practice client's row, so this tool takes companyNumber only, not
 * clientId. Takes the company authentication code on this one call only; it is not stored.
 * @param {Object} session
 * @param {{companyNumber: string, codesEntryId: string, madeUpDate: string, companyType?: string}} params
 */
export async function getConfirmationStatementData(session, params = {}) {
  const companyNumber = requireField("get_confirmation_statement_data_sandbox", params, "companyNumber");
  const codesEntryId = requireField("get_confirmation_statement_data_sandbox", params, "codesEntryId");
  const madeUpDate = requireField("get_confirmation_statement_data_sandbox", params, "madeUpDate");
  const { companyType } = params;

  return callSubmitApi(session, `/api/v1/companies-house/company/${encodeURIComponent(companyNumber)}/filing-data`, {
    method: "POST",
    body: { codesEntryId, madeUpDate, ...(companyType !== undefined ? { companyType } : {}) },
  });
}

/**
 * The body both companies-house/confirmation-statement routes take, common to the render and the
 * submit calls; the submit call adds companyAuthCode on top. Confirmation statement routes never
 * resolve a company from a practice client's row, unlike the accounts routes, so companyNumber is
 * always required.
 */
function confirmationStatementFilingBody(toolName, params) {
  const companyNumber = requireField(toolName, params, "companyNumber");
  const companyName = requireField(toolName, params, "companyName");
  const dateSigned = requireField(toolName, params, "dateSigned");
  const reviewDate = requireField(toolName, params, "reviewDate");
  const directors = requireField(toolName, params, "directors");
  if (!Array.isArray(directors) || directors.length === 0) {
    throw new Error(`${toolName} requires at least one director`);
  }
  if (params.lawfulPurposeStatementAccepted !== true) {
    throw new Error(`${toolName} requires lawfulPurposeStatementAccepted to be accepted`);
  }
  if (params.stateConfirmationAccepted !== true) {
    throw new Error(`${toolName} requires stateConfirmationAccepted to be accepted`);
  }
  const { sicCodes, statementOfCapital, shareholdings, registeredEmailAddress } = params;
  return {
    companyNumber,
    companyName,
    dateSigned,
    reviewDate,
    directors,
    lawfulPurposeStatementAccepted: true,
    stateConfirmationAccepted: true,
    ...(sicCodes !== undefined ? { sicCodes } : {}),
    ...(statementOfCapital !== undefined ? { statementOfCapital } : {}),
    ...(shareholdings !== undefined ? { shareholdings } : {}),
    ...(registeredEmailAddress !== undefined ? { registeredEmailAddress } : {}),
  };
}

const RENDER_PLACEHOLDER_PERSONAL_CODE = "AAAAAA00000";

/**
 * render_confirmation_statement_sandbox: the rendered ConfirmationAndVerificationStatement body for
 * confirmed answers, without reaching the Companies House XML Gateway. Every director's personal
 * code is masked in the rendered body before it leaves the route.
 * @param {Object} session
 * @param {{companyNumber: string, companyName: string, dateSigned: string, reviewDate: string,
 *   sicCodes?: string[], statementOfCapital?: Object, shareholdings?: Object[],
 *   registeredEmailAddress?: string, lawfulPurposeStatementAccepted: true, stateConfirmationAccepted: true,
 *   directors: {forename: string, surname: string, dob: string}[]}} params
 */
export async function renderConfirmationStatement(session, params = {}) {
  const body = confirmationStatementFilingBody("render_confirmation_statement_sandbox", params);
  // The route validates a personal code on every director and masks it in the rendered body, so a
  // preview sends a code-shaped placeholder and the user never types a real one into the chat.
  body.directors = body.directors.map((director) => ({ ...director, personalCode: RENDER_PLACEHOLDER_PERSONAL_CODE }));
  return callSubmitApi(session, "/api/v1/companies-house/confirmation-statement/render", { method: "POST", body });
}

/**
 * submit_confirmation_statement_sandbox: files confirmed answers with the company authentication code
 * and every director's personal code, which the user typed on the page request_companies_house_codes
 * linked to; the directors array must list the directors that link was minted for, in the same
 * order, and the route puts each personal code on its director. Returns
 * {submissionNumber, gatewayTimestamp, pollInterval}; poll_confirmation_statement_sandbox takes the
 * submissionNumber to reach the filing's outcome. This route answers synchronously (200/201),
 * unlike list_vat_obligations and submit_vat_return.
 * @param {Object} session
 * @param {Object} params - as renderConfirmationStatement without the personal codes, plus codesEntryId
 */
export async function submitConfirmationStatement(session, params = {}) {
  const codesEntryId = requireField("submit_confirmation_statement_sandbox", params, "codesEntryId");
  const body = confirmationStatementFilingBody("submit_confirmation_statement_sandbox", params);
  return callSubmitApi(session, "/api/v1/companies-house/confirmation-statement", { method: "POST", body: { ...body, codesEntryId } });
}

/**
 * poll_confirmation_statement_sandbox: the filing's outcome — {submissionNumber, statusCode,
 * companyNumber, rejections}, where statusCode is "PENDING" while Companies House has not
 * answered yet, "ACCEPT" once filed (with a receiptId added), or "REJECT" with rejections
 * carrying the reasons.
 * @param {Object} session
 * @param {{submissionNumber: string}} params
 */
export async function pollConfirmationStatement(session, params = {}) {
  const submissionNumber = requireField("poll_confirmation_statement_sandbox", params, "submissionNumber");
  return callSubmitApi(session, `/api/v1/companies-house/confirmation-statement/${encodeURIComponent(submissionNumber)}`);
}

const CODES_KINDS = ["accounts", "confirmation-statement", "confirmation-statement-data"];

/**
 * request_companies_house_codes: mints a codes entry and answers the link where the user types the
 * Companies House codes. The entry expires in ten minutes. A single entry is used up by the first
 * filing call that names it. With clientIds the entry is a batch entry: the page asks for one
 * company authentication code per practice client, and each filing call takes its own client's
 * codes, so run_for_clients can pass the one entryId. Answers {entryId, url, expiresAt}; the
 * filing tool takes entryId as codesEntryId.
 * @param {Object} session
 * @param {{kind: "accounts"|"confirmation-statement"|"confirmation-statement-data", companyNumber?: string,
 *   directors?: {forename: string, surname: string}[], clientIds?: string[]}} params - directors are the
 *   confirmation statement's directors, in the order the filing lists them; companyNumber is required
 *   unless clientIds is given
 */
export async function requestCompaniesHouseCodes(session, params = {}) {
  const kind = requireField("request_companies_house_codes", params, "kind");
  if (!CODES_KINDS.includes(kind)) throw new Error(`request_companies_house_codes kind must be one of ${CODES_KINDS.join(", ")}`);
  if (params.clientIds !== undefined) {
    if (!Array.isArray(params.clientIds) || params.clientIds.length === 0) {
      throw new Error("request_companies_house_codes clientIds must list at least one client id");
    }
    const { clients: practiceClients } = await callSubmitApi(session, "/api/v1/practice/clients");
    const clients = params.clientIds.map((clientId) => {
      const found = practiceClients.find((client) => client.clientId === clientId);
      if (!found) throw new Error(`request_companies_house_codes clientIds names ${clientId}, which is not in the practice's client list`);
      return { clientId, displayName: found.displayName };
    });
    return callSubmitApi(session, "/api/v1/mcp/codes-entries", { method: "POST", body: { kind, clients } });
  }
  const companyNumber = requireField("request_companies_house_codes", params, "companyNumber");
  const directors = kind === "confirmation-statement" ? requireField("request_companies_house_codes", params, "directors") : undefined;
  return callSubmitApi(session, "/api/v1/mcp/codes-entries", {
    method: "POST",
    body: { kind, companyNumber, ...(directors ? { directors } : {}) },
  });
}
