// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpBlobKey.js
// The keys the MCP facade signs its state blobs with and the codes entries seal their values with.
// The stored value is a registry: `{"current":"v2","versions":{"v1":"...","v2":"..."}}`. A raw
// stored value (the format the secret was created in) reads as a registry with one version, v1.
// Writers use the current version and name it on what they write. Readers use any version.

import { validateEnv } from "./env.js";
import { readSecret } from "./cachedSecret.js";

const VERSION_LABEL = /^v\d+$/;

export function isVersionLabel(value) {
  return typeof value === "string" && VERSION_LABEL.test(value);
}

/**
 * @param {string} raw - the stored value: a registry as JSON, or a raw key
 * @returns {{current: string, versions: Object<string, string>}}
 */
export function parseBlobKeyRegistry(raw) {
  if (typeof raw !== "string" || raw.length === 0) throw new Error("MCP OAuth blob key is empty");
  if (!raw.startsWith("{")) return { current: "v1", versions: { v1: raw } };
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch {
    throw new Error("MCP OAuth blob key registry is not valid JSON");
  }
  const labels = Object.keys(registry?.versions ?? {});
  if (
    !isVersionLabel(registry?.current) ||
    labels.length === 0 ||
    !labels.every(
      (label) => isVersionLabel(label) && typeof registry.versions[label] === "string" && registry.versions[label].length > 0,
    ) ||
    !labels.includes(registry.current)
  ) {
    throw new Error("MCP OAuth blob key registry is malformed");
  }
  return { current: registry.current, versions: registry.versions };
}

export function blobKeyRegistriesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The key registry: `MCP_OAUTH_BLOB_KEY` on local lanes, otherwise the Secrets Manager secret named
 * by `MCP_OAUTH_BLOB_KEY_SECRET_ARN`, cached for five minutes.
 * @param {{forceRefresh?: boolean}} [options] - read the secret again, after a check failed under the cached keys
 * @returns {Promise<{current: string, versions: Object<string, string>}>}
 */
export async function loadBlobKeys({ forceRefresh = false } = {}) {
  if (process.env.MCP_OAUTH_BLOB_KEY) return parseBlobKeyRegistry(process.env.MCP_OAUTH_BLOB_KEY);
  validateEnv(["MCP_OAUTH_BLOB_KEY_SECRET_ARN"]);
  return parseBlobKeyRegistry(await readSecret(process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN, { forceRefresh }));
}
