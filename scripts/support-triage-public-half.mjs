#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-triage-public-half.mjs
//
// Makes the public half of a support-triage answer safe to post. The model names an FAQ id (or
// "none") under "## Matched article". This script builds the link itself, only for an id that
// exists in web/public/faqs.toml, and removes every other URL from the text. The help page opens
// the entry named by a #<faq-id> fragment.
//
// usage: support-triage-public-half.mjs <faqs.toml> <public-half.md>   (rewrites the file in place)

import { readFileSync, writeFileSync } from "node:fs";

const HELP_URL = "https://submit.diyaccounting.co.uk/help.html";

export function faqIds(tomlText) {
  return new Set([...tomlText.matchAll(/^id\s*=\s*"([^"]+)"\s*$/gm)].map((match) => match[1]));
}

export function matchedArticleLine(sectionBody, ids) {
  const first = sectionBody
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const candidate = (first ?? "").replace(/^[`*_\s]+|[`*_\s.]+$/g, "");
  return ids.has(candidate) ? `${HELP_URL}#${candidate}` : "no match";
}

export function sanitizePublicHalf(text, faqsToml) {
  const ids = faqIds(faqsToml);
  const matched = /^## Matched article\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  let result = text;
  if (matched) {
    result = text.replace(matched[0], `## Matched article\n\n${matchedArticleLine(matched[1], ids)}\n\n`);
  }
  const pattern = /https?:\/\/[^\s)>\]]*/gi;
  // Keep only the links this script built; any other URL, including a model-written one, goes.
  return result.replace(pattern, (url) =>
    url.startsWith(`${HELP_URL}#`) && ids.has(url.slice(HELP_URL.length + 1)) ? url : "[link removed]",
  );
}

function main() {
  const [faqsPath, filePath] = process.argv.slice(2);
  if (!faqsPath || !filePath) {
    console.error("usage: support-triage-public-half.mjs <faqs.toml> <public-half.md>");
    process.exit(1);
  }
  writeFileSync(filePath, sanitizePublicHalf(readFileSync(filePath, "utf8"), readFileSync(faqsPath, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
