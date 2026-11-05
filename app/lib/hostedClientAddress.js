// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hostedClientAddress.js
// The hosted MCP Lambda calls Submit's API from AWS, so the API sees the Lambda's address and not
// the address of the caller at /mcp. This module carries the caller's address across that hop.
// The hosted Lambda signs the value with the keyed hash of the sub salt, and buildFraudHeaders
// accepts only a value signed for the same user. A holder of an MCP token cannot declare a public
// IP address, because the token holder does not have the key.

import { timingSafeEqual } from "node:crypto";
import { hashSub } from "../services/subHasher.js";

export const HOSTED_CLIENT_ADDRESS_HEADER = "x-mcp-hosted-client";

// The signed fields hold only ASCII, so a valid value has only single-byte escapes.
const BROKEN_PERCENT_ESCAPE = /%(?![0-7][0-9A-Fa-f])/;

/**
 * The first public address in a comma-separated X-Forwarded-For list.
 * @param {string[]} forwardedIps
 * @returns {string|undefined}
 */
export function firstPublicIp(forwardedIps) {
  return forwardedIps.find(
    (ip) =>
      !ip.startsWith("10.") &&
      !ip.startsWith("192.168.") &&
      !ip.match(/^172\.(1\d|2\d|3[0-1])\./) &&
      !ip.startsWith("127.") &&
      !ip.startsWith("::1") &&
      !ip.startsWith("fe80:"),
  );
}

/**
 * Split an X-Forwarded-For value into its addresses.
 * @param {string|null|undefined} forwardedFor
 * @returns {string[]}
 */
export function forwardedIpsOf(forwardedFor) {
  return (forwardedFor || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/**
 * The port in a CloudFront-Viewer-Address value ("ip:port" or "[ipv6]:port").
 * @param {string|null|undefined} viewerAddress
 * @returns {string|undefined}
 */
export function viewerPortOf(viewerAddress) {
  const port = viewerAddress?.split(":").pop();
  return port && /^\d+$/.test(port) ? port : undefined;
}

function signatureOf(sub, ip, port, collectedAt) {
  return hashSub(`mcp-hosted-client|${sub}|${ip}|${port}|${collectedAt}`);
}

/**
 * The signed header value for the caller at /mcp. The salt must be initialised.
 * @param {{sub: string, ip?: string, port?: string, collectedAt: string}} address
 * @returns {string}
 */
export function signHostedClientAddress({ sub, ip = "", port = "", collectedAt }) {
  return [ip, port, collectedAt, signatureOf(sub, ip, port, collectedAt)].map(encodeURIComponent).join(",");
}

/**
 * Read a signed value. Answers null when the value is absent or its signature does not match.
 * The salt must be initialised.
 * @param {string|null|undefined} value
 * @param {string|undefined} sub
 * @returns {{ip: string, port: string, collectedAt: string}|null}
 */
export function readHostedClientAddress(value, sub) {
  if (!value || !sub) return null;
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((part) => BROKEN_PERCENT_ESCAPE.test(part))) return null;
  const [ip, port, collectedAt, signature] = parts.map((part) => decodeURIComponent(part));
  const expected = Buffer.from(signatureOf(sub, ip, port, collectedAt));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { ip, port, collectedAt };
}
