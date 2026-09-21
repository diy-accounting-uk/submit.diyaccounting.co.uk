#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/ads/ads-sync.js
//
// Plans (and, with --apply, makes) the Google Ads account match infra/google/ads/ads.toml's
// [account], [[conversion_action]], [[customer_conversion_goal]] and [[campaign]] declarations.
// Reads the live state with the same GAQL queries infra/google/ads/ads-inventory.js uses, and
// writes through customers:mutate (auto-tagging), campaignBudgets:mutate (the campaign's
// budget), campaigns:mutate (the campaign's status) and customerConversionGoals:mutate (a
// goal's biddable flag) only.
//
// A declared conversion action or campaign the live account does not have fails the run: this
// script never creates a conversion action (those are created in the GA4 property; see
// infra/google/ga4/ga4-sync.js) or a campaign. A conversion action's category and
// primary_for_goal are compared and reported, but never written — there is no
// conversionActions:mutate call here, so that drift stays a plan line until it is fixed in the
// GA4 property or the Ads UI. The GA4 side of the Ads link stays with ga4-sync.js.
//
// Usage:
//   node infra/google/ads/ads-sync.js [--client-file <path>]
//   node infra/google/ads/ads-sync.js --apply [--client-file <path>]
//
// Plan mode exits 1 when the live account differs from ads.toml, so a pull request that would
// leave drift in place fails its check. Apply mode writes the difference and exits 0.
//
// Credentials: the Ads API's own OAuth user token (the client and refresh token
// infra/google/ads/ads-inventory.js's [secrets] names, read from Secrets Manager with AWS
// credentials only) — no Google federated credentials are needed, since this script never
// calls a Google Cloud REST API.

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

import {
  CONFIG_PATH,
  CUSTOMER_QUERY,
  CONVERSION_ACTION_QUERY,
  CONVERSION_GOAL_QUERY,
  CAMPAIGN_QUERY,
  getAdsAccessToken,
  googleAdsSearch,
  parseConfig as parseAdsInventoryConfig,
  shapeCustomer,
  shapeConversionActions,
  shapeCampaigns,
} from "./ads-inventory.js";

/**
 * Parse infra/google/ads/ads.toml's declared account state: everything ads-inventory.js's
 * parseConfig reads, plus the conversion actions, conversion goals, campaign and reserve-floor
 * declarations ads-sync.js plans against.
 *
 * @param {string} tomlString
 */
export function parseConfig(tomlString) {
  const base = parseAdsInventoryConfig(tomlString);
  const parsed = TOML.parse(tomlString);

  const autoTagging = parsed.account?.auto_tagging;
  if (typeof autoTagging !== "boolean") throw new Error("ads.toml is missing [account].auto_tagging");

  const conversionActions = (Array.isArray(parsed.conversion_action) ? parsed.conversion_action : []).map((entry) => {
    if (!entry.name || !entry.ga4_event || !entry.category || typeof entry.primary_for_goal !== "boolean") {
      throw new Error(`[[conversion_action]] entry is missing name, ga4_event, category or primary_for_goal: ${JSON.stringify(entry)}`);
    }
    return {
      name: String(entry.name),
      ga4Event: String(entry.ga4_event),
      category: String(entry.category),
      primaryForGoal: entry.primary_for_goal,
    };
  });
  if (conversionActions.length === 0) throw new Error("ads.toml declares no [[conversion_action]]");

  const conversionGoals = (Array.isArray(parsed.customer_conversion_goal) ? parsed.customer_conversion_goal : []).map((entry) => {
    if (!entry.category || !entry.origin || typeof entry.biddable !== "boolean") {
      throw new Error(`[[customer_conversion_goal]] entry is missing category, origin or biddable: ${JSON.stringify(entry)}`);
    }
    return { category: String(entry.category), origin: String(entry.origin), biddable: entry.biddable };
  });
  if (conversionGoals.length === 0) throw new Error("ads.toml declares no [[customer_conversion_goal]]");

  const campaigns = Array.isArray(parsed.campaign) ? parsed.campaign : [];
  if (campaigns.length !== 1) throw new Error(`ads.toml must declare exactly one [[campaign]], found ${campaigns.length}`);
  const campaignEntry = campaigns[0];
  if (!campaignEntry.name || campaignEntry.type !== "PERFORMANCE_MAX" || !campaignEntry.status || !campaignEntry.budget_micros) {
    throw new Error(`[[campaign]] entry is missing name, status, budget_micros, or its type is not "PERFORMANCE_MAX": ${JSON.stringify(campaignEntry)}`);
  }
  const assetGroups = (Array.isArray(campaignEntry.asset_group) ? campaignEntry.asset_group : []).map((entry) => {
    if (!entry.name) throw new Error(`[[campaign.asset_group]] entry is missing name: ${JSON.stringify(entry)}`);
    return { name: String(entry.name) };
  });
  if (assetGroups.length === 0) throw new Error("the declared campaign has no [[campaign.asset_group]]");
  const campaign = {
    name: String(campaignEntry.name),
    type: campaignEntry.type,
    status: String(campaignEntry.status),
    budgetMicros: String(campaignEntry.budget_micros),
    assetGroups,
  };

  const reserveFloorSsmParameter = parsed.reserve_floor?.ssm_parameter;
  if (!reserveFloorSsmParameter) throw new Error("ads.toml is missing [reserve_floor].ssm_parameter");

  return { ...base, autoTagging, conversionActions, conversionGoals, campaign, reserveFloorSsmParameter: String(reserveFloorSsmParameter) };
}

export function loadConfigFromRoot() {
  return parseConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

export function parseArgs(argv) {
  const opts = { apply: false, clientFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error("--client-file requires a path argument");
      opts.clientFile = value;
    } else if (arg === "--help") {
      console.log("Usage: node infra/google/ads/ads-sync.js [--apply] [--client-file <path>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Read the account, conversion actions, conversion goals and campaigns the same way
 * ads-inventory.js does, shaped for planAds.
 *
 * @param {string} token
 * @param {{customerId: string, apiVersion: string}} config
 */
export async function readLiveState(token, config) {
  const [customerBody, conversionActionsBody, conversionGoalsBody, campaignsBody] = await Promise.all([
    googleAdsSearch(token, config.customerId, config.apiVersion, CUSTOMER_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CONVERSION_ACTION_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CONVERSION_GOAL_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CAMPAIGN_QUERY),
  ]);
  const shapedConversions = shapeConversionActions(conversionActionsBody, conversionGoalsBody);
  return {
    customer: shapeCustomer(customerBody),
    conversionActions: shapedConversions.actions,
    conversionGoals: shapedConversions.goals,
    campaigns: shapeCampaigns(campaignsBody),
  };
}

/**
 * Decide what differs between ads.toml's declared state and the live account. Pure, so it is
 * unit-tested against mocked live state.
 *
 * A declared conversion action, conversion goal or campaign the live account does not have is
 * not a plan action: this script has no create path for any of the three, so a name it cannot
 * find live throws instead of silently planning nothing.
 *
 * @param {ReturnType<parseConfig>} config
 * @param {{customer: object, conversionActions: object[], conversionGoals: object[], campaigns: object[]}} live
 * @returns {Array<object>}
 */
export function planAds(config, live) {
  const missing = [];
  const actions = [];

  if (config.autoTagging !== live.customer.autoTaggingEnabled) {
    actions.push({ kind: "update-auto-tagging", wanted: config.autoTagging, live: live.customer.autoTaggingEnabled });
  }

  const liveActionsByName = new Map(live.conversionActions.map((action) => [action.name, action]));
  for (const declared of config.conversionActions) {
    const liveAction = liveActionsByName.get(declared.name);
    if (!liveAction) {
      missing.push(`conversion action "${declared.name}"`);
      continue;
    }
    const fields = [];
    if (liveAction.category !== declared.category) fields.push("category");
    if (liveAction.primaryForGoal !== declared.primaryForGoal) fields.push("primaryForGoal");
    if (fields.length > 0) {
      actions.push({
        kind: "conversion-action-drift",
        name: declared.name,
        fields,
        wanted: { category: declared.category, primaryForGoal: declared.primaryForGoal },
        live: { category: liveAction.category, primaryForGoal: liveAction.primaryForGoal },
      });
    }
  }

  const liveGoalsByCategory = new Map(live.conversionGoals.map((goal) => [goal.category, goal]));
  for (const declared of config.conversionGoals) {
    const liveGoal = liveGoalsByCategory.get(declared.category);
    if (!liveGoal) {
      missing.push(`customer conversion goal "${declared.category}"`);
      continue;
    }
    if (liveGoal.biddable !== declared.biddable) {
      actions.push({
        kind: "update-conversion-goal",
        category: declared.category,
        origin: declared.origin,
        wanted: declared.biddable,
        live: liveGoal.biddable,
      });
    }
  }

  const liveCampaign = live.campaigns.find((campaign) => campaign.name === config.campaign.name);
  if (!liveCampaign) {
    missing.push(`campaign "${config.campaign.name}"`);
  } else {
    if (liveCampaign.status !== config.campaign.status) {
      actions.push({
        kind: "update-campaign-status",
        resourceName: liveCampaign.resourceName,
        wanted: config.campaign.status,
        live: liveCampaign.status,
      });
    }
    const liveBudgetMicros = liveCampaign.budgetAmountMicros === null || liveCampaign.budgetAmountMicros === undefined ? null : String(liveCampaign.budgetAmountMicros);
    if (liveBudgetMicros !== config.campaign.budgetMicros) {
      actions.push({
        kind: "update-campaign-budget",
        budgetResourceName: liveCampaign.budgetResourceName,
        wanted: config.campaign.budgetMicros,
        live: liveBudgetMicros,
      });
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `ads.toml declares ${missing.join(", ")}, which the live account does not have. ads-sync.js never creates a conversion action, a conversion goal or a campaign — create it live first.`,
    );
  }

  return actions;
}

export function describe(action) {
  switch (action.kind) {
    case "update-auto-tagging":
      return `customer auto-tagging: ${action.live} (declared ${action.wanted}) (would update)`;
    case "conversion-action-drift":
      return `conversion action "${action.name}": differs on ${action.fields.join(", ")} — live ${JSON.stringify(action.live)}, declared ${JSON.stringify(action.wanted)} (report only, not applied)`;
    case "update-conversion-goal":
      return `customer conversion goal ${action.category}: biddable ${action.live} (declared ${action.wanted}) (would update)`;
    case "update-campaign-status":
      return `campaign ${action.resourceName}: status ${action.live} (declared ${action.wanted}) (would update)`;
    case "update-campaign-budget":
      return `campaign budget ${action.budgetResourceName}: ${action.live} micros (declared ${action.wanted} micros) (would update)`;
    default:
      return `${action.kind}`;
  }
}

// --- Network calls. Not covered by the unit tests (no network in tests); planAds and describe
// carry the argument-handling and diff-shaping coverage. ---

async function googleAdsMutate(token, customerId, apiVersion, resource, operations) {
  const res = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/${resource}:mutate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!res.ok) throw new Error(`${res.status} from ${resource}:mutate: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function applyAction(token, config, action) {
  switch (action.kind) {
    case "update-auto-tagging":
      return googleAdsMutate(token, config.customerId, config.apiVersion, "customers", [
        { updateMask: "autoTaggingEnabled", update: { resourceName: `customers/${config.customerId}`, autoTaggingEnabled: action.wanted } },
      ]);
    case "update-conversion-goal": {
      const resourceName = `customers/${config.customerId}/customerConversionGoals/${action.category}~${action.origin}`;
      return googleAdsMutate(token, config.customerId, config.apiVersion, "customerConversionGoals", [
        { updateMask: "biddable", update: { resourceName, biddable: action.wanted } },
      ]);
    }
    case "update-campaign-status":
      return googleAdsMutate(token, config.customerId, config.apiVersion, "campaigns", [
        { updateMask: "status", update: { resourceName: action.resourceName, status: action.wanted } },
      ]);
    case "update-campaign-budget":
      return googleAdsMutate(token, config.customerId, config.apiVersion, "campaignBudgets", [
        { updateMask: "amountMicros", update: { resourceName: action.budgetResourceName, amountMicros: action.wanted } },
      ]);
    case "conversion-action-drift":
      // Report only: a conversion action's category and primary_for_goal are set where the
      // action is created (the GA4 property), never mutated here.
      return null;
    default:
      throw new Error(`Unknown action ${action.kind}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();

  const token = await getAdsAccessToken(config, { clientFile: opts.clientFile });
  const live = await readLiveState(token, config);
  const plan = planAds(config, live);

  if (plan.length === 0) {
    console.log(
      `customer ${config.customerId}, ${config.conversionActions.length} conversion action(s), ${config.conversionGoals.length} conversion goal(s) and campaign "${config.campaign.name}": already match`,
    );
  }
  for (const action of plan) console.log(describe(action));

  if (!opts.apply) {
    if (plan.length > 0) process.exitCode = 1;
    return plan;
  }

  for (const action of plan) {
    if (action.kind === "conversion-action-drift") continue;
    await applyAction(token, config, action);
    console.log(describe(action).replace("(would update)", "(updated)"));
  }
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("ads-sync failed:", err.message);
    process.exit(1);
  });
}
