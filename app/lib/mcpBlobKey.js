// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpBlobKey.js
// The key the MCP facade signs its state blobs with and the codes entries seal their codes with.

import { validateEnv } from "./env.js";
import { readSecret } from "./cachedSecret.js";

/**
 * The blob key: `MCP_OAUTH_BLOB_KEY` on local lanes, otherwise the Secrets Manager secret named by
 * `MCP_OAUTH_BLOB_KEY_SECRET_ARN`, cached for five minutes.
 * @param {{forceRefresh?: boolean}} [options] - read the secret again, after a check failed under the cached value
 * @returns {Promise<string>}
 */
export async function loadBlobKey({ forceRefresh = false } = {}) {
  if (process.env.MCP_OAUTH_BLOB_KEY) return process.env.MCP_OAUTH_BLOB_KEY;
  validateEnv(["MCP_OAUTH_BLOB_KEY_SECRET_ARN"]);
  return readSecret(process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN, { forceRefresh });
}
