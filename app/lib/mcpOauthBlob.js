// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpOauthBlob.js
// HMAC-SHA256 signed state blobs for the MCP OAuth facade: base64url(json) + "." + base64url(mac).
// Every blob carries `typ` and `exp` (epoch seconds) and is refused on a bad MAC, a wrong `typ`
// or a past `exp`.

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_BLOB_LENGTH = 8192;
const MIN_KEY_LENGTH = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function assertKey(key) {
  if (typeof key !== "string" || key.length < MIN_KEY_LENGTH) {
    throw new Error(`Blob key must be a string of at least ${MIN_KEY_LENGTH} characters`);
  }
}

function mac(key, encodedPayload) {
  return createHmac("sha256", key).update(encodedPayload).digest();
}

function nowSeconds(now) {
  return Math.floor((now ?? Date.now()) / 1000);
}

/**
 * @param {object} fields - The data the blob carries
 * @param {string} key - The HMAC key
 * @param {{typ: string, ttlSeconds: number, now?: number}} options - `now` in epoch milliseconds
 * @returns {string}
 */
export function signBlob(fields, key, { typ, ttlSeconds, now }) {
  assertKey(key);
  if (typeof typ !== "string" || !typ) throw new Error("Blob typ is required");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("Blob ttlSeconds must be a positive integer");
  const payload = { ...fields, typ, exp: nowSeconds(now) + ttlSeconds };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${mac(key, encodedPayload).toString("base64url")}`;
}

/**
 * @param {unknown} blob - The blob as received
 * @param {string} key - The HMAC key
 * @param {string} expectedTyp - The `typ` the caller accepts
 * @param {{now?: number}} [options] - `now` in epoch milliseconds
 * @returns {{ok: true, fields: object} | {ok: false, reason: "malformed"|"bad_mac"|"wrong_typ"|"expired"}}
 */
export function verifyBlob(blob, key, expectedTyp, { now } = {}) {
  assertKey(key);
  if (typeof blob !== "string" || blob.length === 0 || blob.length > MAX_BLOB_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = blob.split(".");
  if (parts.length !== 2 || !BASE64URL.test(parts[0]) || !BASE64URL.test(parts[1])) {
    return { ok: false, reason: "malformed" };
  }
  const [encodedPayload, encodedMac] = parts;
  const expected = mac(key, encodedPayload);
  const received = Buffer.from(encodedMac, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "bad_mac" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.typ !== expectedTyp) {
    return { ok: false, reason: "wrong_typ" };
  }
  if (!Number.isInteger(payload.exp) || payload.exp <= nowSeconds(now)) {
    return { ok: false, reason: "expired" };
  }
  const fields = { ...payload };
  delete fields.typ;
  delete fields.exp;
  return { ok: true, fields };
}
