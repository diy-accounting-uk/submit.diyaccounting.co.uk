#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/content-scan.mjs
//
// Reads a unified diff (from stdin, or a file named on the command line) and checks every
// line the diff adds — never a removed or context line — against two pattern sets: secrets
// (checked in every file, tests included) and personal data (checked outside the repository's
// own test directories and any `/fixtures/` path, where a fake identifier is expected). A
// value the repository publishes on purpose (its own support address, a documented example) is
// exempted by an entry in the allow-list file (.github/content-scan-allow.txt by default).
// Prints one "file:line label" per hit and never the matched text, so the check's own output
// cannot leak what it found. Exits 1 on any hit.
//
// Unlike a generic PII redactor, every pattern here is narrowed so it does not fire on this
// repository's own ordinary content: a VRN, UTR or EORI only counts near its keyword, an IPv4
// only counts when it is a real routable address, and an email only counts outside the
// repository's own and the reserved example domains.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_ALLOW_LIST_PATH = fileURLToPath(new URL("../.github/content-scan-allow.txt", import.meta.url));
const ALLOW_LIST_REPO_PATH = ".github/content-scan-allow.txt";

const KEYWORD_WINDOW = 20;

const OWN_EMAIL_DOMAINS = ["diyaccounting.co.uk", "diya-gl.co.uk", "polycode.co.uk"];
const RESERVED_EMAIL_DOMAINS = ["example.com", "example.org", "example.net"];
const RESERVED_EMAIL_TLDS = ["example", "test", "invalid", "localhost"];

const PERSONAL_DATA_EXEMPT_PREFIXES = [
  "app/unit-tests/",
  "app/system-tests/",
  "web/unit-tests/",
  "web/browser-tests/",
  "behaviour-tests/",
  "mcp/test/",
  "infra/test/",
];

/** Excludes a NINO's two invalid first letters (D,F,I,Q,U,V) and second-letter set (adds O). */
const NINO_FIRST_LETTER = "ABCEGHJKLMNOPRSTWXYZ";
const NINO_SECOND_LETTER = "ABCEGHJKLMNPRSTWXYZ";
const NINO_RE = new RegExp(`\\b(?!BG|GB|NK|KN|TN|NT|ZZ)[${NINO_FIRST_LETTER}][${NINO_SECOND_LETTER}]\\d{6}[A-D]\\b`, "gi");

function isMixedAlphanumeric(token) {
  return /[A-Za-z]/.test(token) && /[0-9]/.test(token);
}

function distanceBetweenSpans(startA, endA, startB, endB) {
  if (startA >= endB) return startA - endB;
  if (startB >= endA) return startB - endA;
  return 0;
}

function isKeywordNearby(text, matchIndex, matchLength, keywordRe) {
  const flags = keywordRe.flags.includes("g") ? keywordRe.flags : `${keywordRe.flags}g`;
  const re = new RegExp(keywordRe.source, flags);
  const matchEnd = matchIndex + matchLength;
  let keywordMatch;
  while ((keywordMatch = re.exec(text))) {
    const gap = distanceBetweenSpans(matchIndex, matchEnd, keywordMatch.index, keywordMatch.index + keywordMatch[0].length);
    if (gap <= KEYWORD_WINDOW) return true;
  }
  return false;
}

function isExampleOrOwnEmailDomain(domain) {
  const lower = domain.toLowerCase();
  if (OWN_EMAIL_DOMAINS.some((own) => lower === own || lower.endsWith(`.${own}`))) return true;
  if (RESERVED_EMAIL_DOMAINS.includes(lower)) return true;
  return RESERVED_EMAIL_TLDS.some((tld) => lower === tld || lower.endsWith(`.${tld}`));
}

/** True for a private, link-local or documentation-reserved IPv4 block, and the broadcast address. */
function isPrivateOrReservedIPv4([a, b, c, d]) {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
  return false;
}

function isQualifyingPublicIPv4(match, text) {
  const octets = match[0].split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const start = match.index;
  const end = start + match[0].length;
  // "v1.2.3.4" (semver) and "Chrome/131.0.0.0" (a User-Agent version) are both version numbers,
  // not addresses; the char right before the match tells them apart from a real IP.
  const precededByVersionMarker = /[vV/]$/.test(text.slice(0, start));
  const partOfLongerDottedNumber = /\d\.$/.test(text.slice(0, start)) || /^\.\d/.test(text.slice(end));
  if (precededByVersionMarker || partOfLongerDottedNumber) return false;
  return !isPrivateOrReservedIPv4(octets);
}

/** Checked in every file. Each label is self-descriptive; no per-pattern comment needed. */
const SECRET_PATTERNS = [
  { label: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { label: "private-key-block", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----/g },
  {
    label: "bearer-token",
    re: /\bBearer\s+([A-Za-z0-9._~+/-]{20,})/g,
    isValid: (m) => isMixedAlphanumeric(m[1]),
  },
];

/** Checked outside PERSONAL_DATA_EXEMPT_PREFIXES and any `/fixtures/` path. */
const PERSONAL_DATA_PATTERNS = [
  { label: "nino", re: NINO_RE },
  {
    label: "vrn",
    re: /\b\d{9}\b/g,
    isValid: (m, text) => isKeywordNearby(text, m.index, m[0].length, /\b(?:VRN|VAT)\b/gi),
  },
  {
    label: "utr",
    re: /\b\d{10}\b/g,
    isValid: (m, text) => isKeywordNearby(text, m.index, m[0].length, /\bUTR\b/gi),
  },
  { label: "eori", re: /\b(?:GB|XI)\d{12}(?:\d{3})?\b/g },
  {
    label: "eori",
    re: /\b\d{12}\b/g,
    isValid: (m, text) => isKeywordNearby(text, m.index, m[0].length, /\bEORI\b/gi),
  },
  {
    label: "email",
    re: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    isValid: (m) => !isExampleOrOwnEmailDomain(m[1]),
  },
  {
    label: "public-ipv4",
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    isValid: (m, text) => isQualifyingPublicIPv4(m, text),
  },
];

function isExemptFromPersonalDataScan(file) {
  if (!file) return false;
  if (file.startsWith("fixtures/") || file.includes("/fixtures/")) return true;
  // npm rewrites every package-lock.json wholesale on each dependency update, and its content
  // is third-party package metadata (a maintainer's own published contact address, say), never
  // something a contributor authors here.
  if (file === "package-lock.json" || file.endsWith("/package-lock.json")) return true;
  return PERSONAL_DATA_EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function findHits(text, patterns) {
  const hits = [];
  for (const { label, re, isValid } of patterns) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const regex = new RegExp(re.source, flags);
    let m;
    while ((m = regex.exec(text))) {
      if (!isValid || isValid(m, text)) {
        hits.push({ label, matchedText: m[0] });
      }
    }
  }
  return hits;
}

/**
 * Parses an allow-list file: one entry per line, blank lines and lines starting with `#`
 * ignored. A line wrapped in a leading and trailing `/` is a case-insensitive regex; anything
 * else is matched as an exact string.
 */
export function parseAllowList(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const regexBody = line.match(/^\/(.*)\/$/);
      return regexBody ? new RegExp(regexBody[1], "i") : line;
    });
}

function isAllowed(matchedText, allowList) {
  return allowList.some((entry) => (entry instanceof RegExp ? entry.test(matchedText) : matchedText === entry));
}

/**
 * Parses a unified diff into one entry per added line: { file, lineNumber, text }.
 * `lineNumber` is the line's number in the new file, tracked from each hunk's
 * `@@ -a,b +c,d @@` header. Removed and context lines are read only to keep that counter
 * correct; they are never returned, so text a push or PR takes OUT of the repository is not
 * scanned.
 */
export function addedLines(diffText) {
  const entries = [];
  let file = null;
  let newLineNumber = null;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      newLineNumber = null;
      continue;
    }
    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      newLineNumber = Number(hunkHeader[1]);
      continue;
    }
    if (newLineNumber === null || file === null) continue;
    if (line.startsWith("+")) {
      entries.push({ file, lineNumber: newLineNumber, text: line.slice(1) });
      newLineNumber += 1;
    } else if (line.startsWith("-")) {
      // Removed line: does not exist in the new file, so the new-line counter does not move.
    } else {
      newLineNumber += 1;
    }
  }
  return entries;
}

/**
 * Scans a list of { file, lineNumber, text } entries: secrets against every entry, personal
 * data only against entries whose file is not exempt. Skips any hit the allow-list exempts.
 * Returns one { file, lineNumber, label } per hit, never the matched text.
 */
export function scanEntries(entries, allowList) {
  const hits = [];
  for (const { file, lineNumber, text } of entries) {
    // The allow-list file's own job is to spell out exact secret- and PII-shaped strings so
    // they stop matching everywhere else; scanning its own lines against those same patterns
    // is circular, so it is exempt from every pattern, not just personal data.
    if (file === ALLOW_LIST_REPO_PATH) continue;
    const patterns = isExemptFromPersonalDataScan(file) ? SECRET_PATTERNS : [...SECRET_PATTERNS, ...PERSONAL_DATA_PATTERNS];
    for (const { label, matchedText } of findHits(text, patterns)) {
      if (!isAllowed(matchedText, allowList)) {
        hits.push({ file, lineNumber, label });
      }
    }
  }
  return hits;
}

/** Scans a unified diff's added lines only. The entry point the content-scan workflow calls. */
export function scanDiff(diffText, allowList) {
  return scanEntries(addedLines(diffText), allowList);
}

function loadAllowList(path) {
  return parseAllowList(existsSync(path) ? readFileSync(path, "utf8") : "");
}

function readAllStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const args = process.argv.slice(2);
  const allowListFlagIndex = args.indexOf("--allow-list");
  const allowListPath = allowListFlagIndex >= 0 ? args[allowListFlagIndex + 1] : DEFAULT_ALLOW_LIST_PATH;
  const positional = args.filter(
    (arg, i) => !(allowListFlagIndex >= 0 && (i === allowListFlagIndex || i === allowListFlagIndex + 1)) && !arg.startsWith("--"),
  );
  const diffText = positional[0] ? readFileSync(positional[0], "utf8") : readAllStdin();

  const allowList = loadAllowList(allowListPath);
  const hits = scanDiff(diffText, allowList);
  for (const hit of hits) {
    console.log(`${hit.file}:${hit.lineNumber} ${hit.label}`);
  }
  if (hits.length > 0) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
