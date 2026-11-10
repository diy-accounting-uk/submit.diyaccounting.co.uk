// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/companiesHouseGrantTestDouble.js
// Test double for app/lib/companiesHouseGrantAccess.js. A test names a Companies House grant in
// the x-companies-house-grant header and the double resolves that grant id to the access token
// the test expects, with no grants table behind it.
//
// Use it in a test file:
//   vi.mock("@app/lib/companiesHouseGrantAccess.js", async (importOriginal) =>
//     (await import("@app/test-helpers/companiesHouseGrantTestDouble.js")).companiesHouseGrantAccessDouble(await importOriginal()),
//   );
//   headers: { ...companiesHouseGrantHeader("test-ch-access-token") }

import { createHash } from "node:crypto";

export const COMPANIES_HOUSE_GRANT_HEADER = "x-companies-house-grant";

const tokenByGrantId = new Map();

/**
 * The grant id that resolves to the given Companies House access token. The id has the shape of
 * a real grant id and is the same for the same token.
 * @param {string} [token]
 * @returns {string}
 */
export function companiesHouseGrantIdFor(token = "test-token") {
  const hex = createHash("sha256").update(`companies-house-grant-test-double:${token}`).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  tokenByGrantId.set(id, token);
  return id;
}

/**
 * The request header that names a grant resolving to the given Companies House access token.
 * @param {string} [token]
 * @returns {Object}
 */
export function companiesHouseGrantHeader(token = "test-token") {
  return { [COMPANIES_HOUSE_GRANT_HEADER]: companiesHouseGrantIdFor(token) };
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

/**
 * The replacement module for app/lib/companiesHouseGrantAccess.js: the original exports, with the
 * function that opens a grant answering the ids this double issued with their token and no
 * company. Any other id goes to the real module.
 * @param {Object} original - the module's real exports, from importOriginal()
 * @returns {Object}
 */
export function companiesHouseGrantAccessDouble(original) {
  return {
    ...original,
    companiesHouseAccessFromEvent: async (event, userSub) => {
      const grantId = headerValue(event.headers, COMPANIES_HOUSE_GRANT_HEADER);
      return tokenByGrantId.has(grantId)
        ? { accessToken: tokenByGrantId.get(grantId), companyNumber: null }
        : original.companiesHouseAccessFromEvent(event, userSub);
    },
  };
}
