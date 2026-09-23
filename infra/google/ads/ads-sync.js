#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/ads/ads-sync.js
//
// Plans (and, with --apply, makes) the Google Ads account match infra/google/ads/ads.toml's
// [account], [[conversion_action]], [[customer_conversion_goal]] and [[campaign]] declarations.
// Reads the live state with the same GAQL queries infra/google/ads/ads-inventory.js uses, plus
// each campaign's bidding strategy fields, and writes through customers:mutate (auto-tagging),
// campaignBudgets:mutate (a campaign's budget), campaigns:mutate (a campaign's status, its bidding
// strategy, and a new Search campaign itself), customerConversionGoals:mutate (a goal's biddable
// flag), adGroups:mutate, adGroupCriteria:mutate and adGroupAds:mutate (a new Search campaign's ad
// groups, keywords and responsive search ad).
//
// A declared conversion action, conversion goal or Performance Max campaign the live account does
// not have fails the run: this script never creates a conversion action (those are created in the
// GA4 property; see infra/google/ga4/ga4-sync.js), a conversion goal, or a Performance Max
// campaign — Performance Max stays read-and-adjust only. A declared Search campaign
// (type = "SEARCH") the live account lacks is created instead: its budget, the campaign itself
// (paused unless status = "ENABLED" is declared), each [[campaign.ad_group]], its
// [[campaign.ad_group.keyword]] entries and its one [campaign.ad_group.ad] responsive search ad.
// Example:
//
//   [[campaign]]
//   name = "Search #1"
//   type = "SEARCH"
//   budget_gbp = 5.00
//   status = "PAUSED"
//
//   [campaign.bidding]
//   strategy = "maximize_conversions"
//   target_cpa_gbp = 12.50
//
//   [[campaign.ad_group]]
//   name = "VAT software"
//
//   [[campaign.ad_group.keyword]]
//   text = "vat filing software"
//   match_type = "EXACT"
//
//   [campaign.ad_group.ad]
//   headlines = ["File VAT Returns Online", "HMRC MTD Compliant Software", "Free VAT Filing Tool"]
//   descriptions = ["Submit VAT returns direct to HMRC.", "Free, simple, MTD compliant."]
//   final_url = "https://submit.diyaccounting.co.uk/"
//
// Every [[campaign]] also needs a [campaign.bidding] table, mapped one to one onto the API's
// campaign bidding fields: manual_cpc (enhanced_cpc), maximize_clicks (the API's target_spend,
// optional cpc_bid_ceiling_gbp), maximize_conversions (optional target_cpa_gbp),
// maximize_conversion_value (optional target_roas), target_cpa (target_cpa_gbp), target_roas
// (target_roas), target_impression_share (location, fraction, optional cpc_bid_ceiling_gbp), or a
// portfolio strategy by its bidding_strategy resource name. Pounds and fractions in the toml,
// micros on the wire. A Performance Max campaign accepts only maximize_conversions and
// maximize_conversion_value; a declared strategy its channel type cannot take is refused, with the
// reason in the plan, and never applied.
//
// A conversion action's category and primary_for_goal are compared and reported, but never
// written — there is no conversionActions:mutate call here, so that drift stays a plan line until
// it is fixed in the GA4 property or the Ads UI. The GA4 side of the Ads link stays with
// ga4-sync.js.
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

// Selects each campaign's bidding strategy fields, kept separate from ads-inventory.js's
// CAMPAIGN_QUERY (a read-only report query neither this file nor ads-inventory.js needs to widen
// for its own sake). campaign.bidding_strategy is set only for a portfolio (shared) strategy;
// campaign.bidding_strategy_type always names which of the oneof sub-messages below is live.
const CAMPAIGN_BIDDING_QUERY =
  "SELECT campaign.resource_name, campaign.bidding_strategy, campaign.bidding_strategy_type, " +
  "campaign.manual_cpc.enhanced_cpc_enabled, campaign.target_spend.cpc_bid_ceiling_micros, " +
  "campaign.maximize_conversions.target_cpa_micros, campaign.maximize_conversion_value.target_roas, " +
  "campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas, " +
  "campaign.target_impression_share.location, campaign.target_impression_share.location_fraction_micros, " +
  "campaign.target_impression_share.cpc_bid_ceiling_micros FROM campaign";

const KEYWORD_MATCH_TYPES = new Set(["EXACT", "PHRASE", "BROAD"]);

const SEARCH_AD_FINAL_URL_PREFIX = "https://submit.diyaccounting.co.uk/";

// The Google Ads API campaign bidding oneof field each toml strategy maps onto. "portfolio" sets
// the top-level biddingStrategy resource-name field instead, so it has no entry here.
const BIDDING_FIELD_BY_STRATEGY = {
  manual_cpc: "manualCpc",
  maximize_clicks: "targetSpend",
  maximize_conversions: "maximizeConversions",
  maximize_conversion_value: "maximizeConversionValue",
  target_cpa: "targetCpa",
  target_roas: "targetRoas",
  target_impression_share: "targetImpressionShare",
};

const BIDDING_STRATEGY_TYPE_TO_KEY = {
  MANUAL_CPC: "manual_cpc",
  TARGET_SPEND: "maximize_clicks",
  MAXIMIZE_CONVERSIONS: "maximize_conversions",
  MAXIMIZE_CONVERSION_VALUE: "maximize_conversion_value",
  TARGET_CPA: "target_cpa",
  TARGET_ROAS: "target_roas",
  TARGET_IMPRESSION_SHARE: "target_impression_share",
};

// The channel types a bidding strategy is restricted to; a channel type absent here accepts any
// declared strategy.
const CHANNEL_TYPE_BIDDING_STRATEGIES = {
  PERFORMANCE_MAX: new Set(["maximize_conversions", "maximize_conversion_value"]),
};

function poundsToMicros(pounds) {
  const value = Number(pounds);
  if (!Number.isFinite(value) || value < 0) throw new Error(`expected a non-negative pounds amount, got ${JSON.stringify(pounds)}`);
  return String(Math.round(value * 1_000_000));
}

function fractionToMicros(fraction) {
  const value = Number(fraction);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`expected a fraction greater than 0 and at most 1, got ${JSON.stringify(fraction)}`);
  }
  return String(Math.round(value * 1_000_000));
}

/**
 * Parse a [campaign.bidding] table into the strategy plus only the fields that strategy uses, in
 * pounds-converted-to-micros form where the API field is a currency amount.
 *
 * @param {object|undefined} entry
 * @param {string} campaignName
 */
function parseBidding(entry, campaignName) {
  if (!entry) throw new Error(`campaign "${campaignName}" has no [campaign.bidding]`);
  const strategy = entry.strategy;
  switch (strategy) {
    case "manual_cpc": {
      if (typeof entry.enhanced_cpc !== "boolean") {
        throw new Error(`campaign "${campaignName}"'s [campaign.bidding] strategy "manual_cpc" needs enhanced_cpc`);
      }
      return { strategy, enhancedCpc: entry.enhanced_cpc };
    }
    case "maximize_clicks": {
      const bidding = { strategy };
      if (entry.cpc_bid_ceiling_gbp !== undefined) bidding.cpcBidCeilingMicros = poundsToMicros(entry.cpc_bid_ceiling_gbp);
      return bidding;
    }
    case "maximize_conversions": {
      const bidding = { strategy };
      if (entry.target_cpa_gbp !== undefined) bidding.targetCpaMicros = poundsToMicros(entry.target_cpa_gbp);
      return bidding;
    }
    case "maximize_conversion_value": {
      const bidding = { strategy };
      if (entry.target_roas !== undefined) bidding.targetRoas = Number(entry.target_roas);
      return bidding;
    }
    case "target_cpa": {
      if (entry.target_cpa_gbp === undefined) {
        throw new Error(`campaign "${campaignName}"'s [campaign.bidding] strategy "target_cpa" needs target_cpa_gbp`);
      }
      return { strategy, targetCpaMicros: poundsToMicros(entry.target_cpa_gbp) };
    }
    case "target_roas": {
      if (entry.target_roas === undefined) {
        throw new Error(`campaign "${campaignName}"'s [campaign.bidding] strategy "target_roas" needs target_roas`);
      }
      return { strategy, targetRoas: Number(entry.target_roas) };
    }
    case "target_impression_share": {
      if (!entry.location || entry.fraction === undefined) {
        throw new Error(`campaign "${campaignName}"'s [campaign.bidding] strategy "target_impression_share" needs location and fraction`);
      }
      const bidding = { strategy, location: String(entry.location), locationFractionMicros: fractionToMicros(entry.fraction) };
      if (entry.cpc_bid_ceiling_gbp !== undefined) bidding.cpcBidCeilingMicros = poundsToMicros(entry.cpc_bid_ceiling_gbp);
      return bidding;
    }
    case "portfolio": {
      if (!entry.bidding_strategy) {
        throw new Error(`campaign "${campaignName}"'s [campaign.bidding] strategy "portfolio" needs bidding_strategy`);
      }
      return { strategy, biddingStrategy: String(entry.bidding_strategy) };
    }
    default:
      throw new Error(`campaign "${campaignName}"'s [campaign.bidding] has unknown strategy "${strategy}"`);
  }
}

/**
 * Parse one [[campaign.ad_group]] entry: its keywords and its one responsive search ad.
 *
 * @param {object} entry
 * @param {string} campaignName
 */
function parseAdGroup(entry, campaignName) {
  if (!entry.name) throw new Error(`campaign "${campaignName}" has a [[campaign.ad_group]] entry missing name`);

  const keywords = (Array.isArray(entry.keyword) ? entry.keyword : []).map((keywordEntry) => {
    if (!keywordEntry.text) throw new Error(`ad group "${entry.name}" has a [[campaign.ad_group.keyword]] entry missing text`);
    if (!KEYWORD_MATCH_TYPES.has(keywordEntry.match_type)) {
      throw new Error(
        `ad group "${entry.name}"'s keyword "${keywordEntry.text}" has match_type "${keywordEntry.match_type}", must be one of ${[...KEYWORD_MATCH_TYPES].join(", ")}`,
      );
    }
    return { text: String(keywordEntry.text), matchType: String(keywordEntry.match_type) };
  });
  if (keywords.length === 0) throw new Error(`ad group "${entry.name}" has no [[campaign.ad_group.keyword]]`);

  const ad = entry.ad;
  if (!ad) throw new Error(`ad group "${entry.name}" has no [campaign.ad_group.ad]`);

  const headlines = Array.isArray(ad.headlines) ? ad.headlines.map(String) : [];
  if (headlines.length < 3 || headlines.length > 15) {
    throw new Error(`ad group "${entry.name}"'s ad needs 3-15 headlines, found ${headlines.length}`);
  }
  const longHeadline = headlines.find((headline) => headline.length > 30);
  if (longHeadline) throw new Error(`ad group "${entry.name}"'s ad headline "${longHeadline}" is longer than 30 characters`);

  const descriptions = Array.isArray(ad.descriptions) ? ad.descriptions.map(String) : [];
  if (descriptions.length < 2 || descriptions.length > 4) {
    throw new Error(`ad group "${entry.name}"'s ad needs 2-4 descriptions, found ${descriptions.length}`);
  }
  const longDescription = descriptions.find((description) => description.length > 90);
  if (longDescription) throw new Error(`ad group "${entry.name}"'s ad description "${longDescription}" is longer than 90 characters`);

  if (typeof ad.final_url !== "string" || !ad.final_url.startsWith(SEARCH_AD_FINAL_URL_PREFIX)) {
    throw new Error(
      `ad group "${entry.name}"'s ad final_url must start with ${SEARCH_AD_FINAL_URL_PREFIX}, got ${JSON.stringify(ad.final_url)}`,
    );
  }

  return { name: String(entry.name), keywords, ad: { headlines, descriptions, finalUrl: String(ad.final_url) } };
}

/**
 * Parse one [[campaign]] entry: the fields common to every type, plus type-specific fields —
 * asset groups for PERFORMANCE_MAX, budget in pounds and ad groups for SEARCH.
 *
 * @param {object} entry
 */
function parseCampaign(entry) {
  if (!entry.name) throw new Error(`[[campaign]] entry is missing name: ${JSON.stringify(entry)}`);
  if (entry.type !== "PERFORMANCE_MAX" && entry.type !== "SEARCH") {
    throw new Error(`campaign "${entry.name}" has type "${entry.type}", must be "PERFORMANCE_MAX" or "SEARCH"`);
  }
  const bidding = parseBidding(entry.bidding, entry.name);

  if (entry.type === "PERFORMANCE_MAX") {
    if (!entry.status || !entry.budget_micros) {
      throw new Error(`campaign "${entry.name}" is missing status or budget_micros`);
    }
    const assetGroups = (Array.isArray(entry.asset_group) ? entry.asset_group : []).map((assetGroupEntry) => {
      if (!assetGroupEntry.name) throw new Error(`campaign "${entry.name}" has a [[campaign.asset_group]] entry missing name`);
      return { name: String(assetGroupEntry.name) };
    });
    if (assetGroups.length === 0) throw new Error(`campaign "${entry.name}" has no [[campaign.asset_group]]`);
    return {
      name: String(entry.name),
      type: entry.type,
      status: String(entry.status),
      budgetMicros: String(entry.budget_micros),
      assetGroups,
      adGroups: [],
      bidding,
    };
  }

  // SEARCH
  if (entry.budget_gbp === undefined) throw new Error(`campaign "${entry.name}" is missing budget_gbp`);
  const adGroups = (Array.isArray(entry.ad_group) ? entry.ad_group : []).map((adGroupEntry) => parseAdGroup(adGroupEntry, entry.name));
  if (adGroups.length === 0) throw new Error(`campaign "${entry.name}" has no [[campaign.ad_group]]`);
  return {
    name: String(entry.name),
    type: entry.type,
    status: entry.status ? String(entry.status) : "PAUSED",
    budgetMicros: poundsToMicros(entry.budget_gbp),
    assetGroups: [],
    adGroups,
    bidding,
  };
}

/**
 * Parse infra/google/ads/ads.toml's declared account state: everything ads-inventory.js's
 * parseConfig reads, plus the conversion actions, conversion goals, campaigns and reserve-floor
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

  const campaignEntries = Array.isArray(parsed.campaign) ? parsed.campaign : [];
  if (campaignEntries.length === 0) throw new Error("ads.toml declares no [[campaign]]");
  const campaigns = campaignEntries.map(parseCampaign);

  const reserveFloorSsmParameter = parsed.reserve_floor?.ssm_parameter;
  if (!reserveFloorSsmParameter) throw new Error("ads.toml is missing [reserve_floor].ssm_parameter");

  return {
    ...base,
    autoTagging,
    conversionActions,
    conversionGoals,
    campaigns,
    reserveFloorSsmParameter: String(reserveFloorSsmParameter),
  };
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
 * Shape a campaign's bidding strategy fields into the same {strategy, ...fields} form
 * parseBidding produces, keyed by the campaign's resource name. campaign.biddingStrategy set
 * means a portfolio (shared) strategy; otherwise campaign.biddingStrategyType names which oneof
 * sub-message is live.
 *
 * @param {object} searchBody
 * @returns {Map<string, {strategy: string|null}>}
 */
export function shapeCampaignBidding(searchBody) {
  const byResourceName = new Map();
  for (const row of searchBody.results ?? []) {
    const c = row.campaign;
    if (c.biddingStrategy) {
      byResourceName.set(c.resourceName, { strategy: "portfolio", biddingStrategy: c.biddingStrategy });
      continue;
    }
    const strategy = BIDDING_STRATEGY_TYPE_TO_KEY[c.biddingStrategyType] ?? null;
    let bidding;
    switch (strategy) {
      case "manual_cpc":
        bidding = { strategy, enhancedCpc: Boolean(c.manualCpc?.enhancedCpcEnabled) };
        break;
      case "maximize_clicks":
        bidding = { strategy, cpcBidCeilingMicros: c.targetSpend?.cpcBidCeilingMicros ?? null };
        break;
      case "maximize_conversions":
        bidding = { strategy, targetCpaMicros: c.maximizeConversions?.targetCpaMicros ?? null };
        break;
      case "maximize_conversion_value":
        bidding = { strategy, targetRoas: c.maximizeConversionValue?.targetRoas ?? null };
        break;
      case "target_cpa":
        bidding = { strategy, targetCpaMicros: c.targetCpa?.targetCpaMicros ?? null };
        break;
      case "target_roas":
        bidding = { strategy, targetRoas: c.targetRoas?.targetRoas ?? null };
        break;
      case "target_impression_share":
        bidding = {
          strategy,
          location: c.targetImpressionShare?.location ?? null,
          locationFractionMicros: c.targetImpressionShare?.locationFractionMicros ?? null,
          cpcBidCeilingMicros: c.targetImpressionShare?.cpcBidCeilingMicros ?? null,
        };
        break;
      default:
        bidding = { strategy: null };
    }
    byResourceName.set(c.resourceName, bidding);
  }
  return byResourceName;
}

/**
 * Read the account, conversion actions, conversion goals and campaigns the same way
 * ads-inventory.js does, plus each campaign's bidding strategy, shaped for planAds.
 *
 * @param {string} token
 * @param {{customerId: string, apiVersion: string}} config
 */
export async function readLiveState(token, config) {
  const [customerBody, conversionActionsBody, conversionGoalsBody, campaignsBody, campaignBiddingBody] = await Promise.all([
    googleAdsSearch(token, config.customerId, config.apiVersion, CUSTOMER_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CONVERSION_ACTION_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CONVERSION_GOAL_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CAMPAIGN_QUERY),
    googleAdsSearch(token, config.customerId, config.apiVersion, CAMPAIGN_BIDDING_QUERY),
  ]);
  const shapedConversions = shapeConversionActions(conversionActionsBody, conversionGoalsBody);
  const campaigns = shapeCampaigns(campaignsBody);
  const biddingByResourceName = shapeCampaignBidding(campaignBiddingBody);
  for (const campaign of campaigns) {
    campaign.bidding = biddingByResourceName.get(campaign.resourceName) ?? null;
  }
  return {
    customer: shapeCustomer(customerBody),
    conversionActions: shapedConversions.actions,
    conversionGoals: shapedConversions.goals,
    campaigns,
  };
}

/**
 * True when a declared bidding strategy's fields differ from live — including when the strategy
 * itself differs, or live carries no recognised strategy at all. Only the fields the declared
 * side sets are compared, so an optional field left undeclared is never planned as drift.
 *
 * @param {{strategy: string}} declared
 * @param {{strategy: string|null}|null} live
 */
function biddingFieldsDiffer(declared, live) {
  if (!live || declared.strategy !== live.strategy) return true;
  for (const [key, value] of Object.entries(declared)) {
    if (key === "strategy") continue;
    const liveValue = live[key];
    if (typeof value === "number" || typeof liveValue === "number") {
      if (Number(value) !== Number(liveValue)) return true;
    } else if (String(value) !== String(liveValue)) {
      return true;
    }
  }
  return false;
}

/**
 * The plan actions that create a declared Search campaign the live account lacks: its budget,
 * the campaign, and each ad group with its keywords and responsive search ad, in the order
 * applyAction must run them so each create has its parent's resource name.
 *
 * @param {ReturnType<parseCampaign>} campaign
 */
function planCampaignCreation(campaign) {
  const actions = [
    { kind: "create-campaign-budget", campaignName: campaign.name, amountMicros: campaign.budgetMicros },
    {
      kind: "create-campaign",
      campaignName: campaign.name,
      status: campaign.status,
      budgetMicros: campaign.budgetMicros,
      bidding: campaign.bidding,
    },
  ];
  for (const adGroup of campaign.adGroups) {
    actions.push({ kind: "create-ad-group", campaignName: campaign.name, adGroupName: adGroup.name });
    actions.push({ kind: "create-ad-group-keywords", campaignName: campaign.name, adGroupName: adGroup.name, keywords: adGroup.keywords });
    actions.push({ kind: "create-ad-group-ad", campaignName: campaign.name, adGroupName: adGroup.name, ad: adGroup.ad });
  }
  return actions;
}

/**
 * Decide what differs between ads.toml's declared state and the live account. Pure, so it is
 * unit-tested against mocked live state.
 *
 * A declared conversion action, conversion goal or Performance Max campaign the live account does
 * not have is not a plan action: this script has no create path for any of the three, so a name
 * it cannot find live throws instead of silently planning nothing. A declared Search campaign the
 * live account lacks plans a create instead.
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

  for (const campaign of config.campaigns) {
    const liveCampaign = live.campaigns.find((candidate) => candidate.name === campaign.name);
    if (!liveCampaign) {
      if (campaign.type !== "SEARCH") {
        missing.push(`campaign "${campaign.name}"`);
        continue;
      }
      actions.push(...planCampaignCreation(campaign));
      continue;
    }

    if (liveCampaign.status !== campaign.status) {
      actions.push({
        kind: "update-campaign-status",
        resourceName: liveCampaign.resourceName,
        wanted: campaign.status,
        live: liveCampaign.status,
      });
    }
    const liveBudgetMicros =
      liveCampaign.budgetAmountMicros === null || liveCampaign.budgetAmountMicros === undefined
        ? null
        : String(liveCampaign.budgetAmountMicros);
    if (liveBudgetMicros !== campaign.budgetMicros) {
      actions.push({
        kind: "update-campaign-budget",
        budgetResourceName: liveCampaign.budgetResourceName,
        wanted: campaign.budgetMicros,
        live: liveBudgetMicros,
      });
    }

    const allowedStrategies = CHANNEL_TYPE_BIDDING_STRATEGIES[campaign.type];
    if (allowedStrategies && !allowedStrategies.has(campaign.bidding.strategy)) {
      actions.push({
        kind: "refuse-bidding-strategy",
        campaignName: campaign.name,
        strategy: campaign.bidding.strategy,
        reason: `campaign type ${campaign.type} accepts only ${[...allowedStrategies].join(", ")}`,
      });
    } else if (biddingFieldsDiffer(campaign.bidding, liveCampaign.bidding)) {
      actions.push({
        kind: "update-campaign-bidding",
        resourceName: liveCampaign.resourceName,
        wanted: campaign.bidding,
        live: liveCampaign.bidding,
      });
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `ads.toml declares ${missing.join(", ")}, which the live account does not have. ads-sync.js never creates a conversion action, a conversion goal or a Performance Max campaign — create it live first.`,
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
    case "update-campaign-bidding":
      return `campaign ${action.resourceName}: bidding ${JSON.stringify(action.live)} (declared ${JSON.stringify(action.wanted)}) (would update)`;
    case "refuse-bidding-strategy":
      return `campaign "${action.campaignName}": bidding strategy "${action.strategy}" refused — ${action.reason} (not applied)`;
    case "create-campaign-budget":
      return `campaign "${action.campaignName}": budget ${action.amountMicros} micros (would create)`;
    case "create-campaign":
      return `campaign "${action.campaignName}": SEARCH, ${action.status}, bidding ${action.bidding.strategy} (would create)`;
    case "create-ad-group":
      return `campaign "${action.campaignName}", ad group "${action.adGroupName}" (would create)`;
    case "create-ad-group-keywords":
      return `campaign "${action.campaignName}", ad group "${action.adGroupName}": ${action.keywords.length} keyword(s) (would create)`;
    case "create-ad-group-ad":
      return `campaign "${action.campaignName}", ad group "${action.adGroupName}": responsive search ad, ${action.ad.headlines.length} headline(s), ${action.ad.descriptions.length} description(s) (would create)`;
    default:
      return `${action.kind}`;
  }
}

/**
 * The updateMask and update body for a campaign's bidding oneof field — shared by an update
 * (against a live campaign resource name) and a create (folded into the campaign's own create
 * body, where the mask is unused).
 *
 * @param {ReturnType<parseBidding>} bidding
 */
function biddingMutatePayload(bidding) {
  if (bidding.strategy === "portfolio") {
    return { updateMask: "biddingStrategy", update: { biddingStrategy: bidding.biddingStrategy } };
  }

  const field = BIDDING_FIELD_BY_STRATEGY[bidding.strategy];
  const subUpdate = {};
  const masks = [];

  switch (bidding.strategy) {
    case "manual_cpc":
      subUpdate.enhancedCpcEnabled = bidding.enhancedCpc;
      masks.push(`${field}.enhancedCpcEnabled`);
      break;
    case "maximize_clicks":
      if (bidding.cpcBidCeilingMicros !== undefined) {
        subUpdate.cpcBidCeilingMicros = bidding.cpcBidCeilingMicros;
        masks.push(`${field}.cpcBidCeilingMicros`);
      }
      break;
    case "maximize_conversions":
      if (bidding.targetCpaMicros !== undefined) {
        subUpdate.targetCpaMicros = bidding.targetCpaMicros;
        masks.push(`${field}.targetCpaMicros`);
      }
      break;
    case "maximize_conversion_value":
      if (bidding.targetRoas !== undefined) {
        subUpdate.targetRoas = bidding.targetRoas;
        masks.push(`${field}.targetRoas`);
      }
      break;
    case "target_cpa":
      subUpdate.targetCpaMicros = bidding.targetCpaMicros;
      masks.push(`${field}.targetCpaMicros`);
      break;
    case "target_roas":
      subUpdate.targetRoas = bidding.targetRoas;
      masks.push(`${field}.targetRoas`);
      break;
    case "target_impression_share":
      subUpdate.location = bidding.location;
      subUpdate.locationFractionMicros = bidding.locationFractionMicros;
      masks.push(`${field}.location`, `${field}.locationFractionMicros`);
      if (bidding.cpcBidCeilingMicros !== undefined) {
        subUpdate.cpcBidCeilingMicros = bidding.cpcBidCeilingMicros;
        masks.push(`${field}.cpcBidCeilingMicros`);
      }
      break;
    default:
      throw new Error(`Unknown bidding strategy ${bidding.strategy}`);
  }

  return { updateMask: (masks.length > 0 ? masks : [field]).join(","), update: { [field]: subUpdate } };
}

// --- Network calls. Not covered by the unit tests (no network in tests); planAds and describe
// carry the argument-handling and diff-shaping coverage. ---

async function googleAdsMutate(token, customerId, apiVersion, resource, operations) {
  const res = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/${resource}:mutate`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!res.ok) throw new Error(`${res.status} from ${resource}:mutate: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function applyAction(token, config, action, context) {
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
    case "update-campaign-bidding": {
      const { updateMask, update } = biddingMutatePayload(action.wanted);
      return googleAdsMutate(token, config.customerId, config.apiVersion, "campaigns", [
        { updateMask, update: { resourceName: action.resourceName, ...update } },
      ]);
    }
    case "conversion-action-drift":
      // Report only: a conversion action's category and primary_for_goal are set where the
      // action is created (the GA4 property), never mutated here.
      return null;
    case "refuse-bidding-strategy":
      // Refused: the campaign's channel type cannot take this strategy. The plan line is the
      // operator-facing signal; there is nothing to apply.
      return null;
    case "create-campaign-budget": {
      const result = await googleAdsMutate(token, config.customerId, config.apiVersion, "campaignBudgets", [
        { create: { name: `${action.campaignName} budget`, amountMicros: action.amountMicros } },
      ]);
      context.budgetResourceNameByCampaign[action.campaignName] = result.results[0].resourceName;
      return result;
    }
    case "create-campaign": {
      const { update: biddingFields } = biddingMutatePayload(action.bidding);
      const result = await googleAdsMutate(token, config.customerId, config.apiVersion, "campaigns", [
        {
          create: {
            name: action.campaignName,
            status: action.status,
            advertisingChannelType: "SEARCH",
            campaignBudget: context.budgetResourceNameByCampaign[action.campaignName],
            ...biddingFields,
          },
        },
      ]);
      context.campaignResourceNameByCampaign[action.campaignName] = result.results[0].resourceName;
      return result;
    }
    case "create-ad-group": {
      const result = await googleAdsMutate(token, config.customerId, config.apiVersion, "adGroups", [
        {
          create: {
            name: action.adGroupName,
            campaign: context.campaignResourceNameByCampaign[action.campaignName],
            status: "ENABLED",
          },
        },
      ]);
      context.adGroupResourceNameByKey[`${action.campaignName}/${action.adGroupName}`] = result.results[0].resourceName;
      return result;
    }
    case "create-ad-group-keywords": {
      const adGroupResourceName = context.adGroupResourceNameByKey[`${action.campaignName}/${action.adGroupName}`];
      const operations = action.keywords.map((keyword) => ({
        create: { adGroup: adGroupResourceName, status: "ENABLED", keyword: { text: keyword.text, matchType: keyword.matchType } },
      }));
      return googleAdsMutate(token, config.customerId, config.apiVersion, "adGroupCriteria", operations);
    }
    case "create-ad-group-ad": {
      const adGroupResourceName = context.adGroupResourceNameByKey[`${action.campaignName}/${action.adGroupName}`];
      return googleAdsMutate(token, config.customerId, config.apiVersion, "adGroupAds", [
        {
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            ad: {
              finalUrls: [action.ad.finalUrl],
              responsiveSearchAd: {
                headlines: action.ad.headlines.map((text) => ({ text })),
                descriptions: action.ad.descriptions.map((text) => ({ text })),
              },
            },
          },
        },
      ]);
    }
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
      `customer ${config.customerId}, ${config.conversionActions.length} conversion action(s), ${config.conversionGoals.length} conversion goal(s) and ${config.campaigns.length} campaign(s): already match`,
    );
  }
  for (const action of plan) console.log(describe(action));

  if (!opts.apply) {
    if (plan.length > 0) process.exitCode = 1;
    return plan;
  }

  const context = { budgetResourceNameByCampaign: {}, campaignResourceNameByCampaign: {}, adGroupResourceNameByKey: {} };
  for (const action of plan) {
    if (action.kind === "conversion-action-drift" || action.kind === "refuse-bidding-strategy") continue;
    await applyAction(token, config, action, context);
    console.log(describe(action).replace("(would update)", "(updated)").replace("(would create)", "(created)"));
  }
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("ads-sync failed:", err.message);
    process.exit(1);
  });
}
