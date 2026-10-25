// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/codesSeal.js
// AES-256-GCM sealing of the secrets the MCP keeps server side: the Companies House codes a user
// types on the codes page, and the HMRC tokens of an MCP grant. Each purpose has its own key,
// derived from the MCP blob key; the item id is the authenticated data, so a sealed value opens
// only under the item it was sealed for.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { loadBlobKey } from "./mcpBlobKey.js";

const CODES_ENTRY_PURPOSE = "companies-house-codes-entry";
export const HMRC_GRANT_PURPOSE = "hmrc-grant";
const VERSION = "v1";

async function derivedKey(purpose) {
  const blobKey = await loadBlobKey();
  return Buffer.from(hkdfSync("sha256", blobKey, "", purpose, 32));
}

/**
 * @param {string} purpose - names the derived key; a value sealed for one purpose opens under no other
 * @param {object} value - the values to seal
 * @param {string} boundTo - the item id bound to the sealed value
 * @returns {Promise<string>} v1.<iv>.<tag>.<ciphertext>, each part base64url
 */
export async function sealFor(purpose, value, boundTo) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await derivedKey(purpose), iv);
  cipher.setAAD(Buffer.from(boundTo, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
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
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Sealed value is malformed");
  const decipher = createDecipheriv("aes-256-gcm", await derivedKey(purpose), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(boundTo, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

/**
 * @param {object} codes - the values to seal
 * @param {string} entryId - bound to the sealed value
 * @returns {Promise<string>} v1.<iv>.<tag>.<ciphertext>, each part base64url
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
