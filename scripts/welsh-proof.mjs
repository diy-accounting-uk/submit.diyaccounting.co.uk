#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-35 Prove the Welsh pages read in Welsh on a running site
// - **Use when:** a change to i18n/cy.toml, a Welsh page or a page script has deployed, and every Welsh page must be shown to read in Welsh, signed in.
// - **Does:** welsh-proof.mjs signs in (the Cognito test user from cognito-native-test-credentials.json, or the mock identity provider on a local simulator), chooses Welsh with the site's own language switch, then opens every page under web/public/cy/ that --only selects. It reads each page for lang="cy" on the html element and for English sentences left in the Welsh text. It prints one line per finding and a summary line, and exits 1 on any finding.
// - **Run:** `HMRC_ACCOUNT=synthetic node scripts/welsh-proof.mjs --base https://submit.diyaccounting.co.uk --only both`, between `npm run test:enableCognitoNative -- prod` and `npm run test:disableCognitoNative`; on the simulator, `node scripts/welsh-proof.mjs --base http://localhost:3000/ --only both --no-pace` beside `TEST_SERVER_HTTP_PORT=3000 npm run start:simulator`
// - **Entry:** `scripts/welsh-proof.mjs:main`; `scripts/welsh-proof.mjs:englishSentences`
// - **Files:** scripts/welsh-proof.mjs, app/unit-tests/scripts/welshProof.test.js
// - **Keywords:** welsh, cymraeg, welsh proof, lang cy, english left in welsh, language switch, cy pages, signed-in welsh
// - **Related:** SITE-30, DEV-49
// @end-capability

// scripts/welsh-proof.mjs
//
// Opens every Welsh page of a running site in Welsh and reports what is not Welsh.
//
// Pages: every .html file under web/public/cy/ in this checkout. The public pages (the home page,
// the site pages and the sign-in page) are always read; --only vat adds the HMRC pages (cy/hmrc/),
// --only ch adds the Companies House pages (cy/companies-house/), --only both adds both. The HMRC
// and Companies House pages are read signed in.
//
// Sign-in: a --base on localhost or 127.0.0.1 over http is a local simulator, which signs in
// through the mock identity provider with a fixed test username. Any other --base signs in as the
// Cognito test user in cognito-native-test-credentials.json, which `npm run test:enableCognitoNative`
// writes, at the host the site's own submit.env names. No credential is printed or logged.
// HMRC_ACCOUNT, when set, is the hmrcAccount the HMRC pages read (synthetic for the sandbox).
//
// The English-sentence rule. The text of each block of a page is cut into sentences at ". ", "! ",
// "? " and line ends. Text inside an element with lang="en…", inside code, pre, kbd, samp, script,
// style or a form field, inside an element marked translate="no", and text that is not shown, is not
// read. A sentence is English when it holds at least two words of ENGLISH_FUNCTION_WORDS and they
// make up at least a fifth of its words. That list holds common English words that are not also
// Welsh words, so "a", "i", "at", "am", "all", "can", "do", "her", "is", "or", "to" and "un" are left
// out, and it holds no word that names a filing ("return", "accounts", "company"). A proper name, an
// HMRC or Companies House term with no Welsh form ("Making Tax Digital", "Companies House", "VAT"),
// a reference or a code holds at most one such word, so it does not fire the rule. A sentence of one
// or two words ("Sign out") is too short to fire it.
//
// Reading a page: the script waits for the page's own content, its main landmark and the
// data-chrome-language attribute page-chrome.js sets on the html element once the site's text is
// in the chosen language. It then waits up to NETWORK_IDLE_WAIT_MS for the network to go quiet,
// and reads the page either way; a page that stays busy is named with the requests still open.
//
// Pacing: a deployed site's firewall answers 403 to an address that sends more than 2,000 requests
// in 5 minutes. Before each page the script counts the browser's requests in the last 5 minutes and
// waits while that count is at REQUEST_BUDGET, which leaves room for the next page's requests.
// --no-pace turns the wait off, for the local simulator.
//
// Usage:
//   node scripts/welsh-proof.mjs --base <site> [--only vat|ch|both] [--credentials <file>] [--no-pace]

/* global document, window, NodeFilter, getComputedStyle -- the functions passed to page.evaluate run in the browser */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { readCredentials, signIn as signInWithCognito, DEFAULT_CREDENTIALS_FILE } from "./mint-exploratory-state.mjs";
import { resolveDeployedBaseUrl } from "./use-deployed-base-url.js";

const WELSH_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "cy");
export const ONLY_CHOICES = ["vat", "ch", "both"];
const SIGNED_IN_FOLDERS = { vat: ["hmrc/"], ch: ["companies-house/"], both: ["hmrc/", "companies-house/"] };
const SIMULATOR_USERNAME = "welsh-proof";

export const ENGLISH_FUNCTION_WORDS = new Set(
  [
    "the",
    "and",
    "you",
    "your",
    "of",
    "for",
    "with",
    "this",
    "that",
    "these",
    "those",
    "are",
    "be",
    "been",
    "not",
    "will",
    "from",
    "have",
    "has",
    "it",
    "its",
    "we",
    "our",
    "they",
    "their",
    "them",
    "there",
    "on",
    "in",
    "into",
    "if",
    "an",
    "by",
    "as",
    "was",
    "were",
    "what",
    "when",
    "which",
    "who",
    "how",
    "about",
    "after",
    "before",
    "only",
    "more",
    "must",
    "should",
    "would",
    "could",
    "here",
    "than",
    "then",
    "my",
    "his",
    "she",
    "he",
    "does",
    "page",
    "under",
    "also",
    "any",
    "each",
    "every",
    "no",
    "yes",
    "get",
    "use",
    "used",
    "using",
    "need",
    "needs",
    "make",
    "see",
    "find",
    "add",
    "check",
    "send",
    "sends",
    "sent",
    "back",
    "out",
    "up",
    "over",
    "now",
    "new",
    "one",
    "two",
    "first",
    "last",
    "year",
    "years",
    "month",
    "months",
    "cost",
    "costs",
    "real",
    "nothing",
    "features",
    "feature",
    "request",
    "access",
    "listed",
    "official",
    "reviews",
    "you're",
    "it's",
    "don't",
    "can't",
    "isn't",
    "there's",
    "what's",
    "here's",
  ].map((word) => word.toLowerCase()),
);

const CONTENT_WAIT_MS = 30000;
const NETWORK_IDLE_WAIT_MS = 10000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
export const REQUEST_BUDGET = 1500;

const MINIMUM_FUNCTION_WORDS = 2;
const MINIMUM_FUNCTION_WORD_SHARE = 0.2;

export function parseArguments(argv) {
  const options = { base: null, only: "both", credentialsFile: DEFAULT_CREDENTIALS_FILE, pace: true };
  const valueFlags = { "--base": "base", "--only": "only", "--credentials": "credentialsFile" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--no-pace") {
      options.pace = false;
      continue;
    }
    const key = valueFlags[argv[index]];
    if (!key) throw new Error(`Unknown argument ${argv[index]}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argv[index]} needs a value`);
    options[key] = value;
    index += 1;
  }
  if (!options.base) throw new Error("--base <site> is required");
  if (!ONLY_CHOICES.includes(options.only)) throw new Error(`--only must be one of ${ONLY_CHOICES.join(", ")}`);
  return options;
}

/**
 * How long to wait before the next page so the browser stays under the firewall's rate rule: zero
 * while fewer than REQUEST_BUDGET requests went out in the last five minutes, otherwise until
 * enough of them are older than five minutes.
 * @param {number[]} requestTimes - when each request went out, epoch milliseconds, oldest first
 * @param {number} nowMs
 * @returns {number}
 */
export function paceWaitMs(requestTimes, nowMs) {
  const recent = requestTimes.filter((time) => nowMs - time < RATE_WINDOW_MS);
  if (recent.length < REQUEST_BUDGET) return 0;
  return recent[recent.length - REQUEST_BUDGET] + RATE_WINDOW_MS - nowMs;
}

/** True when the base is a local simulator: http on localhost or 127.0.0.1. */
export function isLocalSimulator(base) {
  const url = new URL(base);
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/**
 * The Welsh pages to read, as site paths under cy/: every public page, and the HMRC or Companies
 * House pages that --only selects.
 * @param {string[]} welshFiles - paths under web/public/cy/, such as "hmrc/vat/submitVat.html"
 * @param {"vat"|"ch"|"both"} only
 */
export function pagesToRead(welshFiles, only) {
  const allSignedInFolders = SIGNED_IN_FOLDERS.both;
  return welshFiles
    .filter(
      (file) =>
        !allSignedInFolders.some((folder) => file.startsWith(folder)) || SIGNED_IN_FOLDERS[only].some((folder) => file.startsWith(folder)),
    )
    .map((file) => `cy/${file}`)
    .sort();
}

function listWelshFiles(directory = WELSH_ROOT, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listWelshFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`);
    return entry.name.endsWith(".html") ? [`${prefix}${entry.name}`] : [];
  });
}

/** The sentences of a block of text, trimmed, with empty ones left out. */
export function sentencesOf(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence !== "");
}

/** True when a sentence reads as English by the rule in this file's header. */
export function isEnglishSentence(sentence) {
  const words = sentence.toLowerCase().match(/[a-zÀ-ſ']+/g) ?? [];
  if (words.length === 0) return false;
  const functionWords = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length;
  return functionWords >= MINIMUM_FUNCTION_WORDS && functionWords / words.length >= MINIMUM_FUNCTION_WORD_SHARE;
}

/** The English sentences in the text blocks of a page. */
export function englishSentences(blocks) {
  return blocks.flatMap((block) => sentencesOf(block)).filter(isEnglishSentence);
}

/**
 * The findings of one page: a missing lang="cy", and each English sentence.
 * @param {{path: string, lang: string, blocks: string[]}} page
 * @returns {string[]} one line per finding
 */
export function findingsOf({ path: pagePath, lang, blocks }) {
  const findings = [];
  if (lang !== "cy") findings.push(`${pagePath}: html lang is "${lang}", not "cy"`);
  for (const sentence of new Set(englishSentences(blocks))) findings.push(`${pagePath}: English sentence "${sentence}"`);
  return findings;
}

// Runs in the page: the text of each block that holds text of its own, leaving out English-marked,
// code and form text.
function readPageInBrowser() {
  const SKIPPED = "script, style, noscript, template, code, pre, kbd, samp, textarea, select, option, input, [translate='no']";
  const blockTags = new Set([
    "P",
    "LI",
    "TD",
    "TH",
    "DT",
    "DD",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LABEL",
    "LEGEND",
    "CAPTION",
    "FIGCAPTION",
    "BUTTON",
    "SUMMARY",
    "BLOCKQUOTE",
    "DIV",
    "SECTION",
    "ARTICLE",
    "HEADER",
    "FOOTER",
    "NAV",
    "MAIN",
    "ASIDE",
    "FORM",
    "FIELDSET",
    "BODY",
  ]);
  const skipped = (element) => element.closest(SKIPPED) || element.closest("[lang^='en']");
  const blocks = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textByBlock = new Map();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || skipped(parent) || node.textContent.trim() === "") continue;
    if (parent.offsetParent === null && getComputedStyle(parent).position !== "fixed") continue;
    let block = parent;
    while (block.parentElement && !blockTags.has(block.tagName)) block = block.parentElement;
    textByBlock.set(block, `${textByBlock.get(block) ?? ""}${node.textContent}`);
  }
  for (const text of textByBlock.values()) blocks.push(text);
  return { lang: document.documentElement.getAttribute("lang") ?? "", blocks };
}

async function signInOnSimulator(page, base) {
  await page.goto(new URL("auth/login.html", base).toString(), { waitUntil: "domcontentloaded" });
  await page.locator("button:has-text('Continue with mock-oauth2-server')").click();
  await page.locator('input[type="submit"][value="Sign-in"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('input[name="username"]').fill(SIMULATOR_USERNAME);
  await page.locator('textarea[name="claims"]').fill(JSON.stringify({ email: `synthetic-${SIMULATOR_USERNAME}@test.diyaccounting.co.uk` }));
  await page.locator('input[type="submit"][value="Sign-in"]').click();
  await page.locator("a.login-link", { hasText: "Sign out" }).waitFor({ state: "visible", timeout: 30000 });
}

async function chooseWelsh(page, base) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const welshOption = page.locator(".language-switch a[lang='cy']");
  await welshOption.waitFor({ state: "visible", timeout: 15000 });
  await welshOption.click();
  await page.waitForFunction(() => window.localStorage.getItem("siteLanguage") === "cy", null, { timeout: 15000 });
}

// The page's own content is present: its main landmark, and the site's text in the chosen language.
async function waitForContent(page) {
  await page.locator("main").first().waitFor({ state: "attached", timeout: CONTENT_WAIT_MS });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-chrome-language"), null, { timeout: CONTENT_WAIT_MS });
}

async function readPage(page, base, pagePath, openRequests) {
  const response = await page.goto(new URL(pagePath, base).toString(), { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) return { path: pagePath, error: `answered ${response ? response.status() : "nothing"}` };
  await waitForContent(page);
  let busy = null;
  try {
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_WAIT_MS });
  } catch {
    busy = [...openRequests].map((request) => `${request.method()} ${request.url()}`);
  }
  return { path: pagePath, busy, ...(await page.evaluate(readPageInBrowser)) };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const local = isLocalSimulator(options.base);
  const credentials = local ? null : readCredentials(options.credentialsFile);
  const base = local ? options.base : await resolveDeployedBaseUrl(options.base);
  const pages = pagesToRead(listWelshFiles(), options.only);
  const hmrcAccount = process.env.HMRC_ACCOUNT;

  const browser = await chromium.launch({ headless: true });
  const findings = [];
  const requestTimes = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (hmrcAccount) await context.addInitScript((account) => window.sessionStorage.setItem("hmrcAccount", account), hmrcAccount);
    const openRequests = new Set();
    context.on("request", (request) => {
      requestTimes.push(Date.now());
      openRequests.add(request);
    });
    context.on("requestfinished", (request) => openRequests.delete(request));
    context.on("requestfailed", (request) => openRequests.delete(request));
    const page = await context.newPage();
    if (local) await signInOnSimulator(page, base);
    else await signInWithCognito(page, base, credentials);
    await chooseWelsh(page, base);
    for (const pagePath of pages) {
      const waitMs = options.pace ? paceWaitMs(requestTimes, Date.now()) : 0;
      if (waitMs > 0) {
        console.log(`Pausing ${Math.ceil(waitMs / 1000)} s to stay under ${REQUEST_BUDGET} requests in 5 minutes`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      const read = await readPage(page, base, pagePath, openRequests);
      if (read.busy)
        console.log(
          `${pagePath}: network still busy after ${NETWORK_IDLE_WAIT_MS / 1000} s, read anyway; open: ${read.busy.join(", ") || "none"}`,
        );
      if (read.error) findings.push(`${pagePath}: ${read.error}`);
      else findings.push(...findingsOf(read));
    }
  } finally {
    await browser.close();
  }

  for (const finding of findings) console.log(finding);
  console.log(
    `Welsh proof at ${base} (--only ${options.only}): ${pages.length} pages read, ${findings.length} findings, ${requestTimes.length} requests`,
  );
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
