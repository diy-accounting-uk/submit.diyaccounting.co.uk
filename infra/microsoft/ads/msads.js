#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-62 Read and forecast the Microsoft Advertising account
// - **Use when:** a task asks what the Microsoft Advertising (Bing) account holds, what it has spent or what its keywords and budget would buy.
// - **Does:** msads.js is a client for the Bing Ads API v13 REST endpoints, signed in with Google OAuth and the IdentityProvider header. It reads the user, customer and account, the full campaign inventory with spend to date, a campaign report by date range, and Ad Insight traffic estimates. Its export, plan and apply modes (msads-sync.js) keep the account equal to infra/microsoft/ads/ads.toml: the UET tag, conversion goals, the Search campaign with its ad groups, keywords, negatives and ads, and the MSCLKIDAutoTaggingEnabled account property; apply never deletes. msads-apply.yml applies on a push to main that touches infra/microsoft/** and plans on a dispatch. msads-conversions-upload.js sends paid Stripe charges with a stored msclkid to the offline goal, and prints them without --apply. The consent mode stores the Google refresh token in Secrets Manager.
// - **Run:** `npm run msads:consent`; `npm run msads:whoami`; `npm run msads:inventory`; `npm run msads:forecast`; `npm run msads:report -- --from 2026-10-29 --to 2026-11-12`; `node infra/microsoft/ads/msads.js --plan` (or `--export`, `--apply`); `gh workflow run msads-apply.yml`; `node infra/microsoft/ads/msads-conversions-upload.js [--apply]`; `gh workflow run msads-conversions-upload.yml` (daily at 05:20 UTC)
// - **Entry:** `infra/microsoft/ads/msads.js:main`
// - **Files:** infra/microsoft/ads/msads.js, infra/microsoft/ads/msads.toml, infra/microsoft/ads/ads.toml, infra/microsoft/ads/msads-sync.js, infra/microsoft/ads/msads-conversions-upload.js, .github/workflows/msads-apply.yml, .github/workflows/msads-conversions-upload.yml, app/lib/microsoftAdsReporting.js, app/unit-tests/scripts/msads.test.js, app/unit-tests/scripts/msadsSync.test.js, app/unit-tests/scripts/msadsConversionsUpload.test.js
// - **Keywords:** microsoft advertising, bing ads, msads, bing forecast, ad insight, traffic estimates, identityprovider google, developer token, bing campaign as code, uet tag, msclkid, offline conversion
// - **Related:** DATA-33, DATA-34, DATA-35, DATA-63
// @end-capability

// infra/microsoft/ads/msads.js
//
// Client for the Microsoft Advertising account named in infra/microsoft/ads/msads.toml (Bing Ads
// API v13, REST endpoints). Every mode reads, except --apply, which creates and updates what
// infra/microsoft/ads/ads.toml names and deletes nothing.
//
// Usage:
//   node infra/microsoft/ads/msads.js --consent [--client-file <path>]
//   node infra/microsoft/ads/msads.js --whoami [--json]
//   node infra/microsoft/ads/msads.js --inventory [--json] [--campaign-types "Search Audience"]
//   node infra/microsoft/ads/msads.js --forecast [--keywords "a,b" | --keywords-file <path>] [--max-cpc-gbp <n>] [--json]
//   node infra/microsoft/ads/msads.js --report [--from YYYY-MM-DD --to YYYY-MM-DD] [--json]
//   node infra/microsoft/ads/msads.js --export          (the live account as ads.toml)
//   node infra/microsoft/ads/msads.js --plan            (the difference between ads.toml and the account)
//   node infra/microsoft/ads/msads.js --apply           (make the account match ads.toml)
//
// The account signs in with Google. --consent runs the loopback OAuth flow scripts/youtube-upload.js
// uses, with the YouTube OAuth client and the scopes in msads.toml, and stores the refresh token in
// the Secrets Manager secret msads.toml names (an AWS write, through
// scripts/put-secret-with-rotation-tag.sh). Every other mode reads that token, exchanges it at
// Google's token endpoint for an access token and calls the API with it.
//
// Every request carries the developer token, the Google access token as a Bearer token, the
// IdentityProvider header and, once whoami has found it, the customer id and the account id.
// The customer id is not stored: it is read from the account's ParentCustomerId on each run.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { resolveClientCredentials, runLoopbackConsent } from "../../../scripts/youtube-upload.js";
import {
  callApi,
  dateObject,
  discoverCustomer,
  openSession as openSessionWithCredentials,
  parseConfig,
  runCampaignReport,
} from "../../../app/lib/microsoftAdsReporting.js";
import {
  loadDesiredFromRoot,
  planChanges,
  formatPlan,
  applyPlan,
  exportToToml,
  shapeUetTag,
  shapeGoal,
  GOAL_TYPES,
  MSCLKID_AUTO_TAGGING,
} from "./msads-sync.js";

export const CONFIG_PATH = "infra/microsoft/ads/msads.toml";
export const DEFAULT_CAMPAIGN_TYPES = "Search";
export const AD_TYPES = ["ExpandedText", "ResponsiveSearch", "DynamicSearch"];
export const CAMPAIGN_CRITERION_TYPES = ["Location", "LocationIntent", "Radius", "DayTime", "Device", "Age", "Gender"];
export const DEFAULT_MAX_CPC_GBP = 1;

export function loadConfigFromRoot() {
  return parseConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

const MODES = ["consent", "whoami", "inventory", "forecast", "report", "export", "plan", "apply"];
const VALUE_FLAGS = {
  "--client-file": "clientFile",
  "--campaign-types": "campaignTypes",
  "--keywords": "keywords",
  "--keywords-file": "keywordsFile",
  "--max-cpc-gbp": "maxCpcGbp",
  "--from": "from",
  "--to": "to",
};

export function parseArgs(argv) {
  const opts = { mode: undefined, json: false, campaignTypes: DEFAULT_CAMPAIGN_TYPES };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") && MODES.includes(arg.slice(2))) {
      if (opts.mode) throw new Error(`Only one mode at a time: ${opts.mode} and ${arg.slice(2)}`);
      opts.mode = arg.slice(2);
    } else if (arg === "--json") {
      opts.json = true;
    } else if (VALUE_FLAGS[arg]) {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires an argument`);
      opts[VALUE_FLAGS[arg]] = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.mode) throw new Error(`One mode is required: ${MODES.join(", ")} (each with a -- prefix)`);
  if (Boolean(opts.from) !== Boolean(opts.to)) throw new Error("--from and --to must be given together");
  if (opts.keywords && opts.keywordsFile) throw new Error("--keywords and --keywords-file are mutually exclusive");
  return opts;
}

// --- Credentials ---

let cachedSecretsManagerClient = null;
function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

export async function openSession({ config, clientFile, smClient = getSecretsManagerClient(), fetchImpl = fetch }) {
  const clientCredentials = await resolveClientCredentials({ clientFile, smClient });
  return openSessionWithCredentials({ config, clientCredentials, smClient, fetchImpl });
}

// --- Customer ---

// --- Inventory ---

export function shapeCampaign(c) {
  return {
    id: String(c.Id),
    name: c.Name,
    status: c.Status,
    type: c.CampaignType,
    budgetId: c.BudgetId ? String(c.BudgetId) : undefined,
    budgetType: c.BudgetType,
    dailyBudget: c.DailyBudget,
    biddingScheme: c.BiddingScheme ?? null,
    languages: c.Languages ?? [],
    timeZone: c.TimeZone,
    startDate: c.StartDate ?? null,
    endDate: c.EndDate ?? null,
    trackingUrlTemplate: c.TrackingUrlTemplate,
    finalUrlSuffix: c.FinalUrlSuffix,
  };
}

export function shapeAdGroup(g) {
  return {
    id: String(g.Id),
    name: g.Name,
    status: g.Status,
    cpcBid: g.CpcBid?.Amount,
    language: g.Language,
    network: g.Network,
    biddingScheme: g.BiddingScheme ?? null,
  };
}

export function shapeKeyword(k) {
  return {
    id: String(k.Id),
    text: k.Text,
    matchType: k.MatchType,
    status: k.Status,
    bid: k.Bid?.Amount,
    editorialStatus: k.EditorialStatus,
  };
}

function assetTexts(links) {
  return (links ?? []).map((l) => l.Text ?? l.Asset?.Text).filter(Boolean);
}

export function shapeAd(ad) {
  return {
    id: String(ad.Id),
    type: ad.Type,
    status: ad.Status,
    finalUrls: ad.FinalUrls ?? [],
    headlines: ad.TitlePart1 ? [ad.TitlePart1, ad.TitlePart2, ad.TitlePart3].filter(Boolean) : assetTexts(ad.Headlines),
    descriptions: ad.Text ? [ad.Text, ad.TextPart2].filter(Boolean) : assetTexts(ad.Descriptions),
    path: [ad.Path1, ad.Path2].filter(Boolean).join("/"),
    editorialStatus: ad.EditorialStatus,
  };
}

export function shapeCriterion(cc) {
  const { Type: criterionType, ...detail } = cc.Criterion ?? {};
  return {
    id: String(cc.Id),
    type: criterionType,
    negative: cc.Type === "NegativeCampaignCriterion",
    status: cc.Status,
    bidMultiplier: cc.CriterionBid?.Multiplier,
    detail,
  };
}

export function shapeNegativeKeywords(body) {
  return (body.EntityNegativeKeywords ?? []).flatMap((e) =>
    (e.NegativeKeywords ?? []).map((k) => ({ entityId: String(e.EntityId), text: k.Text, matchType: k.MatchType })),
  );
}

export function isoDate(date) {
  return `${date.Year}-${String(date.Month).padStart(2, "0")}-${String(date.Day).padStart(2, "0")}`;
}

export function earliestStart(campaigns, fallbackDate) {
  const starts = campaigns.map((c) => dateObject(c.startDate)).filter(Boolean);
  if (starts.length === 0) return fallbackDate;
  return starts.map(isoDate).sort()[0];
}

export async function readInventory(session, { campaignTypes }) {
  const { config } = session;
  const findings = [];
  const campaignBody = await callApi(session, config.campaignManagementUrl, "/Campaigns/QueryByAccountId", {
    AccountId: config.accountId,
    CampaignType: campaignTypes,
    ReturnAdditionalFields: null,
  });
  const campaigns = (campaignBody.Campaigns ?? []).map(shapeCampaign);

  const budgetIds = [...new Set(campaigns.map((c) => c.budgetId).filter(Boolean))];
  const budgets =
    budgetIds.length === 0
      ? []
      : ((await callApi(session, config.campaignManagementUrl, "/Budgets/QueryByIds", { BudgetIds: budgetIds })).Budgets ?? []).map(
          (b) => ({ id: String(b.Id), name: b.Name, amount: b.Amount, type: b.BudgetType }),
        );

  for (const campaign of campaigns) {
    const adGroups = (
      (
        await callApi(session, config.campaignManagementUrl, "/AdGroups/QueryByCampaignId", {
          CampaignId: campaign.id,
          ReturnAdditionalFields: null,
        })
      ).AdGroups ?? []
    ).map(shapeAdGroup);
    for (const adGroup of adGroups) {
      adGroup.keywords = (
        (
          await callApi(session, config.campaignManagementUrl, "/Keywords/QueryByAdGroupId", {
            AdGroupId: adGroup.id,
            ReturnAdditionalFields: null,
          })
        ).Keywords ?? []
      ).map(shapeKeyword);
      adGroup.ads = (
        (
          await callApi(session, config.campaignManagementUrl, "/Ads/QueryByAdGroupId", {
            AdGroupId: adGroup.id,
            AdTypes: AD_TYPES,
            ReturnAdditionalFields: null,
          })
        ).Ads ?? []
      ).map(shapeAd);
    }
    campaign.adGroups = adGroups;
    campaign.criteria = [];
    for (const criterionType of CAMPAIGN_CRITERION_TYPES) {
      try {
        const body = await callApi(session, config.campaignManagementUrl, "/CampaignCriterions/QueryByIds", {
          CampaignCriterionIds: null,
          CampaignId: campaign.id,
          CriterionType: criterionType,
          ReturnAdditionalFields: null,
        });
        campaign.criteria.push(...(body.CampaignCriterions ?? []).map(shapeCriterion));
      } catch (error) {
        findings.push(`campaign ${campaign.id} ${criterionType} criteria not read: ${error.message}`);
      }
    }
    try {
      campaign.negativeKeywords = shapeNegativeKeywords(
        await callApi(session, config.campaignManagementUrl, "/NegativeKeywords/QueryByEntityIds", {
          EntityIds: [campaign.id],
          EntityType: "Campaign",
          ParentEntityId: config.accountId,
        }),
      );
    } catch (error) {
      campaign.negativeKeywords = [];
      findings.push(`campaign ${campaign.id} negative keywords not read: ${error.message}`);
    }
  }
  return { campaigns, budgets, findings };
}

// --- Conversion setup and sync ---

export async function readConversionSetup(session) {
  const { config } = session;
  const tags = await callApi(session, config.campaignManagementUrl, "/UetTags/QueryByIds", { TagIds: null });
  const goals = await callApi(session, config.campaignManagementUrl, "/ConversionGoals/QueryByIds", {
    ConversionGoalIds: null,
    ConversionGoalTypes: GOAL_TYPES.join(","),
    ReturnAdditionalFields: "GoalCategory",
  });
  const properties = await callApi(session, config.campaignManagementUrl, "/AccountProperties/Query", {
    AccountPropertyNames: [MSCLKID_AUTO_TAGGING],
  });
  const msclkidAutoTagging = (properties.AccountProperties ?? []).some((p) => p.Name === MSCLKID_AUTO_TAGGING && p.Value === "true");
  return { uetTags: (tags.UetTags ?? []).map(shapeUetTag), goals: (goals.ConversionGoals ?? []).map(shapeGoal), msclkidAutoTagging };
}

export async function readLiveState(session, who) {
  const inventory = await readInventory(session, { campaignTypes: DEFAULT_CAMPAIGN_TYPES });
  const setup = await readConversionSetup(session);
  return { account: who.account, campaigns: inventory.campaigns, findings: inventory.findings, ...setup };
}

export function buildSyncApi(session) {
  return (operationPath, body, { method = "POST", service = "campaignManagement" } = {}) =>
    callApi(
      session,
      service === "customerManagement" ? session.config.customerManagementUrl : session.config.campaignManagementUrl,
      operationPath,
      body,
      { method },
    );
}

// --- Reporting ---

export function defaultReportRange(now = new Date()) {
  const day = (offset) => {
    const d = new Date(now.getTime() - offset * 86400000);
    return d.toISOString().slice(0, 10);
  };
  return { from: day(28), to: day(1) };
}

// --- Forecast ---

export function parseKeywordsList(value) {
  return value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function readKeywordsFile(filePath, read = (p) => fs.readFileSync(p, "utf8")) {
  return read(filePath)
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k && !k.startsWith("#"));
}

function campaignMaxCpc(campaign, fallback) {
  return campaign.biddingScheme?.MaxCpc?.Amount ?? fallback;
}

export function buildTrafficEstimateRequest({ campaign, extraKeywords = [], maxCpcGbp = DEFAULT_MAX_CPC_GBP, matchType = "Exact" }) {
  const cpc = campaignMaxCpc(campaign, maxCpcGbp);
  const adGroupEstimators = campaign.adGroups
    .filter((g) => g.keywords.length > 0)
    .map((g) => ({
      AdGroupId: g.id,
      MaxCpc: g.cpcBid ?? cpc,
      KeywordEstimators: g.keywords.map((k) => ({
        Keyword: { Id: k.id, MatchType: k.matchType, Text: k.text },
        MaxCpc: k.bid ?? g.cpcBid ?? cpc,
      })),
    }));
  if (extraKeywords.length > 0) {
    adGroupEstimators.push({
      MaxCpc: cpc,
      KeywordEstimators: extraKeywords.map((text) => ({ Keyword: { MatchType: matchType, Text: text }, MaxCpc: cpc })),
    });
  }
  const criteria = campaign.criteria
    .filter((c) => !c.negative && (c.type === "LocationCriterion" || c.type === "DeviceCriterion"))
    .map((c) => ({ Type: c.type, ...c.detail }));
  for (const language of campaign.languages.filter((l) => l !== "All")) criteria.push({ Type: "LanguageCriterion", Language: language });
  const network = campaign.adGroups.find((g) => g.network)?.network ?? "OwnedAndOperatedOnly";
  criteria.push({ Type: "NetworkCriterion", Network: network });
  return {
    CampaignEstimators: [
      {
        CampaignId: campaign.id,
        DailyBudget: campaign.dailyBudget ?? undefined,
        Criteria: criteria,
        AdGroupEstimators: adGroupEstimators,
      },
    ],
  };
}

export function shapeTrafficEstimates(body) {
  const side = (s) => ({
    clicks: s?.Clicks,
    impressions: s?.Impressions,
    averageCpc: s?.AverageCpc,
    totalCost: s?.TotalCost,
    ctr: s?.Ctr,
    averagePosition: s?.AveragePosition,
  });
  return (body.CampaignEstimates ?? []).flatMap((c) =>
    (c.AdGroupEstimates ?? []).flatMap((g) =>
      (g.KeywordEstimates ?? []).map((k) => ({
        campaignId: String(c.CampaignId),
        adGroupId: g.AdGroupId ? String(g.AdGroupId) : undefined,
        keyword: k.Keyword?.Text,
        matchType: k.Keyword?.MatchType,
        minimum: side(k.Minimum),
        maximum: side(k.Maximum),
      })),
    ),
  );
}

export async function readForecast(session, { inventory, extraKeywords, maxCpcGbp }) {
  const results = [];
  for (const campaign of inventory.campaigns) {
    const body = await callApi(
      session,
      session.config.adInsightUrl,
      "/KeywordTrafficEstimates/Query",
      buildTrafficEstimateRequest({ campaign, extraKeywords, maxCpcGbp }),
    );
    results.push(...shapeTrafficEstimates(body));
  }
  return results;
}

// --- Printing ---

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)));
  const line = (cells) => cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ");
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

const money = (v) => (v === undefined || v === null ? "" : Number(v).toFixed(2));

export function formatWhoami(w) {
  const roles = w.roles.map((r) => ["customer", r.customerId, "role", r.roleId, "accounts", r.accountIds.join(",")].join(" ")).join("; ");
  return [
    `User ${w.user.id} (${w.user.name}) customer ${w.user.customerId}`,
    `Customer ID ${w.customerId}`,
    `Account ${w.account.id} number ${w.account.number} "${w.account.name}" ${w.account.currency} ${w.account.lifeCycleStatus} ${w.account.financialStatus}`,
    `Roles: ${roles}`,
  ].join("\n");
}

export function formatInventory(inv) {
  const out = [];
  for (const c of inv.campaigns) {
    const budget = inv.budgets.find((b) => b.id === c.budgetId);
    out.push(
      `\nCampaign ${c.id} "${c.name}" ${c.status} ${c.type ?? ""} budget ${money(budget?.amount ?? c.dailyBudget)} (${budget?.type ?? c.budgetType ?? ""}) bidding ${c.biddingScheme?.Type ?? "unknown"} languages ${c.languages.join(",")}`,
    );
    out.push(`  starts ${c.startDate ? JSON.stringify(c.startDate) : "-"} tracking ${c.trackingUrlTemplate ?? "-"}`);
    const spent = inv.spend?.find((s) => s.campaignId === c.id)?.spend ?? 0;
    out.push(`  spend to date: ${inv.spend ? money(spent) : "not read"} (${inv.spendRange?.from} to ${inv.spendRange?.to})`);
    for (const g of c.adGroups) {
      out.push(
        `  Ad group ${g.id} "${g.name}" ${g.status} cpc bid ${money(g.cpcBid)} network ${g.network ?? ""} language ${g.language ?? ""}`,
      );
      out.push(
        table(
          ["    keyword", "match", "status", "bid"],
          g.keywords.map((k) => [`    ${k.text}`, k.matchType, k.status, money(k.bid)]),
        ),
      );
      for (const a of g.ads) {
        out.push(`    Ad ${a.id} ${a.type} ${a.status} ${a.finalUrls.join(" ")}`);
        out.push(`      headlines: ${a.headlines.join(" | ")}`);
        out.push(`      descriptions: ${a.descriptions.join(" | ")}`);
      }
    }
    out.push("  Targeting:");
    for (const t of c.criteria) {
      out.push(
        `    ${t.negative ? "exclude " : ""}${t.type} ${JSON.stringify(t.detail)} ${t.status ?? ""} multiplier ${t.bidMultiplier ?? "-"}`,
      );
    }
    const negatives = c.negativeKeywords.map((k) => k.text + " [" + k.matchType + "]").join(", ");
    out.push(`  Negative keywords: ${negatives || "none"}`);
  }
  for (const f of inv.findings) out.push(`NOT READ: ${f}`);
  return out.join("\n");
}

export function formatForecast(rows) {
  // Ad Insight estimates clicks, impressions and cost per week.
  return table(
    [
      "keyword",
      "match",
      "clicks/wk min",
      "clicks/wk max",
      "impr/wk min",
      "impr/wk max",
      "cpc min",
      "cpc max",
      "cost/wk min",
      "cost/wk max",
    ],
    rows.map((r) => [
      r.keyword,
      r.matchType,
      r.minimum.clicks,
      r.maximum.clicks,
      r.minimum.impressions,
      r.maximum.impressions,
      money(r.minimum.averageCpc),
      money(r.maximum.averageCpc),
      money(r.minimum.totalCost),
      money(r.maximum.totalCost),
    ]),
  );
}

export function formatReport(rows) {
  return table(
    ["campaign", "impressions", "clicks", "ctr %", "avg cpc", "spend", "conversions", "revenue"],
    rows.map((r) => [
      r.campaign,
      r.impressions,
      r.clicks,
      r.ctrPercent,
      money(r.averageCpc),
      money(r.spend),
      r.conversions,
      money(r.revenue),
    ]),
  );
}

// --- Modes ---

async function runConsent(config, clientFile) {
  const clientCredentials = await resolveClientCredentials({ clientFile, smClient: getSecretsManagerClient() });
  console.log(`Sign in with the Google account that owns Microsoft Advertising account ${config.accountNumber}.`);
  const refreshToken = await runLoopbackConsent({ clientCredentials, scopes: config.scope.split(" ") });
  console.log(`Writing the refresh token to Secrets Manager secret ${config.refreshTokenSecretName} (AWS write).`);
  execFileSync(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- deliberately runs this repo's own script, resolved relative to cwd, not searched on PATH
    "scripts/put-secret-with-rotation-tag.sh",
    [
      config.refreshTokenSecretName,
      JSON.stringify({ refresh_token: refreshToken }),
      "--description",
      "Google refresh token for Microsoft Advertising API sign-in",
    ],
    { stdio: "inherit" },
  );
}

function emit(opts, data, text) {
  console.log(opts.json ? JSON.stringify(data, null, 2) : text);
}

async function runSync(opts, session, who) {
  const live = await readLiveState(session, who);
  if (opts.mode === "export") return emit(opts, live, exportToToml(live));
  const plan = planChanges(loadDesiredFromRoot(), live);
  for (const finding of live.findings) console.log(`NOT READ: ${finding}`);
  if (opts.mode === "plan") return emit(opts, plan, formatPlan(plan));
  console.log(formatPlan(plan));
  const ctx = await applyPlan(plan, { api: buildSyncApi(session), accountId: session.config.accountId, log: console.log });
  if (plan.actions.some((a) => a.kind === "create-uet")) {
    console.log(`UET tag id: ${ctx.tagId}. Put it in infra/microsoft/ads/ads.toml [uet].tag_id and in UET_TAG_ID.`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();
  if (opts.mode === "consent") return runConsent(config, opts.clientFile);

  const session = await openSession({ config, clientFile: opts.clientFile });
  const who = await discoverCustomer(session);
  if (opts.mode === "whoami") return emit(opts, who, formatWhoami(who));

  if (opts.mode === "report") {
    const range = opts.from ? { from: opts.from, to: opts.to } : defaultReportRange();
    const rows = await runCampaignReport(session, range);
    return emit(opts, { range, rows }, `Campaign report ${range.from} to ${range.to}\n${formatReport(rows)}`);
  }

  if (["export", "plan", "apply"].includes(opts.mode)) return runSync(opts, session, who);

  const inventory = await readInventory(session, { campaignTypes: opts.campaignTypes });
  if (opts.mode === "inventory") {
    const today = new Date().toISOString().slice(0, 10);
    const spendRange = { from: earliestStart(inventory.campaigns, defaultReportRange().from), to: today };
    inventory.spendRange = spendRange;
    inventory.spend = await runCampaignReport(session, spendRange);
    return emit(opts, { ...who, ...inventory }, formatInventory(inventory));
  }

  let extraKeywords = [];
  if (opts.keywords) extraKeywords = parseKeywordsList(opts.keywords);
  else if (opts.keywordsFile) extraKeywords = readKeywordsFile(opts.keywordsFile);
  const maxCpcGbp = opts.maxCpcGbp ? Number(opts.maxCpcGbp) : DEFAULT_MAX_CPC_GBP;
  if (inventory.campaigns.length === 0) throw new Error("No campaigns to forecast against");
  const rows = await readForecast(session, { inventory, extraKeywords, maxCpcGbp });
  return emit(opts, rows, formatForecast(rows));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("msads failed:", err.message);
    process.exit(1);
  });
}
