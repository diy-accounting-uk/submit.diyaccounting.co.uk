// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-41 Describe fraud prevention headers as a shape and build a synthetic request from it
// - **Use when:** the structure of an HMRC request's fraud prevention headers must leave the request path without any value in it, or a synthetic request with that structure must be built for HMRC's validator.
// - **Does:** fraudPreventionHeaderShape reduces the headers of an HMRC request to a shape: the connection method, the header names, a class for each value (ipv4, uuid, timestamp, a list of key names) and the type of the multi-factor header. It holds no value from the request. The shapeHash is the SHA-256 of that shape. syntheticFraudPreventionHeaders builds a header set with the same structure from fixed test values, the addresses the caller passes and the current time, and uses no value of the request that the shape came from.
// - **Run:** `import { fraudPreventionHeaderShape, syntheticFraudPreventionHeaders } from "app/lib/fraudPreventionHeaderShape.js"`
// - **Entry:** `app/lib/fraudPreventionHeaderShape.js:fraudPreventionHeaderShape`; `app/lib/fraudPreventionHeaderShape.js:syntheticFraudPreventionHeaders`
// - **Files:** app/lib/fraudPreventionHeaderShape.js, app/unit-tests/lib/fraudPreventionHeaderShape.test.js
// - **Keywords:** fraud prevention headers, header shape, shape hash, synthetic headers, hmrc validator, no customer value
// - **Related:** HMRC-29, HMRC-42, HMRC-43
// @end-capability

// app/lib/fraudPreventionHeaderShape.js

import { createHash } from "node:crypto";
import { isIP } from "node:net";

const CONNECTION_METHOD = "Gov-Client-Connection-Method";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TIMEZONE = /^UTC[+-]\d{2}:\d{2}$/;
const PORT = /^\d{1,5}$/;
const KEY_NAME = /^[a-z][a-z0-9-]{0,30}$/;
const IP_CLASS_BY_VERSION = { 4: "ipv4", 6: "ipv6" };
const MULTI_FACTOR_TYPES = new Set(["TOTP", "AUTH_CODE", "OTHER"]);

const CONNECTION_METHODS = new Set(["WEB_APP_VIA_SERVER", "DESKTOP_APP_VIA_SERVER", "OTHER_VIA_SERVER"]);

// How the value of each header is described. The product name and the version values belong to
// this product, and the validator consumer takes them from its own package, so only their form is kept.
const HEADER_KINDS = {
  "Gov-Client-Public-IP": "ip",
  "Gov-Vendor-Public-IP": "ip",
  "Gov-Client-Public-IP-Timestamp": "timestamp",
  "Gov-Client-Local-IPs-Timestamp": "timestamp",
  "Gov-Client-Public-Port": "port",
  "Gov-Client-Device-ID": "uuid",
  "Gov-Client-Timezone": "timezone",
  "Gov-Client-Browser-JS-User-Agent": "text",
  "Gov-Vendor-Product-Name": "text",
  "Gov-Client-Local-IPs": "ip-list",
  "Gov-Client-MAC-Addresses": "mac-list",
  "Gov-Client-User-IDs": "keys",
  "Gov-Client-Screens": "keys",
  "Gov-Client-Window-Size": "keys",
  "Gov-Client-Multi-Factor": "keys",
  "Gov-Client-User-Agent": "keys",
  "Gov-Vendor-Forwarded": "keys",
  "Gov-Vendor-License-IDs": "keys",
  "Gov-Vendor-Version": "keys",
};

export const SHAPE_HEADER_NAMES = Object.keys(HEADER_KINDS);

function headerValues(headers) {
  const values = new Map();
  if (!headers) return values;
  const entries =
    typeof headers.forEach === "function" && typeof headers.entries === "function" ? [...headers.entries()] : Object.entries(headers);
  for (const [name, value] of entries) {
    if (value === undefined || value === null) continue;
    values.set(String(name).toLowerCase(), String(value).trim());
  }
  return values;
}

function keyNamesOf(value) {
  const firstHop = value.split(",")[0];
  const names = [];
  for (const pair of firstHop.split("&")) {
    const key = decodeURIComponentSafe(pair.split("=")[0]).toLowerCase();
    names.push(KEY_NAME.test(key) ? key : "?");
  }
  return names;
}

function decodeURIComponentSafe(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return "?";
  }
}

function classOf(kind, value) {
  switch (kind) {
    case "ip":
      return IP_CLASS_BY_VERSION[isIP(value)] ?? "other";
    case "timestamp":
      return TIMESTAMP_MILLIS.test(value) ? "timestamp" : "other";
    case "port":
      return PORT.test(value) ? "port" : "other";
    case "uuid":
      return UUID.test(value) ? "uuid" : "other";
    case "timezone":
      return TIMEZONE.test(value) ? "utc-offset" : "other";
    case "ip-list":
      return "ip-list";
    case "mac-list":
      return "mac-list";
    case "keys":
      return `keys:${keyNamesOf(value).join(",")}`;
    default:
      return "text";
  }
}

function multiFactorTypeOf(value) {
  for (const pair of value.split("&")) {
    const [key, raw] = pair.split("=");
    if (decodeURIComponentSafe(key).toLowerCase() === "type") {
      const type = decodeURIComponentSafe(raw ?? "").toUpperCase();
      return MULTI_FACTOR_TYPES.has(type) ? type : "OTHER";
    }
  }
  return undefined;
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Reduce the headers of an HMRC request to a shape that holds no value from the request.
 * @param {object|Headers} headers The headers of the request.
 * @returns {{shapeHash: string, shape: {connectionMethod: string, headers: Object<string,string>, multiFactorType?: string}}|null}
 *   Null when the request names no known connection method.
 */
export function fraudPreventionHeaderShape(headers) {
  const values = headerValues(headers);
  const connectionMethod = values.get(CONNECTION_METHOD.toLowerCase());
  if (!CONNECTION_METHODS.has(connectionMethod)) return null;
  const classes = {};
  for (const [name, kind] of Object.entries(HEADER_KINDS)) {
    const value = values.get(name.toLowerCase());
    if (value === undefined || value === "") continue;
    classes[name] = classOf(kind, value);
  }
  const shape = { connectionMethod, headers: sortedObject(classes) };
  const multiFactor = values.get("gov-client-multi-factor");
  const multiFactorType = multiFactor ? multiFactorTypeOf(multiFactor) : undefined;
  if (multiFactorType) shape.multiFactorType = multiFactorType;
  const shapeHash = createHash("sha256").update(JSON.stringify(shape)).digest("hex");
  return { shapeHash, shape };
}

// Fixed values for the synthetic set. None comes from a customer or a request.
export const SYNTHETIC_DEVICE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const SYNTHETIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SYNTHETIC_KEY_VALUES = {
  "width": "1920",
  "height": "1080",
  "scaling-factor": "1",
  "colour-depth": "24",
  "os-family": "macOS",
  "os-version": "14.5",
  "device-manufacturer": "Apple",
  "device-model": "MacBookPro",
  "type": "TOTP",
};
const SYNTHETIC_REFERENCE = "fph-check";
// HMRC checks that each licence value is hashed; live requests send an HMAC-SHA256 hex digest.
const SYNTHETIC_LICENSE_HASH = createHash("sha256").update(SYNTHETIC_REFERENCE).digest("hex");
// A private address from RFC 1918, as a local address of a desktop app is.
const SYNTHETIC_LOCAL_IP = ["10", "0", "0", "5"].join(".");

function encodePair(key, value) {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function pairsFor(classText, valueFor) {
  const keys = classText.slice("keys:".length).split(",");
  return keys.map((key) => encodePair(key, valueFor(key))).join("&");
}

function safeKeyClass(classText) {
  if (typeof classText !== "string" || !classText.startsWith("keys:")) return false;
  return classText
    .slice("keys:".length)
    .split(",")
    .every((key) => KEY_NAME.test(key));
}

/**
 * Build a header set with the structure of a shape, from fixed test values, the two addresses the
 * caller passes and the current time. No value of the request that the shape came from is used.
 * @param {{connectionMethod: string, headers: Object<string,string>, multiFactorType?: string}} shape
 * @param {{now: Date, vendorPublicIp: string, clientPublicIp: string, productName: string, productVersion: string}} context
 * @returns {Object<string,string>}
 */
export function syntheticFraudPreventionHeaders(shape, { now, vendorPublicIp, clientPublicIp, productName, productVersion }) {
  const timestamp = now.toISOString();
  const multiFactorType = MULTI_FACTOR_TYPES.has(shape.multiFactorType) ? shape.multiFactorType : "TOTP";
  const headers = { [CONNECTION_METHOD]: shape.connectionMethod };
  for (const [name, classText] of Object.entries(shape.headers ?? {})) {
    if (!HEADER_KINDS[name]) continue;
    switch (name) {
      case "Gov-Client-Public-IP":
        headers[name] = clientPublicIp;
        break;
      case "Gov-Vendor-Public-IP":
        headers[name] = vendorPublicIp;
        break;
      case "Gov-Client-Public-IP-Timestamp":
      case "Gov-Client-Local-IPs-Timestamp":
        headers[name] = timestamp;
        break;
      case "Gov-Client-Public-Port":
        headers[name] = "51234";
        break;
      case "Gov-Client-Device-ID":
        headers[name] = SYNTHETIC_DEVICE_ID;
        break;
      case "Gov-Client-Timezone":
        headers[name] = "UTC+00:00";
        break;
      case "Gov-Client-Browser-JS-User-Agent":
        headers[name] = SYNTHETIC_USER_AGENT;
        break;
      case "Gov-Vendor-Product-Name":
        headers[name] = encodeURIComponent(productName);
        break;
      case "Gov-Client-Local-IPs":
        headers[name] = SYNTHETIC_LOCAL_IP;
        break;
      case "Gov-Client-MAC-Addresses":
        headers[name] = "00%3A00%3A5e%3A00%3A53%3Aaf";
        break;
      case "Gov-Client-User-IDs":
        if (safeKeyClass(classText)) headers[name] = pairsFor(classText, () => SYNTHETIC_REFERENCE);
        break;
      case "Gov-Client-Multi-Factor":
        if (safeKeyClass(classText)) {
          const valueByKey = { type: multiFactorType, timestamp };
          headers[name] = pairsFor(classText, (key) => valueByKey[key] ?? SYNTHETIC_REFERENCE);
        }
        break;
      case "Gov-Vendor-Forwarded":
        headers[name] = `by=${encodeURIComponent(vendorPublicIp)}&for=${encodeURIComponent(clientPublicIp)}`;
        break;
      case "Gov-Vendor-Version":
        headers[name] = safeKeyClass(classText) ? pairsFor(classText, () => productVersion) : encodePair(productName, productVersion);
        break;
      case "Gov-Vendor-License-IDs":
        headers[name] = `${encodeURIComponent(productName)}=${SYNTHETIC_LICENSE_HASH}`;
        break;
      default:
        if (safeKeyClass(classText)) headers[name] = pairsFor(classText, (key) => SYNTHETIC_KEY_VALUES[key] ?? "1");
    }
  }
  return headers;
}
