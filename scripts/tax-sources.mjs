// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Helpers shared by the pages built from .claude/skills/tax-sources/sources and by the source verifier.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude", "skills", "tax-sources", "sources");
export const MAX_SOURCE_AGE_DAYS = 30;

export function loadSources(dir = SOURCES_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: f.slice(0, -5), ...JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatIsoDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function normaliseText(text) {
  return text
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&pound;/g, "£")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteAppearsIn(quote, pageHtml) {
  return normaliseText(pageHtml).includes(normaliseText(quote));
}

export function sourceQuoteHtml(source) {
  return (
    `<blockquote class="source-quote"><p>${escapeHtml(source.quote)}</p>` +
    `<footer><a href="${escapeHtml(source.url)}" rel="noopener">${escapeHtml(source.url.replace("https://www.gov.uk", "gov.uk"))}</a>` +
    ` <span class="retrieved">Retrieved ${formatIsoDate(source.retrieved)}</span></footer></blockquote>`
  );
}
