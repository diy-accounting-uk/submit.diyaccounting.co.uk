// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/totp.js
// RFC 6238 time-based one-time codes with node:crypto: HMAC-SHA1, 6 digits, 30 second steps.
// The secret is base32 text, the form an authenticator app takes and Cognito's
// AssociateSoftwareToken answers. The `otpauth` package is a dev dependency and is not in the
// Lambda image.

import { createHmac } from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * @param {string} text - base32 text; spaces, lower case and "=" padding are accepted
 * @returns {Buffer}
 */
export function base32Decode(text) {
  const clean = String(text).replace(/[\s=]/g, "").toUpperCase();
  if (!clean) throw new Error("TOTP secret is empty");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("TOTP secret is not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * @param {string} secretBase32
 * @param {{now?: number, stepOffset?: number}} [options] - `now` in epoch milliseconds; `stepOffset` 1 gives the next window's code
 * @returns {string} the six digit code
 */
export function totpCode(secretBase32, { now = Date.now(), stepOffset = 0 } = {}) {
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS) + stepOffset;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secretBase32)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}
