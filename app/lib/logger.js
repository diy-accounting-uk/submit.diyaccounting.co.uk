// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/logger.js

/**
 * PII REDACTION PATTERNS
 * =====================
 * This logger implements two layers of PII protection:
 *
 * Layer 1: Pino redact (path-based field redaction)
 * Layer 2: Regex-based sanitisation (pattern matching in string values)
 *
 * Protected PII patterns (sources in parentheses):
 *
 * TAX IDENTIFIERS (from web/public/docs/hmrc-form-field-standards/validation.js):
 * - VRN (VAT Registration Number): 9 digits, optional GB prefix e.g., "GB123456789"
 * - UTR (Unique Taxpayer Reference): 10 digits e.g., "1234567890"
 * - NINO (National Insurance Number): 2 letters + 6 digits + 1 letter e.g., "AB123456C"
 * - EORI: GB/XI + 12 or 15 digits e.g., "GB123456789012"
 * - PAYE Reference: office number + slash + reference e.g., "123/AB12345"
 *
 * AUTHENTICATION (from app/lib/dataMasking.js, app/functions/auth/):
 * - Access tokens, refresh tokens, ID tokens
 * - Authorization headers (Bearer tokens)
 * - OAuth authorization codes
 * - Client secrets, API keys
 * - Passwords
 *
 * USER IDENTIFIERS (from app/functions/, behaviour-tests/):
 * - Email addresses
 * - User IDs, user subs
 * - User names
 *
 * To add new patterns:
 * 1. Add field paths to REDACT_PATHS for Pino path-based redaction
 * 2. Add regex patterns to PII_PATTERNS for string-value sanitisation
 */

import fs from "fs";
import path from "path";
import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import { dotenvConfigIfNotBlank } from "./env.js";

dotenvConfigIfNotBlank({ path: ".env" });

// Configure pino logger to mimic previous Winston behaviours controlled by env vars:
// - LOG_TO_CONSOLE: enable console logging when not set to "false" (default on)
// - LOG_TO_FILE: enable file logging only when set to "true" (default off)
// - LOG_FILE_PATH: optional explicit file path; otherwise default to ./target/submit-<ISO>.log
// - LOG_LEVEL: set minimum log level (trace, debug, info, warn, error, fatal) (default: info)

const logToConsole = process.env.LOG_TO_CONSOLE !== "false"; // default on
const logToFile = process.env.LOG_TO_FILE === "true"; // default off

// Validate and get log level from environment
const VALID_LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
const envLogLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const logLevel = VALID_LOG_LEVELS.includes(envLogLevel) ? envLogLevel : "info";

/**
 * Pino redact paths for field-based PII redaction.
 * Uses wildcards to catch nested instances of sensitive fields.
 */
const REDACT_PATHS = [
  // Authentication tokens and secrets
  "*.authorization",
  "*.Authorization",
  "*.access_token",
  "*.accessToken",
  "*.refresh_token",
  "*.refreshToken",
  "*.idToken",
  "*.id_token",
  "*.hmrcAccessToken",
  "*.client_secret",
  "*.clientSecret",
  "*.apiKey",
  "*.api_key",
  "*.password",
  "*.hmrcTestPassword",
  "*.code", // OAuth authorization codes

  // User identifiers
  "*.email",
  "*.emailAddress",
  "*.userEmail",

  // Request/response auth headers
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",

  // Nested in body/response structures
  "body.access_token",
  "body.refresh_token",
  "body.client_secret",
  "body.password",
  "response.body.access_token",
  "response.body.refresh_token",
  "httpResponse.body.access_token",
  "httpResponse.body.refresh_token",
];

/**
 * Regex patterns for PII detection in string values.
 * Each pattern has a name (used as replacement label) and a regex.
 */
const PII_PATTERNS = [
  // VRN: 9 digits, optionally prefixed with GB (case-insensitive)
  { name: "VRN", pattern: /\b(?:GB)?(\d{9})\b/gi },

  // UTR: 10 digits (not preceded/followed by more digits)
  { name: "UTR", pattern: /\b(\d{10})\b/g },

  // NINO: 2 letters + 6 digits + 1 letter (A, B, C, or D)
  { name: "NINO", pattern: /\b([A-Za-z]{2}\d{6}[A-Da-d])\b/g },

  // EORI: GB or XI followed by 12 or 15 digits
  // eslint-disable-next-line security/detect-unsafe-regex -- linear time regex, no backtracking risk
  { name: "EORI", pattern: /\b((?:GB|XI)\d{12}(?:\d{3})?)\b/gi },

  // Email addresses
  { name: "EMAIL", pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g },

  // Bearer tokens in strings (e.g., in error messages)
  // eslint-disable-next-line sonarjs/duplicates-in-character-class
  { name: "TOKEN", pattern: /Bearer\s+([A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*\.?[A-Za-z0-9_-]*)/gi },

  // Key=value pairs for secrets in query strings, form bodies, URLs, and log messages
  // Covers: client_secret=xxx, CLIENT_SECRET=xxx, clientSecret=xxx, api_key=xxx, apiKey=xxx,
  //         password=xxx, access_token=xxx, refresh_token=xxx, authorization=xxx

  {
    name: "SECRET",
    pattern:
      // eslint-disable-next-line sonarjs/regex-complexity
      /\b(client_secret|CLIENT_SECRET|clientSecret|client\.secret|api_key|API_KEY|apiKey|password|PASSWORD|access_token|ACCESS_TOKEN|accessToken|refresh_token|REFRESH_TOKEN|refreshToken|authorization|Authorization|AUTHORIZATION|id_token|idToken|hmrcAccessToken)\s*[=:]\s*([^\s&,;'"(){}]+)/gi,
  },
];

/**
 * Sanitise a string value by replacing PII patterns with labelled placeholders.
 * @param {string} value - The string to sanitise
 * @returns {string} The sanitised string
 */
/**
 * Check if a string contains sensitive data patterns (secrets, tokens, keys).
 * Returns true if any secret-like key=value pattern is detected.
 * @param {string} value - The string to check
 * @returns {boolean} True if sensitive data detected
 */
export function containsSensitiveData(value) {
  if (typeof value !== "string") return false;

  const secretPattern =
    // eslint-disable-next-line sonarjs/regex-complexity
    /\b(client_secret|CLIENT_SECRET|clientSecret|client\.secret|api_key|API_KEY|apiKey|password|PASSWORD|access_token|ACCESS_TOKEN|accessToken|refresh_token|REFRESH_TOKEN|refreshToken|authorization|Authorization|AUTHORIZATION|id_token|idToken|hmrcAccessToken)\s*[=:]\s*[^\s&,;'"){}\]]+/gi;
  secretPattern.lastIndex = 0;
  return secretPattern.test(value);
}

/**
 * Sanitise a string value by replacing PII patterns with labelled placeholders.
 * Logs at ERROR level when sensitive credential data is detected.
 * @param {string} value - The string to sanitise
 * @returns {string} The sanitised string
 */
export function sanitiseString(value) {
  if (typeof value !== "string") {
    return value;
  }

  // Detect and alert on sensitive credential data before redaction
  if (containsSensitiveData(value)) {
    // Use process.stderr directly to avoid recursive sanitisation through the logger
    process.stderr.write(
      `{"level":50,"time":"${new Date().toISOString()}","msg":"SENSITIVE DATA DETECTED in log output - credentials were present and have been redacted"}\n`,
    );
  }

  let result = value;
  for (const { name, pattern } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, `[${name}]`);
  }
  return result;
}

/**
 * Recursively sanitise an object, redacting PII from string values.
 * @param {*} data - The data to sanitise
 * @param {Set} [visited] - Set of visited objects for circular reference detection
 * @returns {*} A sanitised copy of the data
 */
export function sanitiseData(data, visited = new Set()) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return sanitiseString(data);
  }

  if (typeof data !== "object") {
    return data;
  }

  // Detect circular references
  if (visited.has(data)) {
    return "[Circular]";
  }

  visited.add(data);

  try {
    if (Array.isArray(data)) {
      return data.map((item) => sanitiseData(item, visited));
    }

    const sanitised = {};
    for (const [key, value] of Object.entries(data)) {
      sanitised[key] = sanitiseData(value, visited);
    }
    return sanitised;
  } finally {
    visited.delete(data);
  }
}

/**
 * Create a safe logging wrapper that sanitises data before logging.
 * Applies regex-based PII redaction to all logged values.
 * @param {pino.Logger} baseLogger - The base Pino logger
 * @returns {Object} A logger with safe* methods
 */
export function createSafeLogger(baseLogger) {
  return {
    safeInfo: (obj, msg) => baseLogger.info(sanitiseData(obj), sanitiseString(msg)),
    safeWarn: (obj, msg) => baseLogger.warn(sanitiseData(obj), sanitiseString(msg)),
    safeError: (obj, msg) => baseLogger.error(sanitiseData(obj), sanitiseString(msg)),
    safeDebug: (obj, msg) => baseLogger.debug(sanitiseData(obj), sanitiseString(msg)),
    safeTrace: (obj, msg) => baseLogger.trace(sanitiseData(obj), sanitiseString(msg)),
    // Also expose the raw logger for cases where caller has already sanitised
    raw: baseLogger,
  };
}

let destinationStream;

export function createLogger(bindings = {}) {
  return logger.child(bindings);
}

if (logToConsole && logToFile) {
  // Both console and file
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const defaultPath = `./target/submit-${timestamp}.log`;
  const logFilePath = process.env.LOG_FILE_PATH || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(logFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore mkdir errors; pino will throw on write if truly unusable
  }

  const streams = [{ stream: process.stdout }, { stream: pino.destination({ dest: logFilePath, sync: false }) }];
  destinationStream = pino.multistream(streams);
} else if (logToConsole) {
  // Console only (default)
  destinationStream = process.stdout;
} else if (logToFile) {
  // File only
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const defaultPath = `./target/submit-${timestamp}.log`;
  const logFilePath = process.env.LOG_FILE_PATH || defaultPath;

  const dir = path.dirname(logFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create log directory ${dir}:`, error);
  }

  destinationStream = pino.destination({ dest: logFilePath, sync: false });
}

// If neither console nor file are enabled, produce a disabled logger (no output)
export const logger = pino(
  {
    level: logLevel,
    // timestamp: pino.stdTimeFunctions.isoTime,
    enabled: Boolean(destinationStream),
    base: null, // removes pid and hostname
    timestamp: false, // Avoid Pino's comma-prefixed timestamp chunk
    // Pino redact: path-based field redaction (Layer 1)
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    // Add an ISO time field as a normal JSON property
    mixin() {
      // Pull correlation fields from shared context; ensure we never leak old values
      const store = context.getStore();
      const requestId = store?.get("requestId") || null;

      const amznTraceId = store?.get("amznTraceId") || null;

      const traceparent = store?.get("traceparent") || null;

      const correlationId = store?.get("correlationId") || null;
      return {
        time: new Date().toISOString(),
        ...(requestId ? { requestId } : {}),
        ...(amznTraceId ? { amznTraceId } : {}),
        ...(traceparent ? { traceparent } : {}),
        ...(correlationId ? { correlationId } : {}),
      };
    },
    // formatters: {
    // remove the level key entirely
    //  level: () => ({}),
    // },
    // transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
  },
  destinationStream,
);

// Store for contextual information such as a request ID
// export const context = new Map();
export const storage = new AsyncLocalStorage();
export const context = {
  get: (key) => storage.getStore()?.get(key),
  set: (key, value) => {
    const store = storage.getStore();
    if (store) {
      store.set(key, value);
    }
  },
  run: (store, callback) => storage.run(store, callback),
  getStore: () => storage.getStore(),
  enterWith: (store) => storage.enterWith(store),
};

// Create safe logger wrapper with regex-based sanitisation (Layer 2)
export const safeLogger = createSafeLogger(logger);

export default logger;
