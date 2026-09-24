// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// submit-tools.js -- the Submit-facing tools over the deployed REST API: the figures
// derive_vat_return and derive_micro_entity_accounts answered, filed or fetched through this
// service's own HMRC and Companies House routes. Like practice-tools.js, these reach DIY
// Accounting Submit's deployed API rather than the local filesystem or the engine.
//
// Configuration comes from the environment: DIYA_SUBMIT_BASE_URL (the deployed site's base URL)
// and DIYA_SUBMIT_ACCESS_TOKEN (the signed-in user's own session bearer token). Two routes here
// (list_vat_obligations, submit_vat_return) sit behind the API's custom Lambda authoriser, whose
// identity source is the X-Authorization header (ApiStack.java), which frees the plain
// Authorization header for the HMRC access token those two routes read directly
// (hmrcVatObligationGet.js reads it from the header; hmrcVatReturnPost.js takes it as the body's
// accessToken field). Every other route here sits behind the standard Cognito JWT authoriser, so
// the session bearer goes in the plain Authorization header, as practice-tools.js sends it.
//
// Obtaining the session bearer and the HMRC access token is outside this tool's scope.

function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

function sessionToken() {
  const value = process.env.DIYA_SUBMIT_ACCESS_TOKEN;
  if (!value) throw new Error("DIYA_SUBMIT_ACCESS_TOKEN is not set");
  return value;
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

async function pollUntilSettled(url, requestInit, firstResponse) {
  let response = firstResponse;
  const pollHeaders = { ...requestInit.headers };
  delete pollHeaders["x-initial-request"];
  const requestId = response.headers.get("x-request-id");
  if (requestId) pollHeaders["x-request-id"] = requestId;
  const pollUrl = response.headers.get("Location") || url;

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS && response.status === 202; attempt += 1) {
    const delayMs = Math.min(POLL_INTERVAL_MS * 2 ** (attempt - 1), POLL_BACKOFF_MAX_MS);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    response = await fetch(url, { ...requestInit, headers: pollHeaders });
  }

  if (response.status === 202) {
    throw new Error(`Timed out after ${POLL_MAX_ATTEMPTS} polls waiting for ${pollUrl} to complete`);
  }
  return response;
}

/**
 * Calls one of this service's own API routes with the session bearer token, over the custom
 * authoriser's X-Authorization header when customAuthorizer is set, or the standard Authorization
 * header otherwise; extra headers (an HMRC access token, Gov-Test-Scenario, hmrcAccount) merge in
 * on top and are never overwritten by the session header. A 202 response is polled to a terminal
 * status before this returns (see pollUntilSettled); a poll that never settles throws with the
 * poll URL in the message rather than returning a partial result.
 * Exported so practice-tools.js's client tools (list_clients, add_client, invite_client,
 * client_authorisation_status) call the same routes over the same HTTP layer rather than a
 * second one of their own.
 * @param {string} path - the route, e.g. "/api/v1/hmrc/vat/obligation?vrn=..."
 * @param {{method?: string, body?: Object, headers?: Object, customAuthorizer?: boolean}} [options]
 */
export async function callSubmitApi(path, { method = "GET", body, headers = {}, customAuthorizer = false } = {}) {
  const sessionHeaderName = customAuthorizer ? "X-Authorization" : "Authorization";
  const finalHeaders = { [sessionHeaderName]: `Bearer ${sessionToken()}`, "x-initial-request": "true", ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  const url = `${baseUrl()}${path}`;
  const requestInit = { method, headers: finalHeaders, body: body !== undefined ? JSON.stringify(body) : undefined };
  let response = await fetch(url, requestInit);
  if (response.status === 202) {
    response = await pollUntilSettled(url, requestInit, response);
  }
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody?.message || `${path} failed with HTTP ${response.status}`);
  }
  return responseBody;
}

/**
 * list_vat_obligations: the open and fulfilled obligations for one VRN, or for one practice
 * client's VRN when clientId is given instead (hmrcVatObligationGet.js resolves it from the
 * client row; a client that is not this practice's own answers 403 client-not-found).
 * @param {Object} _session - unused; this tool carries no local session state
 * @param {{vrn?: string, clientId?: string, from?: string, to?: string, status?: string,
 *   hmrcAccessToken: string, hmrcAccount?: string, govTestScenario?: string}} params
 */
export async function listVatObligations(_session, params = {}) {
  const { vrn, clientId, from, to, status, hmrcAccount, govTestScenario } = params;
  if (!vrn && !clientId) {
    throw new Error("list_vat_obligations requires vrn, or clientId to resolve it from the client row");
  }
  const hmrcAccessToken = requireField("list_vat_obligations", params, "hmrcAccessToken");

  const query = new URLSearchParams();
  if (vrn) query.set("vrn", vrn);
  if (clientId) query.set("clientId", clientId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (status) query.set("status", status);
  if (govTestScenario) query.set("Gov-Test-Scenario", govTestScenario);

  const headers = { Authorization: `Bearer ${hmrcAccessToken}` };
  if (hmrcAccount) headers.hmrcAccount = hmrcAccount;

  return callSubmitApi(`/api/v1/hmrc/vat/obligation?${query.toString()}`, { customAuthorizer: true, headers });
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
 * name get_vat_receipt takes.
 * @param {Object} _session
 * @param {{vatNumber?: string, clientId?: string, periodStart: string, periodEnd: string,
 *   hmrcAccessToken: string, vatDueSales: number, vatDueAcquisitions: number,
 *   vatReclaimedCurrPeriod: number, totalValueSalesExVAT: number, totalValuePurchasesExVAT: number,
 *   totalValueGoodsSuppliedExVAT: number, totalAcquisitionsExVAT: number,
 *   hmrcAccount?: string, govTestScenario?: string, runFraudPreventionHeaderValidation?: boolean,
 *   allowSyntheticObligations?: boolean}} params
 */
export async function submitVatReturn(_session, params = {}) {
  const { vatNumber, clientId } = params;
  if (!vatNumber && !clientId) {
    throw new Error("submit_vat_return requires vatNumber, or clientId to resolve it from the client row");
  }
  const periodStart = requireField("submit_vat_return", params, "periodStart");
  const periodEnd = requireField("submit_vat_return", params, "periodEnd");
  const hmrcAccessToken = requireField("submit_vat_return", params, "hmrcAccessToken");
  const boxes = {};
  for (const field of VAT_RETURN_BOX_FIELDS) {
    boxes[field] = requireField("submit_vat_return", params, field);
  }
  const { hmrcAccount, govTestScenario, runFraudPreventionHeaderValidation, allowSyntheticObligations } = params;

  const headers = {};
  if (hmrcAccount) headers.hmrcAccount = hmrcAccount;
  if (govTestScenario) headers["Gov-Test-Scenario"] = govTestScenario;

  return callSubmitApi("/api/v1/hmrc/vat/return", {
    method: "POST",
    customAuthorizer: true,
    headers,
    body: {
      ...(vatNumber ? { vatNumber } : {}),
      ...(clientId ? { clientId } : {}),
      periodStart,
      periodEnd,
      accessToken: hmrcAccessToken,
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
 * @param {Object} _session
 * @param {{name: string, clientId?: string}} params
 */
export async function getVatReceipt(_session, params = {}) {
  const name = requireField("get_vat_receipt", params, "name");
  const { clientId } = params;
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return callSubmitApi(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}${query}`);
}

const ACCOUNTS_STATEMENT_FIELDS = ["section477Exemption", "membersNotRequiredAudit", "directorsResponsibilities", "microEntityProvisions"];

/**
 * The body both companies-house/accounts routes take, common to the preview and the submit
 * calls; the submit call adds companyAuthCode on top. Only the submit route resolves companyNumber
 * from a practice client's row (companiesHouseAccountsPost.js); the preview route never reads
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
 * preview_micro_entity_accounts: the rendered iXBRL for confirmed figures, without reaching the
 * Companies House XML Gateway. The preview route never resolves a company from a practice
 * client's row, so this tool takes companyNumber only, not clientId.
 * @param {Object} _session
 * @param {{companyNumber: string, companyName: string, periodStart: string, periodEnd: string,
 *   balanceSheet: {currentYear: Object, priorYear: Object}, averageEmployees: number,
 *   director: {name: string, dateApproved: string}, statementsAccepted: Object}} params
 */
export async function previewMicroEntityAccounts(_session, params = {}) {
  const body = accountsFilingBody("preview_micro_entity_accounts", params);
  return callSubmitApi("/api/v1/companies-house/accounts/preview", { method: "POST", body });
}

/**
 * submit_micro_entity_accounts: files confirmed figures with the company authentication code
 * (6 to 8 characters — Companies House's own format, checked by the route, not by this tool), for
 * companyNumber or, when clientId is given instead, for that practice client's own company number
 * (companiesHouseAccountsPost.js resolves it from the client row; a client that is not this
 * practice's own, or not yet authorised for Companies House filing, answers 403). Returns
 * {submissionNumber, gatewayTimestamp, pollInterval}; poll_accounts_submission takes the
 * submissionNumber to reach the filing's outcome. This route answers synchronously (200/201),
 * unlike list_vat_obligations and submit_vat_return.
 * @param {Object} _session
 * @param {Object} params - as previewMicroEntityAccounts, but companyNumber is optional when
 *   clientId is given, plus companyAuthCode
 */
export async function submitMicroEntityAccounts(_session, params = {}) {
  const companyAuthCode = requireField("submit_micro_entity_accounts", params, "companyAuthCode");
  const body = accountsFilingBody("submit_micro_entity_accounts", params, { allowClientId: true });
  return callSubmitApi("/api/v1/companies-house/accounts", { method: "POST", body: { ...body, companyAuthCode } });
}

/**
 * poll_accounts_submission: the filing's outcome — {submissionNumber, statusCode, companyNumber,
 * rejections}, where statusCode is "PENDING" while Companies House has not answered yet, "ACCEPT"
 * once filed (with a receiptId added), or "REJECT" with rejections carrying the reasons.
 * @param {Object} _session
 * @param {{submissionNumber: string}} params
 */
export async function pollAccountsSubmission(_session, params = {}) {
  const submissionNumber = requireField("poll_accounts_submission", params, "submissionNumber");
  return callSubmitApi(`/api/v1/companies-house/accounts/${encodeURIComponent(submissionNumber)}`);
}

/**
 * get_confirmation_statement_data: the register data a confirmation statement form is built
 * from — MadeUpDate, NextDueDate, SIC codes, RegisteredEmailAddress, officers, PSCs,
 * StatementOfCapital, Shareholdings, TradingOnMarket, DTR5Applies, the PSC exemption flags, and
 * paymentPeriods/paymentPeriodPaid — over the deployed API. Confirmation statement routes never
 * resolve a company from a practice client's row, so this tool takes companyNumber only, not
 * clientId. Takes the company authentication code on this one call only; it is not stored.
 * @param {Object} _session
 * @param {{companyNumber: string, companyAuthCode: string, madeUpDate: string, companyType?: string}} params
 */
export async function getConfirmationStatementData(_session, params = {}) {
  const companyNumber = requireField("get_confirmation_statement_data", params, "companyNumber");
  const companyAuthCode = requireField("get_confirmation_statement_data", params, "companyAuthCode");
  const madeUpDate = requireField("get_confirmation_statement_data", params, "madeUpDate");
  const { companyType } = params;

  return callSubmitApi(`/api/v1/companies-house/company/${encodeURIComponent(companyNumber)}/filing-data`, {
    method: "POST",
    body: { companyAuthCode, madeUpDate, ...(companyType !== undefined ? { companyType } : {}) },
  });
}

/**
 * The body both companies-house/confirmation-statement routes take, common to the preview and the
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
  const { sicCodes, statementOfCapital, shareholdings, registeredEmailAddress } = params;
  return {
    companyNumber,
    companyName,
    dateSigned,
    reviewDate,
    directors,
    lawfulPurposeStatementAccepted: true,
    ...(sicCodes !== undefined ? { sicCodes } : {}),
    ...(statementOfCapital !== undefined ? { statementOfCapital } : {}),
    ...(shareholdings !== undefined ? { shareholdings } : {}),
    ...(registeredEmailAddress !== undefined ? { registeredEmailAddress } : {}),
  };
}

/**
 * preview_confirmation_statement: the rendered ConfirmationAndVerificationStatement body for
 * confirmed answers, without reaching the Companies House XML Gateway. Every director's personal
 * code is masked in the rendered body before it leaves the route.
 * @param {Object} _session
 * @param {{companyNumber: string, companyName: string, dateSigned: string, reviewDate: string,
 *   sicCodes?: string[], statementOfCapital?: Object, shareholdings?: Object[],
 *   registeredEmailAddress?: string, lawfulPurposeStatementAccepted: true,
 *   directors: {forename: string, surname: string, dob: string, personalCode: string}[]}} params
 */
export async function previewConfirmationStatement(_session, params = {}) {
  const body = confirmationStatementFilingBody("preview_confirmation_statement", params);
  return callSubmitApi("/api/v1/companies-house/confirmation-statement/preview", { method: "POST", body });
}

/**
 * submit_confirmation_statement: files confirmed answers with the company authentication code
 * (6 to 8 characters — Companies House's own format, checked by the route, not by this tool) and
 * every director's personal code (11 characters each, carried on the directors array). Returns
 * {submissionNumber, gatewayTimestamp, pollInterval}; poll_confirmation_statement takes the
 * submissionNumber to reach the filing's outcome. This route answers synchronously (200/201),
 * unlike list_vat_obligations and submit_vat_return.
 * @param {Object} _session
 * @param {Object} params - as previewConfirmationStatement, plus companyAuthCode
 */
export async function submitConfirmationStatement(_session, params = {}) {
  const companyAuthCode = requireField("submit_confirmation_statement", params, "companyAuthCode");
  const body = confirmationStatementFilingBody("submit_confirmation_statement", params);
  return callSubmitApi("/api/v1/companies-house/confirmation-statement", { method: "POST", body: { ...body, companyAuthCode } });
}

/**
 * poll_confirmation_statement: the filing's outcome — {submissionNumber, statusCode,
 * companyNumber, rejections}, where statusCode is "PENDING" while Companies House has not
 * answered yet, "ACCEPT" once filed (with a receiptId added), or "REJECT" with rejections
 * carrying the reasons.
 * @param {Object} _session
 * @param {{submissionNumber: string}} params
 */
export async function pollConfirmationStatement(_session, params = {}) {
  const submissionNumber = requireField("poll_confirmation_statement", params, "submissionNumber");
  return callSubmitApi(`/api/v1/companies-house/confirmation-statement/${encodeURIComponent(submissionNumber)}`);
}
