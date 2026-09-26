// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/visitorClassifier.js

const AI_AGENT_PATTERNS = ["claudedesktop", "chatgpt-user", "perplexity-user", "google-extended"];

const CRAWLER_PATTERNS = ["googlebot", "bingbot", "applebot", "slurp", "duckduckbot", "baiduspider", "yandexbot"];

// Our own automated browsers, identified by the marker each one already sends: the Playwright
// suite (playwright.config.js's global `use.userAgent`, which covers every behaviour-test
// project, the probe workflow that runs those same suites against ci/prod, and the video-capture
// scene runner) appends "DIYAccountingProbe/<n>"; the CloudWatch Synthetics canaries (OpsStack)
// set their whole user agent to "DIYAccounting-Probe-Monitor/<n>". web/public/lib/utils/visitor-kind.js
// applies the same two markers client-side, so a session tags the same way from the browser and
// from this server-side check.
const SYNTHETIC_PATTERNS = ["diyaccountingprobe", "diyaccounting-probe-monitor"];

/**
 * Classify a visitor based on their User-Agent string.
 * @param {string} userAgent
 * @returns {"human"|"ai-agent"|"crawler"|"synthetic"}
 */
export function classifyVisitor(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return "human";

  const lower = userAgent.toLowerCase();

  for (const pattern of SYNTHETIC_PATTERNS) {
    if (lower.includes(pattern)) return "synthetic";
  }

  for (const pattern of AI_AGENT_PATTERNS) {
    if (lower.includes(pattern)) return "ai-agent";
  }

  for (const pattern of CRAWLER_PATTERNS) {
    if (lower.includes(pattern)) return "crawler";
  }

  return "human";
}
