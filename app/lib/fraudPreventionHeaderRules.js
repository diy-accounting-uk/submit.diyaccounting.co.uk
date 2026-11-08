// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/fraudPreventionHeaderRules.js

import { isIP } from "node:net";

// The rules come from HMRC's connection method pages for WEB_APP_VIA_SERVER,
// DESKTOP_APP_VIA_SERVER and OTHER_VIA_SERVER. The check reads header values in memory and returns rule ids made of
// a header name and a rule name. No header value leaves this module.
//
// A header that is absent is not a rule failure here: the missing-header check reports it.

// The version of HMRC's header specification that these rules follow. HMRC's validator reports
// its own in specVersion, and a difference shows that the specification has moved.
export const FRAUD_PREVENTION_SPEC_VERSION = "3.3";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TIMESTAMP_FORMS = [
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/,
];
const TIMEZONE = /^UTC[+-]\d{2}:\d{2}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const PERCENT_ENCODED_CHARACTERS = /^[A-Za-z0-9\-._~%]*$/;
const BROKEN_PERCENT_ESCAPE = /%(?![0-9A-Fa-f]{2})/;
const MULTI_FACTOR_TYPES = new Set(["TOTP", "AUTH_CODE", "OTHER"]);
const SERVER_PORTS = new Set([80, 443]);

// HMRC's desktop and other pages ask for a version pair for the server and one for the client
// application. The web page does not.
const DEVICE_METHODS = new Set(["DESKTOP_APP_VIA_SERVER", "OTHER_VIA_SERVER"]);
const DEVICE_ONLY_HEADERS = ["Gov-Client-Local-IPs", "Gov-Client-Local-IPs-Timestamp", "Gov-Client-MAC-Addresses", "Gov-Client-User-Agent"];
const WEB_ONLY_HEADERS = ["Gov-Client-Browser-JS-User-Agent"];
const COMMON_HEADERS = [
  "Gov-Client-Connection-Method",
  "Gov-Client-Device-ID",
  "Gov-Client-Multi-Factor",
  "Gov-Client-Public-IP",
  "Gov-Client-Public-IP-Timestamp",
  "Gov-Client-Public-Port",
  "Gov-Client-Screens",
  "Gov-Client-Timezone",
  "Gov-Client-User-IDs",
  "Gov-Client-Window-Size",
  "Gov-Vendor-Forwarded",
  "Gov-Vendor-License-IDs",
  "Gov-Vendor-Product-Name",
  "Gov-Vendor-Public-IP",
  "Gov-Vendor-Version",
];

// Headers whose value is built from percent encoded keys and values.
const ENCODED_STRUCTURE_HEADERS = [
  "Gov-Client-MAC-Addresses",
  "Gov-Client-Local-IPs",
  "Gov-Client-Multi-Factor",
  "Gov-Client-Screens",
  "Gov-Client-User-Agent",
  "Gov-Client-User-IDs",
  "Gov-Client-Window-Size",
  "Gov-Vendor-Forwarded",
  "Gov-Vendor-License-IDs",
  "Gov-Vendor-Product-Name",
  "Gov-Vendor-Version",
];
// Headers that hold a list of comma-separated values with no key-value structure.
const PLAIN_LIST_HEADERS = new Set(["Gov-Client-MAC-Addresses", "Gov-Client-Local-IPs"]);

function lowerCaseValues(headers) {
  const values = new Map();
  if (!headers) return values;
  const entries =
    typeof headers.forEach === "function" && typeof headers.get === "function" ? [...headers.entries()] : Object.entries(headers);
  for (const [name, value] of entries) {
    if (value === undefined || value === null) continue;
    values.set(name.toLowerCase(), String(value).trim());
  }
  return values;
}

function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function isPrivateOrReservedIp(ip) {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true;
}

// "a=1&b=2" to a Map. Returns undefined when a pair has no key.
function parseStructure(text) {
  const pairs = new Map();
  for (const part of text.split("&")) {
    const index = part.indexOf("=");
    if (index < 1) return undefined;
    pairs.set(part.slice(0, index), part.slice(index + 1));
  }
  return pairs;
}

function checkEncodedStructure(name, value, fail) {
  const plainList = PLAIN_LIST_HEADERS.has(name);
  for (const element of value.split(",")) {
    if (element === "") {
      fail(name, "empty-list-value");
      return;
    }
    const tokens = plainList ? [element] : element.split("&").flatMap((pair) => pair.split("="));
    if (!plainList) {
      const pairs = parseStructure(element);
      if (pairs && [...pairs.values()].some((pairValue) => pairValue === "")) {
        fail(name, "empty-value");
        return;
      }
    }
    if (tokens.some((token) => !PERCENT_ENCODED_CHARACTERS.test(token) || BROKEN_PERCENT_ESCAPE.test(token))) {
      fail(name, "percent-encoding");
      return;
    }
  }
}

function checkDimensions(name, value, fail) {
  for (const element of value.split(",")) {
    const pairs = parseStructure(element);
    const ok =
      pairs &&
      ["width", "height"].every((key) => pairs.has(key) && POSITIVE_INTEGER.test(decode(pairs.get(key)))) &&
      (name !== "Gov-Client-Screens" || (pairs.has("scaling-factor") && pairs.has("colour-depth")));
    if (!ok) {
      fail(name, "dimensions");
      return;
    }
  }
}

function checkMultiFactor(value, fail) {
  const name = "Gov-Client-Multi-Factor";
  for (const element of value.split(",")) {
    const pairs = parseStructure(element);
    if (!pairs || !MULTI_FACTOR_TYPES.has(decode(pairs.get("type") ?? ""))) fail(name, "type");
    if (!pairs || !TIMESTAMP_FORMS.some((form) => form.test(decode(pairs.get("timestamp") ?? "")))) fail(name, "timestamp");
    if (!pairs || !pairs.get("unique-reference")) fail(name, "unique-reference");
  }
}

function checkForwardedFirstHop(values, fail) {
  const forwarded = values.get("gov-vendor-forwarded");
  if (!forwarded) return;
  const hop = parseStructure(forwarded.split(",")[0]);
  const vendorIp = values.get("gov-vendor-public-ip");
  const clientIp = values.get("gov-client-public-ip");
  if (!hop) {
    fail("Gov-Vendor-Forwarded", "structure");
    return;
  }
  if (vendorIp && decode(hop.get("by") ?? "") !== vendorIp) fail("Gov-Vendor-Forwarded", "first-hop-by");
  if (clientIp && decode(hop.get("for") ?? "") !== clientIp) fail("Gov-Vendor-Forwarded", "first-hop-for");
}

/**
 * Check fraud prevention header values against HMRC's published format rules.
 * @param {object|Headers} headers The headers of an outbound HMRC request.
 * @param {string} [connectionMethod] WEB_APP_VIA_SERVER, DESKTOP_APP_VIA_SERVER or OTHER_VIA_SERVER. Any other value uses the web rules.
 * @returns {string[]} Rule ids such as `Gov-Client-Public-Port:server-port`. Empty when every rule passes.
 */
export function checkFraudPreventionHeaderRules(headers, connectionMethod) {
  const deviceMethod = DEVICE_METHODS.has(connectionMethod);
  const values = lowerCaseValues(headers);
  const failed = [];
  const fail = (name, rule) => {
    const id = `${name}:${rule}`;
    if (!failed.includes(id)) failed.push(id);
  };

  const headerNames = [...COMMON_HEADERS, ...(deviceMethod ? DEVICE_ONLY_HEADERS : WEB_ONLY_HEADERS)];
  for (const name of headerNames) {
    const value = values.get(name.toLowerCase());
    if (value === undefined || value === "") continue;
    if (value === "undefined" || value === "null") fail(name, "placeholder");
    if (!/^[\x20-\x7E]*$/.test(value)) fail(name, "us-ascii");
  }

  const present = (name) => {
    const value = values.get(name.toLowerCase());
    return value && value !== "undefined" && value !== "null" ? value : undefined;
  };

  for (const name of ENCODED_STRUCTURE_HEADERS) {
    const value = present(name);
    if (value && (deviceMethod || !DEVICE_ONLY_HEADERS.includes(name))) checkEncodedStructure(name, value, fail);
  }

  const clientIp = present("Gov-Client-Public-IP");
  const vendorIp = present("Gov-Vendor-Public-IP");
  if (clientIp && isPrivateOrReservedIp(clientIp)) fail("Gov-Client-Public-IP", "public");
  if (vendorIp && isPrivateOrReservedIp(vendorIp)) fail("Gov-Vendor-Public-IP", "public");
  if (clientIp && vendorIp && clientIp === vendorIp) fail("Gov-Vendor-Public-IP", "differs-from-client");

  const publicIpTimestamp = present("Gov-Client-Public-IP-Timestamp");
  if (publicIpTimestamp && !TIMESTAMP_MILLIS.test(publicIpTimestamp)) fail("Gov-Client-Public-IP-Timestamp", "timestamp");
  const localIpsTimestamp = present("Gov-Client-Local-IPs-Timestamp");
  if (deviceMethod && localIpsTimestamp && !TIMESTAMP_MILLIS.test(localIpsTimestamp)) fail("Gov-Client-Local-IPs-Timestamp", "timestamp");

  const port = present("Gov-Client-Public-Port");
  if (port) {
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) fail("Gov-Client-Public-Port", "range");
    else if (SERVER_PORTS.has(Number(port))) fail("Gov-Client-Public-Port", "server-port");
  }

  const deviceId = present("Gov-Client-Device-ID");
  if (deviceId && !UUID.test(deviceId)) fail("Gov-Client-Device-ID", "uuid");

  const multiFactor = present("Gov-Client-Multi-Factor");
  if (multiFactor) checkMultiFactor(multiFactor, fail);

  const screens = present("Gov-Client-Screens");
  if (screens) checkDimensions("Gov-Client-Screens", screens, fail);
  const windowSize = present("Gov-Client-Window-Size");
  if (windowSize) checkDimensions("Gov-Client-Window-Size", windowSize, fail);

  const timezone = present("Gov-Client-Timezone");
  if (timezone && !TIMEZONE.test(timezone)) fail("Gov-Client-Timezone", "timezone");

  const vendorVersion = present("Gov-Vendor-Version");
  if (deviceMethod && vendorVersion && (parseStructure(vendorVersion)?.size ?? 0) < 2) fail("Gov-Vendor-Version", "two-pairs");

  checkForwardedFirstHop(values, fail);
  return failed;
}
