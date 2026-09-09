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
};

/**
 * Reset all state (call between tests)
 */
export function reset() {
  state.submittedReturns.clear();
  state.authorizationCodes.clear();
  state.tokens.clear();
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

export default state;
