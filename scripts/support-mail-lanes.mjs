// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-mail-lanes.mjs
//
// Chooses one lane for a message in the support inbox, in code, with no model. The inputs are the
// sender registry (support-mail-registry.toml), the subject and the Authentication-Results header
// that Google wrote. The result is one of customer, record, notice, unverified or withheld.
//
// The header is read as Google writes it: the topmost Authentication-Results header, whose
// authserv-id is mx.google.com. A header lower in the message can be forged by the sender, so it
// is never read. A dkim=pass counts when its signing domain (header.i or header.d) is the
// registered DKIM domain or a subdomain of it. A pass for a mailing service alone does not count.

import { readFileSync } from "node:fs";
import toml from "@iarna/toml";

export const LANES = ["customer", "record", "notice", "unverified", "withheld"];
const REGISTRY_LANES = ["record", "notice"];
const GOOGLE_AUTHSERV_ID = "mx.google.com";

// A subject that looks like login mail. Its text never reaches an issue.
export const LOGIN_SUBJECT = new RegExp(
  [
    "verification code",
    "security code",
    "login code",
    "one-time",
    "\\botp\\b",
    "password",
    "sign[- ]?in",
    "log[- ]?in",
    "two-step",
    "2-step",
    "confirm your (e-?mail|account)",
    "verify your",
  ].join("|"),
  "i",
);

export const DEFAULT_REGISTRY_PATH = new URL("./support-mail-registry.toml", import.meta.url);

const underOrEqual = (domain, parent) => domain === parent || domain.endsWith(`.${parent}`);

/** Parses and checks the registry text. Throws on an entry the intake could not apply. */
export function parseRegistry(text) {
  const entries = (toml.parse(text).sender ?? []).map((raw, index) => {
    const label = `registry entry ${index + 1}`;
    for (const key of ["domain", "dkim", "lane"]) {
      if (typeof raw[key] !== "string" || raw[key] === "") throw new Error(`${label} has no ${key}`);
    }
    if (!REGISTRY_LANES.includes(raw.lane)) throw new Error(`${label} has the lane ${raw.lane}`);
    if (raw.subject !== undefined && typeof raw.subject !== "string") throw new Error(`${label} has a subject that is not text`);
    return {
      domain: raw.domain.toLowerCase(),
      dkim: raw.dkim.toLowerCase(),
      lane: raw.lane,
      subject: raw.subject === undefined ? null : new RegExp(raw.subject, "i"),
    };
  });
  for (const domain of new Set(entries.map((entry) => entry.domain))) {
    if (!entries.some((entry) => entry.domain === domain && entry.subject === null))
      throw new Error(`registry domain ${domain} has no default entry`);
  }
  return entries;
}

export function loadRegistry(path = DEFAULT_REGISTRY_PATH) {
  return parseRegistry(readFileSync(path, "utf8"));
}

/** The entry for a sender domain and subject: longest domain, then the first subject match, then the default. */
export function findEntry(registry, domain, subject) {
  const matching = registry.filter((entry) => underOrEqual(domain, entry.domain));
  if (matching.length === 0) return null;
  const longest = Math.max(...matching.map((entry) => entry.domain.length));
  const same = matching.filter((entry) => entry.domain.length === longest);
  return same.find((entry) => entry.subject?.test(subject)) ?? same.find((entry) => entry.subject === null);
}

/** The signing domains of every dkim=pass in Google's header, or an empty list when the header is missing or not Google's. */
export function dkimPassDomains(headers) {
  const first = (headers ?? []).find((header) => header.name.toLowerCase() === "authentication-results");
  if (!first) return [];
  const [authserv, ...results] = first.value.replace(/\([^)]*\)/g, " ").split(";");
  if (authserv.trim().split(/\s+/)[0].toLowerCase() !== GOOGLE_AUTHSERV_ID) return [];
  const domains = [];
  for (const result of results) {
    if (!/^\s*dkim\s*=\s*pass\b/i.test(result)) continue;
    const signer = result.match(/header\.[id]\s*=\s*"?([^\s";]+)/i);
    if (signer) domains.push(signer[1].split("@").pop().toLowerCase());
  }
  return domains;
}

export function dkimPasses(headers, dkimDomain) {
  return dkimPassDomains(headers).some((domain) => underOrEqual(domain, dkimDomain));
}

/**
 * The lane of one message. A sender who is neither registered nor automated is a customer; the
 * registry decides every other sender, and an automated sender outside it gets the notice lane.
 */
export function chooseLane({ registry, automated, domain, subject, headers }) {
  const entry = findEntry(registry, domain, subject);
  if (!automated && !entry) return "customer";
  if (LOGIN_SUBJECT.test(subject)) return "withheld";
  if (!entry) return "notice";
  return dkimPasses(headers, entry.dkim) ? entry.lane : "unverified";
}
