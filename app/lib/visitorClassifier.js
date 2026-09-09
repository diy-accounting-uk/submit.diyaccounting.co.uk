// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/visitorClassifier.js

const AI_AGENT_PATTERNS = ["claudedesktop", "chatgpt-user", "perplexity-user", "google-extended"];

const CRAWLER_PATTERNS = ["googlebot", "bingbot", "applebot", "slurp", "duckduckbot", "baiduspider", "yandexbot"];

/**
 * Classify a visitor based on their User-Agent string.
 * @param {string} userAgent
 * @returns {"human"|"ai-agent"|"crawler"}
 */
export function classifyVisitor(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return "human";

  const lower = userAgent.toLowerCase();

  for (const pattern of AI_AGENT_PATTERNS) {
    if (lower.includes(pattern)) return "ai-agent";
  }

  for (const pattern of CRAWLER_PATTERNS) {
    if (lower.includes(pattern)) return "crawler";
  }

  return "human";
}
