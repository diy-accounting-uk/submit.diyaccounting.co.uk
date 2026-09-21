#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Assert infra/paypal/paypal.toml's hosted Donate button against the live donate page and
 * PayPal's own donate link. PayPal's REST API has no resource for a classic hosted button and
 * the NVP Button Manager that made it is closed to new integrations, so this is
 * declare-and-verify: read the live page over HTTP rather than the sibling repository's
 * checkout, since the page is what a donor actually sees.
 *
 * Usage: node infra/paypal/paypal-assert.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

export const CONFIG_PATH = "infra/paypal/paypal.toml";

/**
 * Parse infra/paypal/paypal.toml's [button] table.
 *
 * @param {string} tomlString
 * @returns {{hostedButtonId: string, formAction: string, donateUrl: string, page: string}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const button = parsed.button;
  if (!button?.hosted_button_id || !button?.form_action || !button?.donate_url || !button?.page) {
    throw new Error("paypal.toml is missing [button].hosted_button_id, form_action, donate_url or page");
  }
  return { hostedButtonId: button.hosted_button_id, formAction: button.form_action, donateUrl: button.donate_url, page: button.page };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Every `name="hosted_button_id" value="..."` field the donate page's HTML carries, in the
 * order they appear. A page correctly carrying one button has exactly one.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function findHostedButtonIds(html) {
  const pattern = /name="hosted_button_id"\s+value="([^"]*)"/g;
  const ids = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * Check the donate page's HTML against paypal.toml's record: the form posts to the
 * declared form_action, and it carries exactly one hosted_button_id field, matching the
 * declared id.
 *
 * @param {{hostedButtonId: string, formAction: string}} config
 * @param {string} html
 * @returns {string[]} a list of mismatches; empty means the page matches
 */
export function assertTemplateMatches(config, html) {
  const mismatches = [];
  if (!html.includes(`action="${config.formAction}"`)) {
    mismatches.push(`no form posts to action="${config.formAction}"`);
  }
  const ids = findHostedButtonIds(html);
  if (ids.length !== 1) {
    mismatches.push(`expected exactly one hosted_button_id field, found ${ids.length} (${JSON.stringify(ids)})`);
  } else if (ids[0] !== config.hostedButtonId) {
    mismatches.push(`hosted_button_id "${ids[0]}" on the page does not match paypal.toml's "${config.hostedButtonId}"`);
  }
  return mismatches;
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function checkDonatePage(config, failures) {
  try {
    const response = await fetch(config.page);
    if (!response.ok) {
      failures.push(`donate page: ${response.status} from ${config.page}`);
      console.error(`  donate page: ${response.status}`);
      return;
    }
    const html = await response.text();
    const mismatches = assertTemplateMatches(config, html);
    if (mismatches.length > 0) {
      for (const mismatch of mismatches) {
        failures.push(`donate page: ${mismatch}`);
      }
      console.error(`  donate page: ${mismatches.join("; ")}`);
    } else {
      console.log(`  donate page: matches (button ${config.hostedButtonId})`);
    }
  } catch (err) {
    failures.push(`donate page: ${err.message}`);
    console.error(`  donate page: ${err.message}`);
  }
}

async function checkDonateUrl(config, failures) {
  try {
    const response = await fetch(config.donateUrl);
    if (!response.ok) {
      failures.push(`donate url: ${response.status} from ${config.donateUrl}`);
      console.error(`  donate url: ${response.status}`);
    } else {
      console.log(`  donate url: 200`);
    }
  } catch (err) {
    failures.push(`donate url: ${err.message}`);
    console.error(`  donate url: ${err.message}`);
  }
}

export async function main() {
  const config = loadConfigFromRoot();
  console.log(`\n=== paypal ===`);
  const failures = [];
  await checkDonatePage(config, failures);
  await checkDonateUrl(config, failures);

  if (failures.length > 0) {
    throw new Error(`paypal-assert had ${failures.length} failing check(s): ${failures.join("; ")}`);
  }
  console.log("\nAll checks passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("paypal-assert failed:", err.message);
    process.exit(1);
  });
}
