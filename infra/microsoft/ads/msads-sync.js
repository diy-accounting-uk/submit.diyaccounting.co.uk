// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/microsoft/ads/msads-sync.js
//
// The declared state of the Microsoft Advertising account (infra/microsoft/ads/ads.toml), the plan
// that turns the difference from the live account into an ordered list of actions, and the apply
// that runs those actions. It makes no network call of its own: the apply takes an `api` function
// (path, body, options) that infra/microsoft/ads/msads.js supplies.
//
// Only entities the file names are created or updated. Nothing is deleted: a live entity the file
// does not name is listed as unmanaged and left alone.

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

export const ADS_CONFIG_PATH = "infra/microsoft/ads/ads.toml";
export const MAX_HEADLINE_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 90;
export const MIN_HEADLINES = 3;
export const MAX_HEADLINES = 15;
export const MIN_DESCRIPTIONS = 2;
export const MAX_DESCRIPTIONS = 4;
export const MAX_NEGATIVE_KEYWORDS_PER_REQUEST = 20000;
export const CAMPAIGN_TIME_ZONE = "GreenwichMeanTimeDublinEdinburghLisbonLondon";
export const LOCATION_IDS = { GB: 188 };
export const KEYWORD_MATCH_TYPES = { PHRASE: "Phrase", EXACT: "Exact", BROAD: "Broad" };
export const GOAL_TYPES = ["Event", "OfflineConversion"];
export const NETWORK_OWNED_ONLY = "OwnedAndOperatedOnly";
export const NETWORK_WITH_PARTNERS = "OwnedAndOperatedAndSyndicatedSearch";
export const AUTO_TAG_ENABLED = "Enabled";

// --- Declared state ---

function requireValue(condition, message) {
  if (!condition) throw new Error(`ads.toml: ${message}`);
}

function parseAd(adGroupName, ad) {
  requireValue(ad, `ad group "${adGroupName}" has no [ad]`);
  const { headlines = [], descriptions = [], final_url: finalUrl } = ad;
  requireValue(
    headlines.length >= MIN_HEADLINES && headlines.length <= MAX_HEADLINES,
    `ad group "${adGroupName}" needs ${MIN_HEADLINES} to ${MAX_HEADLINES} headlines`,
  );
  requireValue(
    descriptions.length >= MIN_DESCRIPTIONS && descriptions.length <= MAX_DESCRIPTIONS,
    `ad group "${adGroupName}" needs ${MIN_DESCRIPTIONS} to ${MAX_DESCRIPTIONS} descriptions`,
  );
  for (const h of headlines) requireValue(h.length <= MAX_HEADLINE_LENGTH, `headline over ${MAX_HEADLINE_LENGTH} characters: "${h}"`);
  for (const d of descriptions)
    requireValue(d.length <= MAX_DESCRIPTION_LENGTH, `description over ${MAX_DESCRIPTION_LENGTH} characters: "${d}"`);
  requireValue(/^https:\/\//.test(finalUrl ?? ""), `ad group "${adGroupName}" needs an https final_url`);
  return { headlines, descriptions, finalUrl };
}

function parseAdGroup(adGroup, campaign) {
  requireValue(adGroup.name, "an ad group has no name");
  const keywords = (adGroup.keyword ?? []).map((k) => {
    const matchType = KEYWORD_MATCH_TYPES[String(k.match_type).toUpperCase()];
    requireValue(matchType, `keyword "${k.text}" has an unknown match_type "${k.match_type}"`);
    return { text: k.text, matchType };
  });
  requireValue(keywords.length > 0, `ad group "${adGroup.name}" has no keywords`);
  return {
    name: adGroup.name,
    cpcBid: campaign.bidding.ad_group_cpc_bid_gbp,
    network: campaign.network?.partner_syndication ? NETWORK_WITH_PARTNERS : NETWORK_OWNED_ONLY,
    keywords,
    ad: parseAd(adGroup.name, adGroup.ad),
  };
}

function parseCampaign(campaign) {
  requireValue(campaign.name, "a campaign has no name");
  requireValue(campaign.type === "Search", `campaign "${campaign.name}" type must be "Search"`);
  requireValue(campaign.bidding?.strategy === "enhanced_cpc", `campaign "${campaign.name}" bidding.strategy must be "enhanced_cpc"`);
  const bid = campaign.bidding.ad_group_cpc_bid_gbp;
  const ceiling = campaign.bidding.cpc_bid_ceiling_gbp;
  requireValue(
    bid > 0 && ceiling > 0 && bid <= ceiling,
    `campaign "${campaign.name}" ad_group_cpc_bid_gbp must be above 0 and at most cpc_bid_ceiling_gbp`,
  );
  requireValue(campaign.budget_gbp > 0, `campaign "${campaign.name}" needs budget_gbp above 0`);
  requireValue(campaign.is_political === false, `campaign "${campaign.name}" is_political must be false`);
  const locationIds = (campaign.locations ?? []).map((code) => {
    requireValue(LOCATION_IDS[code], `campaign "${campaign.name}" has an unknown location "${code}"`);
    return LOCATION_IDS[code];
  });
  const negatives = campaign.negative_keywords ?? {};
  return {
    name: campaign.name,
    status: campaign.status,
    dailyBudget: campaign.budget_gbp,
    locationIds,
    locationIntent: campaign.location_intent,
    languages: campaign.languages ?? ["English"],
    isPolitical: campaign.is_political,
    finalUrlSuffix: campaign.final_url_suffix ?? "",
    biddingType: "EnhancedCpc",
    negativeKeywords: [
      ...(negatives.phrase ?? []).map((text) => ({ text, matchType: KEYWORD_MATCH_TYPES.PHRASE })),
      ...(negatives.exact ?? []).map((text) => ({ text, matchType: KEYWORD_MATCH_TYPES.EXACT })),
    ],
    adGroups: (campaign.ad_group ?? []).map((g) => parseAdGroup(g, campaign)),
  };
}

function parseGoal(goal) {
  requireValue(goal.name, "a conversion goal has no name");
  requireValue(GOAL_TYPES.includes(goal.type), `conversion goal "${goal.name}" type must be one of ${GOAL_TYPES.join(", ")}`);
  requireValue(goal.type !== "Event" || goal.event, `event goal "${goal.name}" needs an event`);
  requireValue(["variable", "none"].includes(goal.revenue), `conversion goal "${goal.name}" revenue must be "variable" or "none"`);
  return {
    name: goal.name,
    type: goal.type,
    event: goal.event,
    category: goal.category,
    countType: goal.count_type,
    windowMinutes: goal.window_minutes,
    revenue: goal.revenue,
  };
}

export function parseDesired(tomlString) {
  const parsed = TOML.parse(tomlString);
  requireValue(parsed.uet?.name, "[uet].name is missing");
  return {
    autoTagging: parsed.account?.auto_tagging === true,
    uet: { name: parsed.uet.name, description: parsed.uet.description ?? "", tagId: parsed.uet.tag_id ? String(parsed.uet.tag_id) : "" },
    uploadGoalName: parsed.upload?.conversion_goal_name,
    goals: (parsed.conversion_goal ?? []).map(parseGoal),
    campaigns: (parsed.campaign ?? []).map(parseCampaign),
  };
}

export function loadDesiredFromRoot() {
  return parseDesired(fs.readFileSync(path.join(process.cwd(), ADS_CONFIG_PATH), "utf-8"));
}

// --- Live state ---

export function shapeUetTag(tag) {
  return { id: String(tag.Id), name: tag.Name, trackingStatus: tag.TrackingStatus };
}

export function shapeGoal(goal) {
  return {
    id: String(goal.Id),
    name: goal.Name,
    type: goal.Type,
    category: goal.GoalCategory,
    status: goal.Status,
    countType: goal.CountType,
    windowMinutes: goal.ConversionWindowInMinutes,
    event: goal.ActionExpression,
    revenueType: goal.Revenue?.Type,
    tagId: goal.TagId === undefined || goal.TagId === null ? undefined : String(goal.TagId),
  };
}

// --- Request bodies ---

const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function goalRevenue(goal) {
  return goal.revenue === "variable" ? { Type: "VariableValue", CurrencyCode: "GBP" } : { Type: "NoValue" };
}

export function buildGoalBody(goal, tagId) {
  const body = {
    Type: goal.type,
    Name: goal.name,
    GoalCategory: goal.category,
    CountType: goal.countType,
    ConversionWindowInMinutes: goal.windowMinutes,
    Scope: "Account",
    Status: "Active",
    Revenue: goalRevenue(goal),
  };
  if (goal.type === "Event") {
    body.TagId = tagId;
    body.ActionOperator = "Equals";
    body.ActionExpression = goal.event;
  }
  return body;
}

export function buildCampaignBody(campaign) {
  return {
    Name: campaign.name,
    CampaignType: "Search",
    Status: campaign.status,
    BudgetType: "DailyBudgetStandard",
    DailyBudget: campaign.dailyBudget,
    TimeZone: CAMPAIGN_TIME_ZONE,
    Languages: campaign.languages,
    BiddingScheme: { Type: campaign.biddingType },
    FinalUrlSuffix: campaign.finalUrlSuffix,
    IsPolitical: campaign.isPolitical,
  };
}

export function buildAdGroupBody(adGroup) {
  return { Name: adGroup.name, Status: "Active", CpcBid: { Amount: adGroup.cpcBid }, Network: adGroup.network };
}

export function buildKeywordBody(keyword, adGroup) {
  return { Text: keyword.text, MatchType: keyword.matchType, Status: "Active", Bid: { Amount: adGroup.cpcBid } };
}

const textAssets = (texts) => texts.map((text) => ({ Asset: { Type: "TextAsset", Text: text } }));

export function buildAdBody(ad) {
  return {
    Type: "ResponsiveSearch",
    Status: "Active",
    FinalUrls: [ad.finalUrl],
    Headlines: textAssets(ad.headlines),
    Descriptions: textAssets(ad.descriptions),
  };
}

export function buildLocationCriteria(campaignId, campaign) {
  const criteria = campaign.locationIds.map((locationId) => ({
    Type: "BiddableCampaignCriterion",
    CampaignId: campaignId,
    Criterion: { Type: "LocationCriterion", LocationId: locationId },
    CriterionBid: { Type: "BidMultiplier", Multiplier: 0 },
  }));
  if (campaign.locationIntent && campaign.locationIds.length > 0) {
    criteria.push({
      Type: "BiddableCampaignCriterion",
      CampaignId: campaignId,
      Criterion: { Type: "LocationIntentCriterion", IntentOption: campaign.locationIntent },
    });
  }
  return criteria;
}

export function buildNegativeKeywordBodies(campaignId, negatives) {
  const bodies = [];
  for (let start = 0; start < negatives.length; start += MAX_NEGATIVE_KEYWORDS_PER_REQUEST) {
    bodies.push({
      EntityNegativeKeywords: [
        {
          EntityId: campaignId,
          EntityType: "Campaign",
          NegativeKeywords: negatives
            .slice(start, start + MAX_NEGATIVE_KEYWORDS_PER_REQUEST)
            .map((n) => ({ Text: n.text, MatchType: n.matchType })),
        },
      ],
    });
  }
  return bodies;
}

// --- Plan ---

function planGoals(desired, live, actions, unmanaged) {
  const liveByName = new Map(live.goals.map((g) => [g.name, g]));
  for (const goal of desired.goals) {
    const existing = liveByName.get(goal.name);
    if (!existing) {
      actions.push({ kind: "create-goal", goal });
      continue;
    }
    const differences = [];
    if (existing.type !== goal.type) differences.push(`type ${existing.type} to ${goal.type}`);
    if (existing.category !== goal.category) differences.push(`category ${existing.category} to ${goal.category}`);
    if (existing.status !== "Active") differences.push(`status ${existing.status} to Active`);
    if (existing.countType !== goal.countType) differences.push(`count type ${existing.countType} to ${goal.countType}`);
    if (existing.windowMinutes !== goal.windowMinutes) differences.push(`window ${existing.windowMinutes} to ${goal.windowMinutes}`);
    if (goal.type === "Event" && existing.event !== goal.event) differences.push(`event ${existing.event} to ${goal.event}`);
    if (differences.length > 0) actions.push({ kind: "update-goal", goal, id: existing.id, differences });
  }
  const declared = new Set(desired.goals.map((g) => g.name));
  for (const g of live.goals) if (!declared.has(g.name)) unmanaged.push(`conversion goal "${g.name}"`);
}

function planAdGroup({ campaignName, campaignId }, adGroup, liveGroup, actions, unmanaged) {
  if (!liveGroup) {
    actions.push({ kind: "create-ad-group", campaignName, campaignId, adGroup });
    return;
  }
  if (liveGroup.cpcBid !== adGroup.cpcBid || liveGroup.status !== "Active") {
    actions.push({
      kind: "update-ad-group",
      campaignName,
      campaignId,
      adGroup,
      id: liveGroup.id,
      differences: [`cpc bid ${liveGroup.cpcBid} to ${adGroup.cpcBid}`],
    });
  }
  const liveKeywords = new Set(liveGroup.keywords.map((k) => `${k.matchType}|${k.text}`));
  const missing = adGroup.keywords.filter((k) => !liveKeywords.has(`${k.matchType}|${k.text}`));
  if (missing.length > 0) actions.push({ kind: "create-keywords", campaignName, adGroup, adGroupId: liveGroup.id, keywords: missing });
  const declaredKeywords = new Set(adGroup.keywords.map((k) => `${k.matchType}|${k.text}`));
  for (const k of liveGroup.keywords) {
    if (!declaredKeywords.has(`${k.matchType}|${k.text}`)) unmanaged.push(`keyword "${k.text}" [${k.matchType}] in "${adGroup.name}"`);
  }
  const liveAd = liveGroup.ads.find((a) => a.type === "ResponsiveSearch");
  if (!liveAd) {
    actions.push({ kind: "create-ad", campaignName, adGroup, adGroupId: liveGroup.id });
  } else if (
    !sameSet(liveAd.headlines, adGroup.ad.headlines) ||
    !sameSet(liveAd.descriptions, adGroup.ad.descriptions) ||
    !sameSet(liveAd.finalUrls, [adGroup.ad.finalUrl])
  ) {
    actions.push({ kind: "update-ad", campaignName, adGroup, adGroupId: liveGroup.id, adId: liveAd.id });
  }
}

function planCampaign(campaign, liveCampaign, actions, unmanaged) {
  if (!liveCampaign) {
    actions.push({ kind: "create-campaign", campaign });
    for (const adGroup of campaign.adGroups) planAdGroup({ campaignName: campaign.name }, adGroup, undefined, actions, unmanaged);
    return;
  }
  const differences = [];
  if (liveCampaign.status !== campaign.status) differences.push(`status ${liveCampaign.status} to ${campaign.status}`);
  if (liveCampaign.dailyBudget !== campaign.dailyBudget)
    differences.push(`daily budget ${liveCampaign.dailyBudget} to ${campaign.dailyBudget}`);
  if (!sameSet(liveCampaign.languages, campaign.languages))
    differences.push(`languages ${liveCampaign.languages.join(",")} to ${campaign.languages.join(",")}`);
  if ((liveCampaign.finalUrlSuffix ?? "") !== campaign.finalUrlSuffix) differences.push("final URL suffix");
  if ((liveCampaign.biddingScheme?.Type ?? "EnhancedCpc") !== campaign.biddingType)
    differences.push(`bidding ${liveCampaign.biddingScheme?.Type} to ${campaign.biddingType}`);
  if (differences.length > 0) actions.push({ kind: "update-campaign", campaign, id: liveCampaign.id, differences });

  const liveLocations = new Set(
    liveCampaign.criteria.filter((c) => c.type === "LocationCriterion" && !c.negative).map((c) => Number(c.detail.LocationId)),
  );
  const hasIntent = liveCampaign.criteria.some(
    (c) => c.type === "LocationIntentCriterion" && c.detail.IntentOption === campaign.locationIntent,
  );
  const missingLocations = campaign.locationIds.filter((id) => !liveLocations.has(id));
  if (missingLocations.length > 0 || (campaign.locationIntent && !hasIntent)) {
    actions.push({
      kind: "create-locations",
      campaign: { ...campaign, locationIds: missingLocations, locationIntent: hasIntent ? undefined : campaign.locationIntent },
      campaignId: liveCampaign.id,
    });
  }
  const liveNegatives = new Set(liveCampaign.negativeKeywords.map((n) => `${n.matchType}|${n.text}`));
  const missingNegatives = campaign.negativeKeywords.filter((n) => !liveNegatives.has(`${n.matchType}|${n.text}`));
  if (missingNegatives.length > 0)
    actions.push({ kind: "create-negatives", campaignName: campaign.name, campaignId: liveCampaign.id, negatives: missingNegatives });
  for (const adGroup of campaign.adGroups) {
    planAdGroup(
      { campaignName: campaign.name, campaignId: liveCampaign.id },
      adGroup,
      liveCampaign.adGroups.find((g) => g.name === adGroup.name),
      actions,
      unmanaged,
    );
  }
  const declaredGroups = new Set(campaign.adGroups.map((g) => g.name));
  for (const g of liveCampaign.adGroups) if (!declaredGroups.has(g.name)) unmanaged.push(`ad group "${g.name}" in "${campaign.name}"`);
}

/**
 * The ordered actions that make the live account match the declared state, with the live entities
 * the file does not name. `live` is {account, uetTags, goals, campaigns}.
 */
export function planChanges(desired, live) {
  const actions = [];
  const unmanaged = [];
  const tag = live.uetTags.find((t) => t.name === desired.uet.name);
  if (!tag) actions.push({ kind: "create-uet", uet: desired.uet });
  planGoals(desired, live, actions, unmanaged);
  const liveCampaigns = new Map(live.campaigns.map((c) => [c.name, c]));
  for (const campaign of desired.campaigns) planCampaign(campaign, liveCampaigns.get(campaign.name), actions, unmanaged);
  const declaredCampaigns = new Set(desired.campaigns.map((c) => c.name));
  for (const c of live.campaigns) if (!declaredCampaigns.has(c.name)) unmanaged.push(`campaign "${c.name}"`);
  if (desired.autoTagging && live.account.autoTagType !== AUTO_TAG_ENABLED) {
    actions.push({ kind: "enable-auto-tagging", account: live.account });
  }
  return { actions, unmanaged, tagId: tag?.id ?? desired.uet.tagId };
}

export function describeAction(a) {
  switch (a.kind) {
    case "create-uet":
      return `create UET tag "${a.uet.name}"`;
    case "create-goal":
      return `create ${a.goal.type} goal "${a.goal.name}"`;
    case "update-goal":
      return `update goal "${a.goal.name}": ${a.differences.join("; ")}`;
    case "create-campaign":
      return `create campaign "${a.campaign.name}" ${a.campaign.status} budget ${a.campaign.dailyBudget.toFixed(2)}/day ${a.campaign.biddingType} not political, locations ${a.campaign.locationIds.join(",")}, ${a.campaign.negativeKeywords.length} negative keywords`;
    case "update-campaign":
      return `update campaign "${a.campaign.name}": ${a.differences.join("; ")}`;
    case "create-locations":
      return `add targeting to "${a.campaign.name}": locations ${a.campaign.locationIds.join(",") || "none"}, intent ${a.campaign.locationIntent ?? "kept"}`;
    case "create-negatives":
      return `add ${a.negatives.length} negative keywords to "${a.campaignName}"`;
    case "create-ad-group":
      return `create ad group "${a.adGroup.name}" in "${a.campaignName}" with ${a.adGroup.keywords.length} keywords, bid ${a.adGroup.cpcBid.toFixed(2)}, and its ad`;
    case "update-ad-group":
      return `update ad group "${a.adGroup.name}": ${a.differences.join("; ")}`;
    case "create-keywords":
      return `add ${a.keywords.length} keywords to ad group "${a.adGroup.name}"`;
    case "create-ad":
      return `create the responsive search ad in ad group "${a.adGroup.name}"`;
    case "update-ad":
      return `update the responsive search ad in ad group "${a.adGroup.name}"`;
    case "enable-auto-tagging":
      return "turn on msclkid auto-tagging for the account";
    default:
      throw new Error(`Unknown action kind: ${a.kind}`);
  }
}

export function formatPlan(plan) {
  const lines = [`Plan: ${plan.actions.length} change(s), 0 deletes (apply never deletes)`];
  for (const a of plan.actions)
    lines.push(`  ${a.kind.startsWith("update") || a.kind === "enable-auto-tagging" ? "~" : "+"} ${describeAction(a)}`);
  if (plan.actions.length === 0) lines.push("  The account matches the file.");
  for (const u of plan.unmanaged) lines.push(`  unmanaged, left alone: ${u}`);
  return lines.join("\n");
}

// --- Apply ---

function collectErrors(response) {
  const errors = [...(response.PartialErrors ?? [])];
  for (const nested of response.NestedPartialErrors ?? []) errors.push(nested, ...(nested.BatchErrors ?? []));
  return errors;
}

async function call(api, apiPath, body, options, label) {
  const response = await api(apiPath, body, options);
  const errors = collectErrors(response);
  if (errors.length > 0) {
    const text = errors.map((e) => [e.ErrorCode ?? e.Code, e.Message ?? e.Details].join(": ")).join(" | ");
    throw new Error(`${label} failed: ${text.slice(0, 800)}`);
  }
  return response;
}

function idOf(response, key, label) {
  const id = response[key]?.[0];
  if (!id) throw new Error(`${label} returned no id`);
  return String(id);
}

/**
 * Runs the actions in order. `ctx` carries ids created on the way: campaign ids by name and the UET
 * tag id. `log` receives one line per action. Returns the ctx so the caller can print the tag id.
 */
export async function applyPlan(plan, { api, accountId, log = () => {} }) {
  const ctx = { tagId: plan.tagId, campaignIds: new Map() };
  for (const action of plan.actions) {
    log(`apply: ${describeAction(action)}`);
    await applyAction(action, { api, accountId, ctx });
  }
  return ctx;
}

async function applyAction(a, { api, accountId, ctx }) {
  switch (a.kind) {
    case "create-uet": {
      const response = await call(api, "/UetTags", { UetTags: [{ Name: a.uet.name, Description: a.uet.description }] }, {}, "AddUetTags");
      ctx.tagId = idOf({ ids: (response.UetTags ?? []).map((t) => t.Id) }, "ids", "AddUetTags");
      return;
    }
    case "create-goal":
      requireValue(a.goal.type !== "Event" || ctx.tagId, "an event goal needs a UET tag id");
      await call(api, "/ConversionGoals", { ConversionGoals: [buildGoalBody(a.goal, ctx.tagId)] }, {}, `AddConversionGoals ${a.goal.name}`);
      return;
    case "update-goal": {
      const { Type, Name, GoalCategory, CountType, ConversionWindowInMinutes, Status, ActionExpression } = buildGoalBody(a.goal, ctx.tagId);
      const body = { Id: a.id, Type, Name, GoalCategory, CountType, ConversionWindowInMinutes, Status };
      if (ActionExpression) body.ActionExpression = ActionExpression;
      await call(api, "/ConversionGoals", { ConversionGoals: [body] }, { method: "PUT" }, `UpdateConversionGoals ${a.goal.name}`);
      return;
    }
    case "create-campaign": {
      const response = await call(
        api,
        "/Campaigns",
        { AccountId: accountId, Campaigns: [buildCampaignBody(a.campaign)] },
        {},
        `AddCampaigns ${a.campaign.name}`,
      );
      const id = idOf(response, "CampaignIds", "AddCampaigns");
      ctx.campaignIds.set(a.campaign.name, id);
      await applyAction({ kind: "create-locations", campaign: a.campaign, campaignId: id }, { api, accountId, ctx });
      await applyAction(
        { kind: "create-negatives", campaignName: a.campaign.name, campaignId: id, negatives: a.campaign.negativeKeywords },
        { api, accountId, ctx },
      );
      return;
    }
    case "update-campaign": {
      const body = { ...buildCampaignBody(a.campaign), Id: a.id };
      delete body.CampaignType;
      delete body.TimeZone;
      await call(api, "/Campaigns", { AccountId: accountId, Campaigns: [body] }, { method: "PUT" }, `UpdateCampaigns ${a.campaign.name}`);
      return;
    }
    case "create-locations": {
      const criteria = buildLocationCriteria(a.campaignId, a.campaign);
      if (criteria.length > 0)
        await call(
          api,
          "/CampaignCriterions",
          { CampaignCriterions: criteria, CriterionType: "Targets" },
          {},
          `AddCampaignCriterions ${a.campaign.name}`,
        );
      return;
    }
    case "create-negatives":
      for (const body of buildNegativeKeywordBodies(a.campaignId, a.negatives)) {
        await call(api, "/EntityNegativeKeywords", body, {}, `AddNegativeKeywordsToEntities ${a.campaignName}`);
      }
      return;
    case "create-ad-group": {
      const campaignId = ctx.campaignIds.get(a.campaignName) ?? a.campaignId;
      requireValue(campaignId, `no campaign id for "${a.campaignName}"`);
      const response = await call(
        api,
        "/AdGroups",
        { CampaignId: campaignId, AdGroups: [buildAdGroupBody(a.adGroup)] },
        {},
        `AddAdGroups ${a.adGroup.name}`,
      );
      const adGroupId = idOf(response, "AdGroupIds", "AddAdGroups");
      await applyAction({ kind: "create-keywords", adGroup: a.adGroup, adGroupId, keywords: a.adGroup.keywords }, { api, accountId, ctx });
      await applyAction({ kind: "create-ad", adGroup: a.adGroup, adGroupId }, { api, accountId, ctx });
      return;
    }
    case "update-ad-group":
      await call(
        api,
        "/AdGroups",
        { CampaignId: ctx.campaignIds.get(a.campaignName) ?? a.campaignId, AdGroups: [{ Id: a.id, ...buildAdGroupBody(a.adGroup) }] },
        { method: "PUT" },
        `UpdateAdGroups ${a.adGroup.name}`,
      );
      return;
    case "create-keywords":
      await call(
        api,
        "/Keywords",
        { AdGroupId: a.adGroupId, Keywords: a.keywords.map((k) => buildKeywordBody(k, a.adGroup)) },
        {},
        `AddKeywords ${a.adGroup.name}`,
      );
      return;
    case "create-ad":
      await call(api, "/Ads", { AdGroupId: a.adGroupId, Ads: [buildAdBody(a.adGroup.ad)] }, {}, `AddAds ${a.adGroup.name}`);
      return;
    case "update-ad":
      await call(
        api,
        "/Ads",
        { AdGroupId: a.adGroupId, Ads: [{ Id: a.adId, ...buildAdBody(a.adGroup.ad) }] },
        { method: "PUT" },
        `UpdateAds ${a.adGroup.name}`,
      );
      return;
    case "enable-auto-tagging":
      await call(
        api,
        "/Account",
        { Account: { Id: a.account.id, Name: a.account.name, TimeStamp: a.account.timeStamp, AutoTagType: AUTO_TAG_ENABLED } },
        { method: "PUT", service: "customerManagement" },
        "UpdateAccount",
      );
      return;
    default:
      throw new Error(`Unknown action kind: ${a.kind}`);
  }
}

// --- Export ---

const intentOf = (criteria) => criteria.find((c) => c.type === "LocationIntentCriterion")?.detail.IntentOption;

/** The live Search campaigns in the shape of ads.toml, as a TOML string. */
export function exportToToml(live) {
  const idToCode = Object.fromEntries(Object.entries(LOCATION_IDS).map(([code, id]) => [id, code]));
  const campaigns = live.campaigns.map((c) => {
    const phrase = c.negativeKeywords.filter((n) => n.matchType === "Phrase").map((n) => n.text);
    const exact = c.negativeKeywords.filter((n) => n.matchType === "Exact").map((n) => n.text);
    const firstBid = c.adGroups[0]?.cpcBid ?? 0;
    return {
      name: c.name,
      type: c.type,
      status: c.status,
      budget_gbp: c.dailyBudget,
      locations: c.criteria
        .filter((x) => x.type === "LocationCriterion" && !x.negative)
        .map((x) => idToCode[x.detail.LocationId] ?? String(x.detail.LocationId)),
      ...(intentOf(c.criteria) ? { location_intent: intentOf(c.criteria) } : {}),
      languages: c.languages,
      is_political: false,
      final_url_suffix: c.finalUrlSuffix ?? "",
      bidding: { strategy: "enhanced_cpc", ad_group_cpc_bid_gbp: firstBid, cpc_bid_ceiling_gbp: firstBid },
      negative_keywords: { phrase, exact },
      ad_group: c.adGroups.map((g) => {
        const ad = g.ads.find((a) => a.type === "ResponsiveSearch");
        return {
          name: g.name,
          keyword: g.keywords.map((k) => ({ text: k.text, match_type: k.matchType.toUpperCase() })),
          ...(ad ? { ad: { headlines: ad.headlines, descriptions: ad.descriptions, final_url: ad.finalUrls[0] } } : {}),
        };
      }),
    };
  });
  const goals = live.goals.map((g) => ({
    name: g.name,
    type: g.type,
    ...(g.event ? { event: g.event } : {}),
    category: g.category,
    count_type: g.countType,
    window_minutes: g.windowMinutes,
    revenue: g.revenueType === "VariableValue" ? "variable" : "none",
  }));
  const tag = live.uetTags[0];
  return TOML.stringify({
    account: { auto_tagging: live.account.autoTagType === AUTO_TAG_ENABLED },
    ...(tag ? { uet: { name: tag.name, description: "", tag_id: tag.id } } : {}),
    conversion_goal: goals,
    campaign: campaigns,
  });
}
