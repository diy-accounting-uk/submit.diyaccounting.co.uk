// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Helpers shared by the pages built from .claude/skills/tax-sources/sources and by the source verifier.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude", "skills", "tax-sources", "sources");
export const MAX_SOURCE_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function sourcesOlderThan(sources, maxAgeDays, now = Date.now()) {
  return sources.filter((s) => now - Date.parse(`${s.retrieved}T00:00:00Z`) > maxAgeDays * DAY_MS);
}

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

/** The title of a GOV.UK page as the page names it, without the site suffix, the entities or the padding. */
export function pageTitle(pageHtml) {
  const raw = (pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1];
  if (raw === undefined) return null;
  return normaliseText(raw.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'))
    .replace(/\s+-\s+GOV\.UK$/, "")
    .trim();
}

function sourceFooterHtml(source) {
  if (!source.title) throw new Error(`${source.name ?? source.url}: the source file has no title`);
  return `<footer>Source: <a href="${escapeHtml(source.url)}" rel="noopener">GOV.UK, ${escapeHtml(source.title)}</a> (checked ${formatIsoDate(source.retrieved)})</footer>`;
}

/**
 * The sources a section cites, as one block per GOV.UK page: each quote of that page as a paragraph and
 * one link line. A page cited by several sources, or twice, prints its link once. A source whose words are
 * a table or a list prints no quote; a page with only such sources prints the link line alone.
 */
export function sourcesQuoteHtml(sources) {
  const pages = new Map();
  for (const source of sources) {
    if (!pages.has(source.url)) pages.set(source.url, []);
    pages.get(source.url).push(source);
  }
  return [...pages.values()]
    .map((group) => {
      const quotes = [...new Set(group.filter((s) => !s.table).map((s) => s.quote))];
      const newest = group.reduce((a, b) => (b.retrieved > a.retrieved ? b : a));
      const className = quotes.length === 0 ? "source-quote source-citation" : "source-quote";
      return `<blockquote class="${className}">${quotes.map((q) => `<p>${escapeHtml(q)}</p>`).join("")}${sourceFooterHtml({ ...group[0], retrieved: newest.retrieved })}</blockquote>`;
    })
    .join("");
}

export function sourceQuoteHtml(source) {
  return sourcesQuoteHtml([source]);
}
