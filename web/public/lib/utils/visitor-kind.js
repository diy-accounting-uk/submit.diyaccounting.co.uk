// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/lib/utils/visitor-kind.js
// Classifies a browser session for the analytics visitor panels. The GA4 client
// (lib/analytics.js, a plain script that keeps its own copy of this rule so it can run
// before any module loads) and the RUM client here both tag their session with the result,
// so a visitor panel that excludes synthetic traffic sees the same split either way.

// User-agent substrings for crawlers and AI agents (app/lib/visitorClassifier.js applies the
// same list server-side) plus the string CloudWatch Synthetics canaries set as their own
// user agent (see OpsStack's canary scripts).
const BOT_USER_AGENT_PATTERNS = [
  "googlebot",
  "bingbot",
  "applebot",
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "claudedesktop",
  "chatgpt-user",
  "perplexity-user",
  "google-extended",
  "diyaccounting-probe-monitor",
];

// The marker behaviour tests set once a page has loaded, so every API call they make is
// identifiable (behaviour-tests/helpers/gotoWithRetries.js).
const SYNTHETIC_SESSION_STORAGE_KEY = "requestIdPrefix";
const SYNTHETIC_SESSION_STORAGE_VALUE = "test_";

/**
 * Classify the current browser session: "bot" for crawlers, AI agents and the synthetic
 * canaries; "synthetic" for the behaviour-test suites; "human" otherwise.
 *
 * @returns {"human"|"bot"|"synthetic"}
 */
export function classifyVisitorKind() {
  let userAgent = "";
  try {
    userAgent = (navigator.userAgent || "").toLowerCase();
  } catch {
    userAgent = "";
  }
  if (BOT_USER_AGENT_PATTERNS.some((pattern) => userAgent.includes(pattern))) {
    return "bot";
  }

  try {
    if (sessionStorage.getItem(SYNTHETIC_SESSION_STORAGE_KEY) === SYNTHETIC_SESSION_STORAGE_VALUE) {
      return "synthetic";
    }
  } catch {
    // sessionStorage unavailable (private browsing, disabled storage): fall through to human
  }

  return "human";
}
