// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-23 Classify visitor kind as human, bot or synthetic
// - **Use when:** a Lambda, RUM script or GA4 tag must agree on human, bot or synthetic.
// - **Does:** visitorClassifier.js classifies a User-Agent server-side as human, ai-agent or crawler. visitor-kind.js is the RUM client's browser-side equivalent, classifying a session as human, bot or synthetic. It reads the same user-agent substrings, plus the requestIdPrefix marker behaviour tests set, so RUM and GA4 agree.
// - **Run:** `import { classifyVisitor } from "app/lib/visitorClassifier.js"`; `import { classifyVisitorKind } from "web/public/lib/utils/visitor-kind.js"`
// - **Entry:** `app/lib/visitorClassifier.js:classifyVisitor`; `web/public/lib/utils/visitor-kind.js:classifyVisitorKind`
// - **Files:** app/lib/visitorClassifier.js, app/unit-tests/lib/visitorClassifier.test.js, web/public/lib/utils/visitor-kind.js, web/unit-tests/visitor-kind.test.js, web/unit-tests/rum-visitor-kind.test.js
// - **Keywords:** visitor kind, human bot synthetic, ai-agent crawler, user-agent classification, requestidprefix, rum ga4 agreement
// - **Related:** DATA-24
// @end-capability

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
