// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-81 Mask and redact sensitive data from logs
// - **Use when:** text or an object bound for a log line or shared output may carry PII or secret values.
// - **Does:** dataMasking.js redacts PII and secret values from log output and other text before it is written or shared. maskSensitiveData walks an object field by field, and maskHttpData masks HTTP request and response bodies and headers. maskIntegrationRaw builds the allowlisted skeleton of an outbound call, and integrationPathTemplate reduces a URL path to a template with no identifier.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/lib/dataMasking.js:maskSensitiveData`; `app/lib/dataMasking.js:maskHttpData`; `app/lib/dataMasking.js:maskIntegrationRaw`; `app/lib/dataMasking.js:integrationPathTemplate`
// - **Files:** app/lib/dataMasking.js, app/unit-tests/lib/dataMasking.test.js
// - **Keywords:** pii redaction, data masking, secrets in logs, sensitive fields, log hygiene, body skeleton, path template
// - **Related:** OPS-86
// @end-capability

// app/lib/dataMasking.js

/**
 * Utility for masking sensitive data in requests and responses before persistence.
 * Prevents leakage of credentials, tokens, and other sensitive information.
 */

import { normalizeHeaders } from "./httpFetch.js";

const MASK_VALUE = "***MASKED***";

/**
 * Sensitive field names that should always be masked (case-insensitive exact matches)
 */
const SENSITIVE_FIELD_NAMES = [
  "authorization",
  "access_token",
  "refresh_token",
  "hmrctestpassword",
  "password",
  "client_secret",
  "clientsecret",
  "code", // OAuth authorization codes
];

/**
 * Field name patterns that indicate sensitive data (case-insensitive)
 * Fields ending with these patterns will be masked unless they're in the allowlist
 */
const SENSITIVE_PATTERNS = ["password", "secret", "token"];

/**
 * Known non-sensitive fields that might match sensitive patterns
 * These will NOT be masked even if they match patterns
 */
const NON_SENSITIVE_ALLOWLIST = [
  "periodkey", // HMRC period identifier - not sensitive
  "tokeninfo", // Metadata about tokens - not the token itself
  "hasaccesstoken", // Boolean flag - not the token itself
  "accesstokenlength", // Length metadata - not the token itself
  "accesstokenprefix", // Truncated prefix for logging - already safe
];

/**
 * Determines if a field name represents sensitive data that should be masked
 * @param {string} fieldName - The field name to check
 * @returns {boolean} True if the field should be masked
 */
export function isSensitiveField(fieldName) {
  if (!fieldName || typeof fieldName !== "string") {
    return false;
  }

  const lowerFieldName = fieldName.toLowerCase();

  // Check allowlist first - these are never sensitive
  if (NON_SENSITIVE_ALLOWLIST.includes(lowerFieldName)) {
    return false;
  }

  // Check exact matches
  if (SENSITIVE_FIELD_NAMES.includes(lowerFieldName)) {
    return true;
  }

  // Check pattern matches (field ends with sensitive pattern)
  return SENSITIVE_PATTERNS.some((pattern) => lowerFieldName.endsWith(pattern));
}

/**
 * Mask sensitive values in URL-encoded form body strings.
 * Handles patterns like "client_secret=xxx&code=yyy"
 *
 * @param {string} body - URL-encoded form body string
 * @returns {string} Body with sensitive values masked
 */
export function maskUrlEncodedBody(body) {
  if (!body || typeof body !== "string") {
    return body;
  }

  let masked = body;

  // Mask client_secret (UUID format)
  masked = masked.replace(/client_secret=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, `client_secret=${MASK_VALUE}`);

  // Mask authorization code (32-char hex)
  masked = masked.replace(/([&?])code=[a-f0-9]{32}/gi, `$1code=${MASK_VALUE}`);

  // Mask code at start of string (no leading & or ?)
  masked = masked.replace(/^code=[a-f0-9]{32}/gi, `code=${MASK_VALUE}`);

  return masked;
}

/**
 * Deep clone and mask sensitive data in an object or array.
 * Creates a new copy with sensitive field values replaced with MASK_VALUE.
 *
 * @param {*} data - The data to mask (object, array, or primitive)
 * @param {Object} [options]
 * @param {string[]} [options.keepFields] - Field names to keep in clear, lower case
 * @param {Set} [options.visited] - Set of visited objects for circular reference detection
 * @returns {*} A deep clone of the data with sensitive values masked
 */
export function maskSensitiveData(data, { keepFields = [], visited = new Set() } = {}) {
  // Handle null, undefined, and primitives
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  // Detect circular references
  if (visited.has(data)) {
    return "[Circular Reference]";
  }

  visited.add(data);

  try {
    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => maskSensitiveData(item, { keepFields, visited }));
    }

    // Handle objects
    const masked = {};

    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveField(key) && !keepFields.includes(key.toLowerCase())) {
        // Mask sensitive field - only if value exists and is not empty
        if (value !== null && value !== undefined && value !== "") {
          masked[key] = MASK_VALUE;
        } else {
          masked[key] = value;
        }
      } else if (value !== null && typeof value === "object") {
        // Recursively mask nested objects and arrays
        masked[key] = maskSensitiveData(value, { keepFields, visited });
      } else if (typeof value === "string" && key.toLowerCase() === "body") {
        // Apply URL-encoded masking to body fields
        masked[key] = maskUrlEncodedBody(value);
      } else {
        // Copy non-sensitive primitives as-is
        masked[key] = value;
      }
    }

    return masked;
  } finally {
    visited.delete(data);
  }
}

/**
 * Mask sensitive data in HTTP request/response objects before persistence.
 * Specifically designed for HMRC API request audit trail.
 *
 * @param {Object} httpData - HTTP request or response object with headers and body
 * @param {Object} [options]
 * @param {string[]} [options.keepFields] - Field names to keep in clear, lower case
 * @returns {Object} A masked copy safe for persistence
 */
export function maskHttpData(httpData, { keepFields = [] } = {}) {
  if (!httpData || typeof httpData !== "object") {
    return httpData;
  }

  return maskSensitiveData(httpData, { keepFields });
}

const RAW_BYTE_LIMIT = 32 * 1024;
const RAW_FIELDS_DROPPED_FIRST = ["responseBody", "requestBody", "errors", "message", "responseHeaderNames", "requestHeaderNames"];
const SKELETON_DEPTH_LIMIT = 8;
const ERROR_MESSAGE_LENGTH_LIMIT = 500;
const REQUEST_HEADERS_KEPT_WITH_VALUES = [
  "accept",
  "content-type",
  "gov-client-connection-method",
  "gov-vendor-product-name",
  "gov-vendor-version",
];

const IDENTIFIER_PATTERNS = [
  /\bcus_[A-Za-z0-9]+/g, // Stripe customer
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, // IPv4
  /\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/gi, // IPv6
  /\b[A-Za-z]{2}\d{6}[A-Za-z]\b/g, // NINO
  /\d{6,}/g, // VRN, UTR, company number and any other long number
];

function withoutIdentifiers(text) {
  const withoutEmails = text
    .split(/(\s+)/)
    .map((word) => (word.includes("@") ? "{id}" : word))
    .join("");
  return IDENTIFIER_PATTERNS.reduce((masked, pattern) => masked.replace(pattern, "{id}"), withoutEmails);
}

/**
 * Reduce a URL path to a template. A segment stays only when it is lower-case words joined by
 * hyphens, a tax year or a version, so an identifier of a form not yet seen cannot pass.
 * @param {string} pathname - The path, with no query string
 * @returns {string} For example /organisations/vat/{vrn}/returns
 */
export function integrationPathTemplate(pathname) {
  return pathname
    .split("/")
    .map((segment) => {
      if (segment === "" || /^[a-z]+(?:-[a-z]+)*$/.test(segment)) return segment;
      if (/^\d{4}-\d{2}$/.test(segment) || /^v?\d+(?:\.\d+)+$/.test(segment) || /^v\d+$/.test(segment)) return segment;
      if (/^\d{9}$/.test(segment)) return "{vrn}";
      if (/^[A-Za-z]{2}\d{6}[A-Za-z]$/.test(segment)) return "{nino}";
      return "{id}";
    })
    .join("/");
}

function firstXmlElementText(xml, elementName) {
  return new RegExp(`<(?:\\w+:)?${elementName}>([A-Za-z0-9._-]{1,64})</(?:\\w+:)?${elementName}>`).exec(xml)?.[1];
}

/**
 * The parts of a GovTalk message that identify it and carry no customer data.
 * @param {string} xml
 * @returns {{messageClass: string|undefined, transactionId: string|undefined, errorNumber: string|undefined}}
 */
export function govTalkSummary(xml) {
  const errorStart = xml.search(/<(?:\w+:)?Error[\s>]/);
  return {
    messageClass: firstXmlElementText(xml, "Class"),
    transactionId: firstXmlElementText(xml, "TransactionID"),
    errorNumber: errorStart >= 0 ? firstXmlElementText(xml.slice(errorStart), "Number") : undefined,
  };
}

function valueSkeleton(value, depth = 0) {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  if (depth >= SKELETON_DEPTH_LIMIT) return Array.isArray(value) ? "array" : "object";
  if (Array.isArray(value)) return value.length > 0 ? [valueSkeleton(value[0], depth + 1)] : [];
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [withoutIdentifiers(key), valueSkeleton(item, depth + 1)]));
}

function parsedJson(text) {
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

function bodySkeleton(body, contentType) {
  if (body === undefined || body === null || body === "") return undefined;
  if (typeof body === "object" && !(body instanceof URLSearchParams)) return valueSkeleton(body);
  const text = String(body);
  if (text.trimStart().startsWith("<")) {
    const { messageClass, transactionId, errorNumber } = govTalkSummary(text);
    return { format: "xml", messageClass, transactionId, errorNumber };
  }
  const json = parsedJson(text);
  if (json) return valueSkeleton(json.parsed);
  if (body instanceof URLSearchParams || contentType.includes("x-www-form-urlencoded")) {
    return Object.fromEntries([...new URLSearchParams(text).keys()].map((name) => [withoutIdentifiers(name), "string"]));
  }
  return { format: "text", length: text.length };
}

function maskedErrorText(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return withoutIdentifiers(String(value).slice(0, ERROR_MESSAGE_LENGTH_LIMIT * 2)).slice(0, ERROR_MESSAGE_LENGTH_LIMIT);
}

// HMRC puts code and message at the top of an error body; Stripe puts them under error.
function errorFields(body) {
  const parsed = typeof body === "string" ? parsedJson(body)?.parsed : body;
  if (!parsed || typeof parsed !== "object") return {};
  const source = parsed.error && typeof parsed.error === "object" ? parsed.error : parsed;
  const errors = Array.isArray(source.errors)
    ? source.errors.map((error) => ({ code: maskedErrorText(error?.code), message: maskedErrorText(error?.message) }))
    : undefined;
  return { code: maskedErrorText(source.code), message: maskedErrorText(source.message), errors };
}

function definedHeaderEntries(headers) {
  return Object.entries(normalizeHeaders(headers)).filter(([, value]) => value !== undefined && value !== null);
}

function withinRawLimit(raw) {
  const limited = { ...raw };
  for (const field of RAW_FIELDS_DROPPED_FIRST) {
    if (Buffer.byteLength(JSON.stringify(limited)) <= RAW_BYTE_LIMIT) break;
    delete limited[field];
    limited.truncated = true;
  }
  return limited;
}

/**
 * Build the raw record of one outbound call from an allowlist. Everything not named here is
 * dropped: a body keeps field names and value types only, and a header keeps its name. A status
 * of 400 or above also keeps the provider's error code and message, with identifiers removed.
 *
 * @param {Object} call
 * @param {string} call.method
 * @param {string} call.host
 * @param {string} call.api - The template of the call, from integrationPathTemplate or a message class
 * @param {number} [call.status]
 * @param {Headers|Object} [call.requestHeaders]
 * @param {*} [call.requestBody] - JSON text, form text, XML text, URLSearchParams or an object
 * @param {Headers|Object} [call.responseHeaders]
 * @param {*} [call.responseBody]
 * @returns {Object} The raw record, at most 32 KB
 */
export function maskIntegrationRaw({ method, host, api, status, requestHeaders, requestBody, responseHeaders, responseBody }) {
  const requestEntries = definedHeaderEntries(requestHeaders);
  const responseEntries = definedHeaderEntries(responseHeaders);
  const contentTypeOf = (entries) => String(entries.find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "").toLowerCase();
  return withinRawLimit({
    method,
    host,
    api,
    status,
    requestHeaderNames: requestEntries.map(([name]) => name),
    requestHeaderValues: Object.fromEntries(
      requestEntries
        .filter(([name]) => REQUEST_HEADERS_KEPT_WITH_VALUES.includes(name.toLowerCase()))
        .map(([name, value]) => [name, String(value)]),
    ),
    responseHeaderNames: responseEntries.map(([name]) => name),
    requestBody: bodySkeleton(requestBody, contentTypeOf(requestEntries)),
    responseBody: bodySkeleton(responseBody, contentTypeOf(responseEntries)),
    ...(status >= 400 ? errorFields(responseBody) : {}),
  });
}
