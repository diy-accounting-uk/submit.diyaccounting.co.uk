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

function requireField(toolName, params, key) {
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
 * @param {string} path - the route, e.g. "/api/v1/hmrc/vat/obligation?vrn=..."
 * @param {{method?: string, body?: Object, headers?: Object, customAuthorizer?: boolean}} [options]
 */
async function callSubmitApi(path, { method = "GET", body, headers = {}, customAuthorizer = false } = {}) {
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
 * list_vat_obligations: the open and fulfilled obligations for one VRN.
 * @param {Object} _session - unused; this tool carries no local session state
 * @param {{vrn: string, from?: string, to?: string, status?: string, hmrcAccessToken: string,
 *   hmrcAccount?: string, govTestScenario?: string}} params
 */
export async function listVatObligations(_session, params = {}) {
  const vrn = requireField("list_vat_obligations", params, "vrn");
  const hmrcAccessToken = requireField("list_vat_obligations", params, "hmrcAccessToken");
  const { from, to, status, hmrcAccount, govTestScenario } = params;

  const query = new URLSearchParams({ vrn });
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
 * 5 are HMRC's own totals and the route derives them itself). Returns
 * {receipt, hmrcResponse, hmrcResponseBody, periodKey, receiptId} — the filed receipt sits under
 * `receipt` (also duplicated at `hmrcResponseBody`), `periodKey` is the obligation period this
 * route resolved from periodStart/periodEnd, and `receiptId` is the name get_vat_receipt takes.
 * @param {Object} _session
 * @param {{vatNumber: string, periodStart: string, periodEnd: string, hmrcAccessToken: string,
 *   vatDueSales: number, vatDueAcquisitions: number, vatReclaimedCurrPeriod: number,
 *   totalValueSalesExVAT: number, totalValuePurchasesExVAT: number,
 *   totalValueGoodsSuppliedExVAT: number, totalAcquisitionsExVAT: number,
 *   hmrcAccount?: string, govTestScenario?: string, runFraudPreventionHeaderValidation?: boolean,
 *   allowSyntheticObligations?: boolean}} params
 */
export async function submitVatReturn(_session, params = {}) {
  const vatNumber = requireField("submit_vat_return", params, "vatNumber");
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
      vatNumber,
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
 * get_vat_receipt: a stored receipt by its file name.
 * @param {Object} _session
 * @param {{name: string}} params
 */
export async function getVatReceipt(_session, params = {}) {
  const name = requireField("get_vat_receipt", params, "name");
  return callSubmitApi(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`);
}

const ACCOUNTS_STATEMENT_FIELDS = ["section477Exemption", "membersNotRequiredAudit", "directorsResponsibilities", "microEntityProvisions"];

/**
 * The body both companies-house/accounts routes take, common to the preview and the submit
 * calls; the submit call adds companyAuthCode on top.
 */
function accountsFilingBody(toolName, params) {
  const companyNumber = requireField(toolName, params, "companyNumber");
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
    companyNumber,
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
 * Companies House XML Gateway.
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
 * (6 to 8 characters — Companies House's own format, checked by the route, not by this tool).
 * Returns {submissionNumber, gatewayTimestamp, pollInterval}; poll_accounts_submission takes the
 * submissionNumber to reach the filing's outcome. This route answers synchronously (200/201),
 * unlike list_vat_obligations and submit_vat_return.
 * @param {Object} _session
 * @param {Object} params - as previewMicroEntityAccounts, plus companyAuthCode
 */
export async function submitMicroEntityAccounts(_session, params = {}) {
  const companyAuthCode = requireField("submit_micro_entity_accounts", params, "companyAuthCode");
  const body = accountsFilingBody("submit_micro_entity_accounts", params);
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
