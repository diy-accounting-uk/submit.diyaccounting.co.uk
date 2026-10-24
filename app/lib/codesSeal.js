// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/codesSeal.js
// AES-256-GCM sealing of the Companies House codes a user types on the codes page. The key is
// derived from the MCP blob key; the entry id is the authenticated data, so a sealed value
// opens only under the entry it was sealed for.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { loadBlobKey } from "./mcpBlobKey.js";

const KEY_INFO = "companies-house-codes-entry";
const VERSION = "v1";

async function derivedKey() {
  const blobKey = await loadBlobKey();
  return Buffer.from(hkdfSync("sha256", blobKey, "", KEY_INFO, 32));
}

/**
 * @param {object} codes - the values to seal
 * @param {string} entryId - bound to the sealed value
 * @returns {Promise<string>} v1.<iv>.<tag>.<ciphertext>, each part base64url
 */
export async function sealCodes(codes, entryId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await derivedKey(), iv);
  cipher.setAAD(Buffer.from(entryId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(codes), "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/**
 * @param {string} sealed - as sealCodes returns it
 * @param {string} entryId - the entry the value was sealed for
 * @returns {Promise<object>} the sealed values; throws when the value was altered or belongs to another entry
 */
export async function openCodes(sealed, entryId) {
  const [version, iv, tag, ciphertext] = String(sealed).split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Sealed codes are malformed");
  const decipher = createDecipheriv("aes-256-gcm", await derivedKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(entryId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}
