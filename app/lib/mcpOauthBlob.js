// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpOauthBlob.js
// HMAC-SHA256 signed state blobs for the MCP OAuth facade: base64url(json) + "." + base64url(mac).
// Every blob carries `typ`, `exp` (epoch seconds) and `kid`, the version of the key that signed it.
// A blob is refused on a bad MAC, a wrong `typ` or a past `exp`. A blob with no `kid`, from before
// key versions, is checked under every version.

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_BLOB_LENGTH = 8192;
const MIN_KEY_LENGTH = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

// A key registry is `{current, versions: {<label>: <key>}}`, as loadBlobKeys returns it.
function assertKeys(keys) {
  const versions = Object.values(keys?.versions ?? {});
  if (!keys?.versions?.[keys.current] || versions.some((key) => typeof key !== "string" || key.length < MIN_KEY_LENGTH)) {
    throw new Error(`Blob keys must name a current version, and every key must be a string of at least ${MIN_KEY_LENGTH} characters`);
  }
}

function mac(key, encodedPayload) {
  return createHmac("sha256", key).update(encodedPayload).digest();
}

// The `kid` a payload names, read before the MAC is checked. It only selects which key to try, so
// a forged `kid` fails the MAC like any other forgery.
function namedKeyVersion(encodedPayload) {
  try {
    const kid = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))?.kid;
    return typeof kid === "string" ? kid : undefined;
  } catch {
    return undefined;
  }
}

function nowSeconds(now) {
  return Math.floor((now ?? Date.now()) / 1000);
}

/**
 * @param {object} fields - The data the blob carries
 * @param {{current: string, versions: Object<string, string>}} keys - The key registry; the blob is signed with the current version
 * @param {{typ: string, ttlSeconds: number, now?: number}} options - `now` in epoch milliseconds
 * @returns {string}
 */
export function signBlob(fields, keys, { typ, ttlSeconds, now }) {
  assertKeys(keys);
  if (typeof typ !== "string" || !typ) throw new Error("Blob typ is required");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("Blob ttlSeconds must be a positive integer");
  const payload = { ...fields, typ, exp: nowSeconds(now) + ttlSeconds, kid: keys.current };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${mac(keys.versions[keys.current], encodedPayload).toString("base64url")}`;
}

/**
 * @param {unknown} blob - The blob as received
 * @param {{current: string, versions: Object<string, string>}} keys - The key registry; any version can verify
 * @param {string} expectedTyp - The `typ` the caller accepts
 * @param {{now?: number}} [options] - `now` in epoch milliseconds
 * @returns {{ok: true, fields: object} | {ok: false, reason: "malformed"|"bad_mac"|"wrong_typ"|"expired"}}
 */
export function verifyBlob(blob, keys, expectedTyp, { now } = {}) {
  assertKeys(keys);
  if (typeof blob !== "string" || blob.length === 0 || blob.length > MAX_BLOB_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = blob.split(".");
  if (parts.length !== 2 || !BASE64URL.test(parts[0]) || !BASE64URL.test(parts[1])) {
    return { ok: false, reason: "malformed" };
  }
  const [encodedPayload, encodedMac] = parts;
  const received = Buffer.from(encodedMac, "base64url");
  const named = namedKeyVersion(encodedPayload);
  if (named !== undefined && !Object.hasOwn(keys.versions, named)) return { ok: false, reason: "bad_mac" };
  const candidates = named === undefined ? Object.values(keys.versions) : [keys.versions[named]];
  const macMatches = candidates.some((key) => {
    const expected = mac(key, encodedPayload);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!macMatches) return { ok: false, reason: "bad_mac" };
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
  delete fields.kid;
  return { ok: true, fields };
}
