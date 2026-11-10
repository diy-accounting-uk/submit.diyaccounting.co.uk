// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/hmrcGrantTestDouble.js
// Test double for app/lib/mcpHmrcGrantAccess.js. A test names an HMRC grant in the
// x-mcp-hmrc-grant header and the double resolves that grant id to the HMRC access token the
// test expects, with no grants table behind it.
//
// Use it in a test file:
//   vi.mock("@app/lib/mcpHmrcGrantAccess.js", async (importOriginal) =>
//     (await import("@app/test-helpers/hmrcGrantTestDouble.js")).hmrcGrantAccessDouble(await importOriginal()),
//   );
//   headers: { ...hmrcGrantHeader("test-token") }

import { createHash } from "node:crypto";

export const HMRC_GRANT_HEADER = "x-mcp-hmrc-grant";

const tokenByGrantId = new Map();

/**
 * The grant id that resolves to the given HMRC access token. The id has the shape of a real
 * grant id and is the same for the same token.
 * @param {string} [token]
 * @returns {string}
 */
export function grantIdFor(token = "test-token") {
  const hex = createHash("sha256").update(`hmrc-grant-test-double:${token}`).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  tokenByGrantId.set(id, token);
  return id;
}

/**
 * The request header that names a grant resolving to the given HMRC access token.
 * @param {string} [token]
 * @returns {Object}
 */
export function hmrcGrantHeader(token = "test-token") {
  return { [HMRC_GRANT_HEADER]: grantIdFor(token) };
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

/**
 * The replacement module for app/lib/mcpHmrcGrantAccess.js: the original exports, with the
 * function that opens a grant answering the ids this double issued with their token. Any other
 * id goes to the real module, so a test can still open a real grant from a fake table.
 * @param {Object} original - the module's real exports, from importOriginal()
 * @returns {Object}
 */
export function hmrcGrantAccessDouble(original) {
  return {
    ...original,
    grantAccessTokenFromEvent: async (event) => {
      const grantId = headerValue(event.headers, HMRC_GRANT_HEADER);
      return tokenByGrantId.has(grantId) ? tokenByGrantId.get(grantId) : original.grantAccessTokenFromEvent(event);
    },
  };
}
