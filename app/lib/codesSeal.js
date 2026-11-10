// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/codesSeal.js
// AES-256-GCM sealing of the secrets the MCP keeps server side: the Companies House codes a user
// types on the codes page, and the HMRC tokens of an MCP grant, and the Companies House access token of a filing grant. Each purpose has its own key,
// derived from the MCP blob key; the item id is the authenticated data, so a sealed value opens
// only under the item it was sealed for. A sealed value starts with the version of the blob key that
// sealed it (v1, v2, ...). Sealing uses the current version and opening uses the version named.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { loadBlobKeys, blobKeyRegistriesEqual, isVersionLabel } from "./mcpBlobKey.js";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/codesSeal.js" });

export const KEY_REFRESH_LOG_MESSAGE = "Sealed value did not open under the cached keys, keys read again";
const CODES_ENTRY_PURPOSE = "companies-house-codes-entry";
export const HMRC_GRANT_PURPOSE = "hmrc-grant";
export const COMPANIES_HOUSE_GRANT_PURPOSE = "companies-house-grant";

function derivedKey(blobKey, purpose) {
  return Buffer.from(hkdfSync("sha256", blobKey, "", purpose, 32));
}

/**
 * @param {string} purpose - names the derived key; a value sealed for one purpose opens under no other
 * @param {object} value - the values to seal
 * @param {string} boundTo - the item id bound to the sealed value
 * @returns {Promise<string>} <key version>.<iv>.<tag>.<ciphertext>, each part base64url
 */
export async function sealFor(purpose, value, boundTo) {
  const keys = await loadBlobKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(keys.versions[keys.current], purpose), iv);
  cipher.setAAD(Buffer.from(boundTo, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [keys.current, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/**
 * @param {string} purpose - the purpose the value was sealed for
 * @param {string} sealed - as sealFor returns it
 * @param {string} boundTo - the item id the value was sealed for
 * @returns {Promise<object>} the sealed values; throws when the value was altered, or belongs to another item or purpose
 */
export async function openFor(purpose, sealed, boundTo) {
  const [version, iv, tag, ciphertext] = String(sealed).split(".");
  if (!isVersionLabel(version) || !iv || !tag || !ciphertext) throw new Error("Sealed value is malformed");
  const open = (keys) => {
    if (!Object.hasOwn(keys.versions, version)) throw new Error("Sealed value names a key version that is not held");
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(keys.versions[version], purpose), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(boundTo, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  };
  const keys = await loadBlobKeys();
  try {
    return open(keys);
  } catch (error) {
    // A value sealed under a version this container has not read yet fails here. One forced read
    // of the keys settles it, and the open runs again only when the keys changed.
    const refreshedKeys = await loadBlobKeys({ forceRefresh: true });
    const keysChanged = !blobKeyRegistriesEqual(refreshedKeys, keys);
    logger.info({
      message: KEY_REFRESH_LOG_MESSAGE,
      purpose,
      sealedVersion: version,
      cachedCurrent: keys.current,
      refreshedCurrent: refreshedKeys.current,
      keysChanged,
    });
    if (!keysChanged) throw error;
    return open(refreshedKeys);
  }
}

/**
 * @param {object} codes - the values to seal
 * @param {string} entryId - bound to the sealed value
 * @returns {Promise<string>} <key version>.<iv>.<tag>.<ciphertext>, each part base64url
 */
export function sealCodes(codes, entryId) {
  return sealFor(CODES_ENTRY_PURPOSE, codes, entryId);
}

/**
 * @param {string} sealed - as sealCodes returns it
 * @param {string} entryId - the entry the value was sealed for
 * @returns {Promise<object>} the sealed values; throws when the value was altered or belongs to another entry
 */
export function openCodes(sealed, entryId) {
  return openFor(CODES_ENTRY_PURPOSE, sealed, entryId);
}
