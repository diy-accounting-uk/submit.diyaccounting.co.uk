#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-67 Sync Search Console domain properties and their verification
// - **Use when:** a Search Console domain property must exist and be verified for the service account, or the DNS_CNAME verification tokens must be read.
// - **Does:** searchconsole-sync.js reads searchconsole.toml, lists the service account's verified domains and Search Console sites, and asks the Site Verification API for each unverified domain's DNS_CNAME token. A plan prints the CNAME name and target to add to DNS. With --apply it verifies each domain whose CNAME is live and adds its property. A domain whose CNAME is not yet live is reported as unverified and the run still exits zero.
// - **Run:** `npm run searchconsole:sync`; `npm run searchconsole:sync -- --apply`
// - **Entry:** `infra/google/searchconsole/searchconsole-sync.js:main`
// - **Files:** infra/google/searchconsole/searchconsole-sync.js, infra/google/searchconsole/searchconsole.toml, app/unit-tests/scripts/searchconsoleSync.test.js
// - **Keywords:** search console, site verification, dns cname token, domain property, sc-domain, verified owner
// - **Related:** DATA-38, OPS-67, DATA-47
// @end-capability

// infra/google/searchconsole/searchconsole-sync.js
//
// Usage:
//   node infra/google/searchconsole/searchconsole-sync.js
//   node infra/google/searchconsole/searchconsole-sync.js --apply
//
// Credentials: application default credentials from google-github-actions/auth's federated
// exchange.
//
// Options:
//   --apply    Verify and add. Without it, the script only reads live state and prints the plan.
//
// The service account verifies each domain itself and so becomes a verified owner. Verification
// succeeds only when the CNAME exists in DNS. Until it does, an apply reports the domain as
// unverified and exits zero, so a merge never fails for a record that is added later.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

import { createGoogleAuthorizedClient, assertFederatedCredentials } from "../lib/googleAuth.js";

export const CONFIG_PATH = "infra/google/searchconsole/searchconsole.toml";

const SITE_VERIFICATION_V1 = "https://www.googleapis.com/siteVerification/v1";
const SEARCH_CONSOLE_V3 = "https://www.googleapis.com/webmasters/v3";

const SITE_VERIFICATION_SCOPE = "https://www.googleapis.com/auth/siteverification";
const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";

const VERIFICATION_METHODS = ["DNS_CNAME", "DNS_TXT"];

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") {
      opts.apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Parse and validate searchconsole.toml's content.
 *
 * @param {string} tomlString
 * @returns {{properties: {domain: string, verificationMethod: string, sites: string[]}[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const properties = (parsed.property ?? []).map((entry) => {
    if (!entry.domain) {
      throw new Error(`[[property]] entry is missing domain: ${JSON.stringify(entry)}`);
    }
    const verificationMethod = entry.verification_method ?? "DNS_CNAME";
    if (!VERIFICATION_METHODS.includes(verificationMethod)) {
      throw new Error(`property "${entry.domain}" has unsupported verification_method ${verificationMethod}`);
    }
    return { domain: entry.domain, verificationMethod, sites: (entry.sites ?? [entry.domain]).map(String) };
  });
  if (properties.length === 0) {
    throw new Error("searchconsole.toml has no [[property]] entries");
  }
  return { properties };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

/** The Search Console site URL of a domain property. */
export function domainSiteUrl(domain) {
  return `sc-domain:${domain}`;
}

/**
 * Split a DNS_CNAME token into the record to create. Site Verification answers with the label
 * and the target joined by a space ("<label> <target>"); the label is relative to the domain.
 *
 * @param {string} domain
 * @param {string} token
 * @returns {{name: string, type: "CNAME", value: string}|null} null when the token is not a CNAME pair
 */
export function describeCnameRecord(domain, token) {
  const parts = String(token ?? "")
    .trim()
    .split(/\s+/);
  if (parts.length !== 2) return null;
  return { name: `${parts[0]}.${domain}`, type: "CNAME", value: parts[1] };
}

/**
 * Whether a Site Verification webResource list already holds the domain. Site Verification
 * lists only resources the caller has verified.
 *
 * @param {string} domain
 * @param {Array<{site?: {type?: string, identifier?: string}}>} liveWebResources
 */
export function isVerified(domain, liveWebResources = []) {
  return liveWebResources.some((r) => r.site?.type === "INET_DOMAIN" && r.site?.identifier === domain);
}

/**
 * Whether the Search Console sites list holds the domain property.
 *
 * @param {string} domain
 * @param {Array<{siteUrl?: string}>} liveSites
 */
export function isSiteAdded(domain, liveSites = []) {
  return liveSites.some((s) => s.siteUrl === domainSiteUrl(domain));
}

/**
 * Plan one property. A verified, added property is a noop. An unverified property carries its
 * token and the DNS record to create; the apply path tries to verify it.
 *
 * @param {{domain: string, verificationMethod: string, sites: string[]}} configProperty
 * @param {{liveWebResources?: object[], liveSites?: object[], token?: string|null}} live
 */
export function buildPropertyPlan(configProperty, { liveWebResources = [], liveSites = [], token = null }) {
  const verified = isVerified(configProperty.domain, liveWebResources);
  const added = isSiteAdded(configProperty.domain, liveSites);
  const verify = verified
    ? { action: "noop" }
    : {
        action: "verify",
        method: configProperty.verificationMethod,
        token,
        dnsRecord: configProperty.verificationMethod === "DNS_CNAME" ? describeCnameRecord(configProperty.domain, token) : null,
      };
  const add = added ? { action: "noop" } : { action: "add", siteUrl: domainSiteUrl(configProperty.domain) };
  return { domain: configProperty.domain, sites: configProperty.sites, verify, add };
}

/**
 * Lines that describe one property's plan.
 *
 * @param {ReturnType<typeof buildPropertyPlan>} plan
 * @param {boolean} dryRun
 * @returns {string[]}
 */
export function describePropertyPlan(plan, dryRun) {
  const prefix = dryRun ? "[dry-run] " : "";
  const lines = [`${prefix}Property ${domainSiteUrl(plan.domain)} (${plan.sites.join(", ")}):`];
  if (plan.verify.action === "noop") {
    lines.push("  verification: verified by the service account");
  } else {
    lines.push(`  verification: ${plan.verify.method} token ${plan.verify.token ?? "(none returned)"}`);
    if (plan.verify.dnsRecord) {
      lines.push(`  DNS record to add: ${plan.verify.dnsRecord.name} ${plan.verify.dnsRecord.type} ${plan.verify.dnsRecord.value}`);
    }
  }
  lines.push(plan.add.action === "noop" ? "  property: added" : `  property: will add ${plan.add.siteUrl}`);
  return lines;
}

/**
 * Whether a verification insert failed because the DNS record is not there yet. Site
 * Verification answers 400 when it cannot find the token; every other status is a real
 * failure (scope, quota, permission) and must fail the run.
 */
export function isTokenNotFoundError(err) {
  const status = err?.response?.status ?? err?.status ?? err?.code;
  return Number(status) === 400;
}

// --- Network ---

async function getToken(client, domain, method) {
  const res = await client.request({
    url: `${SITE_VERIFICATION_V1}/token`,
    method: "POST",
    data: { site: { type: "INET_DOMAIN", identifier: domain }, verificationMethod: method },
  });
  return res.data?.token ?? null;
}

async function listWebResources(client) {
  const res = await client.request({ url: `${SITE_VERIFICATION_V1}/webResource` });
  return res.data?.items ?? [];
}

async function listSites(client) {
  const res = await client.request({ url: `${SEARCH_CONSOLE_V3}/sites` });
  return res.data?.siteEntry ?? [];
}

async function insertWebResource(client, domain, method) {
  await client.request({
    url: `${SITE_VERIFICATION_V1}/webResource`,
    method: "POST",
    params: { verificationMethod: method },
    data: { site: { type: "INET_DOMAIN", identifier: domain } },
  });
}

async function addSite(client, siteUrl) {
  await client.request({ url: `${SEARCH_CONSOLE_V3}/sites/${encodeURIComponent(siteUrl)}`, method: "PUT" });
}

/**
 * Apply one property plan. Returns the domain's outcome so main can report unverified domains
 * without failing.
 *
 * @returns {Promise<{domain: string, state: "verified"|"unverified"}>}
 */
export async function applyPropertyPlan(client, plan) {
  if (plan.verify.action === "verify") {
    try {
      await insertWebResource(client, plan.domain, plan.verify.method);
    } catch (err) {
      if (isTokenNotFoundError(err)) {
        return { domain: plan.domain, state: "unverified" };
      }
      throw err;
    }
  }
  if (plan.add.action === "add") {
    await addSite(client, plan.add.siteUrl);
  }
  return { domain: plan.domain, state: "verified" };
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfigFromRoot();

  assertFederatedCredentials();
  const client = await createGoogleAuthorizedClient([SITE_VERIFICATION_SCOPE, WEBMASTERS_SCOPE]);

  console.log(`Reading current Search Console state${opts.apply ? "" : " (dry run)"}...`);
  const liveWebResources = await listWebResources(client);
  const liveSites = await listSites(client);

  const plans = [];
  const unverified = [];
  for (const configProperty of config.properties) {
    const needsToken = !isVerified(configProperty.domain, liveWebResources);
    const token = needsToken ? await getToken(client, configProperty.domain, configProperty.verificationMethod) : null;
    const plan = buildPropertyPlan(configProperty, { liveWebResources, liveSites, token });
    plans.push(plan);
    for (const line of describePropertyPlan(plan, !opts.apply)) console.log(line);
    if (opts.apply) {
      const outcome = await applyPropertyPlan(client, plan);
      if (outcome.state === "unverified") unverified.push(plan);
    }
  }

  if (unverified.length > 0) {
    console.log(`Unverified (${unverified.length}): the verification record is not in DNS yet, so nothing was added.`);
    for (const plan of unverified) {
      const record = plan.verify.dnsRecord;
      const recordText = record ? `: ${record.name} ${record.type} ${record.value}` : "";
      console.log(`  ${plan.domain}${recordText}`);
    }
  }

  return plans;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Search Console sync failed:", err.message);
    process.exit(1);
  });
}
