// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/state/store.js
// In-memory state store for the HTTP simulator

const state = {
  // Submitted VAT returns keyed by `${vrn}:${periodKey}`
  submittedReturns: new Map(),
  // Authorization codes keyed by code value
  authorizationCodes: new Map(),
  // Tokens keyed by access token value
  tokens: new Map(),
  // Businesses created through the Self Assessment Test Support API, keyed by normalised NINO
  testSupportBusinesses: new Map(),
  // HMRC Assist reports issued by this simulator, keyed by reportId
  assistReports: new Map(),
  // Self-employment period summaries held for a business, keyed by `${nino}:${businessId}:${periodId}`
  // for a dated period and `${nino}:${businessId}:${taxYear}` for a cumulative tax year
  periodSummaries: new Map(),
  // Foreign properties created through Create Foreign Property Details, keyed by `${nino}:${businessId}`
  foreignProperties: new Map(),
};

/**
 * Reset all state (call between tests)
 */
export function reset() {
  state.submittedReturns.clear();
  state.authorizationCodes.clear();
  state.tokens.clear();
  state.testSupportBusinesses.clear();
  state.assistReports.clear();
  state.periodSummaries.clear();
  state.foreignProperties.clear();
}

/**
 * Remember the period summary a create or amend call sent, so a later read returns it
 * @param {string} key - `${nino}:${businessId}:${periodId or taxYear}`, NINO upper case without spaces
 * @param {Object} summary - Period summary body
 */
export function storePeriodSummary(key, summary) {
  state.periodSummaries.set(key, summary);
}

/**
 * Get the period summary an earlier create or amend call stored
 * @param {string} key - Key the summary was stored under
 * @returns {Object|undefined}
 */
export function getPeriodSummary(key) {
  return state.periodSummaries.get(key);
}

/**
 * Build the key a self-employment period summary is stored under
 * @param {string} nino - National Insurance number
 * @param {string} businessId - Business ID
 * @param {string} periodOrTaxYear - Period ID of a dated period, or tax year of a cumulative total
 * @returns {string}
 */
export function periodSummaryKey(nino, businessId, periodOrTaxYear) {
  return `${String(nino).replace(/\s+/g, "").toUpperCase()}:${businessId}:${periodOrTaxYear}`;
}

/**
 * Remember an HMRC Assist report this simulator issued
 * @param {string} reportId - Report id
 * @param {Object} data - Identifiers and correlation id the report was issued with
 */
export function storeAssistReport(reportId, data) {
  state.assistReports.set(reportId, data);
}

/**
 * Get an issued HMRC Assist report
 * @param {string} reportId - Report id
 * @returns {Object|undefined}
 */
export function getAssistReport(reportId) {
  return state.assistReports.get(reportId);
}

/**
 * Store a submitted VAT return
 * @param {string} vrn - VAT registration number
 * @param {string} periodKey - Period key
 * @param {Object} data - Return data
 */
export function storeReturn(vrn, periodKey, data) {
  state.submittedReturns.set(`${vrn}:${periodKey}`, data);
}

/**
 * Get a submitted VAT return
 * @param {string} vrn - VAT registration number
 * @param {string} periodKey - Period key
 * @returns {Object|undefined}
 */
export function getReturn(vrn, periodKey) {
  return state.submittedReturns.get(`${vrn}:${periodKey}`);
}

/**
 * Store an authorization code
 * @param {string} code - Authorization code
 * @param {Object} data - Associated data (client_id, redirect_uri, username, etc.)
 */
export function storeAuthorizationCode(code, data) {
  state.authorizationCodes.set(code, {
    ...data,
    createdAt: Date.now(),
  });
}

/**
 * Get and consume an authorization code
 * @param {string} code - Authorization code
 * @returns {Object|undefined}
 */
export function consumeAuthorizationCode(code) {
  const data = state.authorizationCodes.get(code);
  state.authorizationCodes.delete(code);
  return data;
}

/**
 * Store a token
 * @param {string} accessToken - Access token
 * @param {Object} data - Token data
 */
export function storeToken(accessToken, data) {
  state.tokens.set(accessToken, data);
}

/**
 * Get token data
 * @param {string} accessToken - Access token
 * @returns {Object|undefined}
 */
export function getToken(accessToken) {
  return state.tokens.get(accessToken);
}

function normaliseNino(nino) {
  return String(nino).replace(/\s+/g, "").toUpperCase();
}

/**
 * Record a business created through the Self Assessment Test Support API against a NINO, so the
 * ITSA Business Details list can hand it back to the run that created it.
 * @param {string} nino - National Insurance number
 * @param {Object} business - the business, carrying at least businessId and typeOfBusiness
 */
export function addTestSupportBusiness(nino, business) {
  const key = normaliseNino(nino);
  const businesses = state.testSupportBusinesses.get(key) || [];
  businesses.push(business);
  state.testSupportBusinesses.set(key, businesses);
}

/**
 * Get every business created through the Self Assessment Test Support API for a NINO.
 * @param {string} nino - National Insurance number
 * @returns {Object[]}
 */
export function getTestSupportBusinesses(nino) {
  return state.testSupportBusinesses.get(normaliseNino(nino)) || [];
}

/**
 * Remember a foreign property created through Create Foreign Property Details.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - Business ID
 * @param {Object} property - carries propertyId, propertyName, countryCode and submittedOn, and optionally endDate and endReason
 */
export function addForeignProperty(nino, businessId, property) {
  const key = `${normaliseNino(nino)}:${businessId}`;
  const properties = state.foreignProperties.get(key) || [];
  properties.push(property);
  state.foreignProperties.set(key, properties);
}

/**
 * Get the foreign properties created for a NINO and business ID.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - Business ID
 * @returns {Object[]}
 */
export function getForeignProperties(nino, businessId) {
  return state.foreignProperties.get(`${normaliseNino(nino)}:${businessId}`) || [];
}

/**
 * Get every foreign property created for a NINO, across its businesses.
 * @param {string} nino - National Insurance number
 * @returns {Object[]}
 */
export function getForeignPropertiesForNino(nino) {
  const prefix = `${normaliseNino(nino)}:`;
  return [...state.foreignProperties.entries()].filter(([key]) => key.startsWith(prefix)).flatMap(([, properties]) => properties);
}

/**
 * Find a foreign property by its propertyId across the businesses of a NINO.
 * @param {string} nino - National Insurance number
 * @param {string} propertyId - Property ID
 * @returns {Object|undefined} the stored property, which a caller may change in place
 */
export function findForeignProperty(nino, propertyId) {
  return getForeignPropertiesForNino(nino).find((property) => property.propertyId === propertyId);
}

export default state;
