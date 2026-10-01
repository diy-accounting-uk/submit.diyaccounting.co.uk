// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseArgs,
  parseConfig,
  planAds,
  describe as describeAction,
  shapeCampaignBidding,
  shapeCampaignTargeting,
  campaignCreateBody,
  uploadConversionActionCreateBody,
  locationCriteriaOperations,
  negativeKeywordOperations,
  shapeCampaignKeywords,
} from "../../../infra/google/ads/ads-sync.js";

const VALID_TOML = `
[account]
customer_id = "8142685080"
auto_tagging = true

[project]
id = "diyaccounting-ga4"

[secrets]
oauth_client = "prod/submit/youtube/oauth_client"
refresh_token = "prod/submit/google/ads/refresh_token"

[oauth]
scope = "https://www.googleapis.com/auth/adwords"

[api]
version = "v25"

[ga4]
property_id = "523400333"

[upload]
conversion_action_name = "DIY Accounting (upload) purchase"
scope = "https://www.googleapis.com/auth/datamanager"

[[conversion_action]]
name = "DIY Accounting (web) purchase"
ga4_event = "purchase"
category = "PURCHASE"
primary_for_goal = true

[[conversion_action]]
name = "DIY Accounting (web) submit_vat_return"
ga4_event = "submit_vat_return"
category = "SIGNUP"
primary_for_goal = true

[[customer_conversion_goal]]
category = "PURCHASE"
origin = "WEBSITE"
biddable = true

[[customer_conversion_goal]]
category = "SIGNUP"
origin = "WEBSITE"
biddable = true

[[campaign]]
name = "Campaign #1"
type = "PERFORMANCE_MAX"
status = "ENABLED"
budget_micros = 1000000

[campaign.bidding]
strategy = "maximize_conversions"

[[campaign.asset_group]]
name = "Asset Group 1"

[reserve_floor]
ssm_parameter = "/submit/prod/ads/reserve-floor-gbp"
`;

const SEARCH_CAMPAIGN_TOML = `
${VALID_TOML}
[[campaign]]
name = "Search #1"
type = "SEARCH"
budget_gbp = 5.00
status = "PAUSED"
locations = ["GB"]
geo_target_type = "PRESENCE"
contains_eu_political_advertising = false

[campaign.network]
google_search = true
search_network = false
content_network = false

[campaign.bidding]
strategy = "maximize_conversions"
target_cpa_gbp = 12.50

[[campaign.ad_group]]
name = "VAT software"

[[campaign.ad_group.keyword]]
text = "vat filing software"
match_type = "EXACT"

[[campaign.ad_group.keyword]]
text = "hmrc mtd vat"
match_type = "PHRASE"

[[campaign.ad_group.keyword]]
text = "submit vat return"
match_type = "BROAD"

[campaign.ad_group.ad]
headlines = ["File VAT Returns Online", "HMRC MTD Compliant Software", "Free VAT Filing Tool"]
descriptions = ["Submit VAT returns direct to HMRC.", "Free, simple, MTD compliant."]
final_url = "https://submit.diyaccounting.co.uk/"
`;

function baseLive() {
  return {
    customer: {
      id: "8142685080",
      name: "DIY Accounting Limited",
      autoTaggingEnabled: true,
      currencyCode: "GBP",
      timeZone: "Europe/London",
    },
    conversionActions: [
      {
        resourceName: "customers/8142685080/conversionActions/1",
        name: "DIY Accounting (web) purchase",
        type: "GOOGLE_ANALYTICS_4_PURCHASE",
        category: "PURCHASE",
        status: "ENABLED",
        primaryForGoal: true,
      },
      {
        resourceName: "customers/8142685080/conversionActions/2",
        name: "DIY Accounting (web) submit_vat_return",
        type: "GOOGLE_ANALYTICS_4_CUSTOM",
        category: "SIGNUP",
        status: "ENABLED",
        primaryForGoal: true,
      },
      {
        resourceName: "customers/8142685080/conversionActions/3",
        name: "DIY Accounting (upload) purchase",
        type: "UPLOAD_CLICKS",
        category: "PURCHASE",
        status: "ENABLED",
        primaryForGoal: true,
      },
    ],
    conversionGoals: [
      { category: "PURCHASE", origin: "WEBSITE", biddable: true },
      { category: "SIGNUP", origin: "WEBSITE", biddable: true },
    ],
    campaigns: [
      {
        resourceName: "customers/8142685080/campaigns/1",
        name: "Campaign #1",
        status: "ENABLED",
        advertisingChannelType: "PERFORMANCE_MAX",
        budgetResourceName: "customers/8142685080/campaignBudgets/1",
        budgetAmountMicros: "1000000",
        bidding: { strategy: "maximize_conversions", targetCpaMicros: null },
      },
    ],
  };
}

describe("ads-sync parseArgs", () => {
  it("defaults to no apply and no client file", () => {
    expect(parseArgs([])).toEqual({ apply: false, clientFile: undefined });
  });
  it("reads --apply", () => {
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });
  it("reads --client-file with its path", () => {
    expect(parseArgs(["--client-file", "/tmp/client.json"]).clientFile).toBe("/tmp/client.json");
  });
  it("fails when --client-file has no path argument", () => {
    expect(() => parseArgs(["--client-file"])).toThrow(/--client-file requires a path argument/);
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("ads-sync parseConfig", () => {
  it("reads the account fields plus the declared conversion actions, goals, campaign and reserve floor", () => {
    const config = parseConfig(VALID_TOML);
    expect(config.customerId).toBe("8142685080");
    expect(config.autoTagging).toBe(true);
    expect(config.conversionActions).toEqual([
      { name: "DIY Accounting (web) purchase", ga4Event: "purchase", category: "PURCHASE", primaryForGoal: true },
      { name: "DIY Accounting (web) submit_vat_return", ga4Event: "submit_vat_return", category: "SIGNUP", primaryForGoal: true },
    ]);
    expect(config.conversionGoals).toEqual([
      { category: "PURCHASE", origin: "WEBSITE", biddable: true },
      { category: "SIGNUP", origin: "WEBSITE", biddable: true },
    ]);
    expect(config.campaigns).toEqual([
      {
        name: "Campaign #1",
        type: "PERFORMANCE_MAX",
        status: "ENABLED",
        budgetMicros: "1000000",
        assetGroups: [{ name: "Asset Group 1" }],
        adGroups: [],
        bidding: { strategy: "maximize_conversions" },
      },
    ]);
    expect(config.reserveFloorSsmParameter).toBe("/submit/prod/ads/reserve-floor-gbp");
  });

  it("throws when [account].auto_tagging is missing", () => {
    expect(() => parseConfig(VALID_TOML.replace("auto_tagging = true\n", ""))).toThrow(/auto_tagging/);
  });

  it("throws when no [[conversion_action]] is declared", () => {
    const withoutActions = VALID_TOML.replace(/\[\[conversion_action\]\][\s\S]*?(?=\[\[customer_conversion_goal\]\])/, "");
    expect(() => parseConfig(withoutActions)).toThrow(/no \[\[conversion_action\]\]/);
  });

  it("throws when no [[campaign]] is declared", () => {
    const withoutCampaign = VALID_TOML.replace(/\[\[campaign\]\][\s\S]*?(?=\[reserve_floor\])/, "");
    expect(() => parseConfig(withoutCampaign)).toThrow(/no \[\[campaign\]\]/);
  });

  it("accepts more than one [[campaign]]", () => {
    const config = parseConfig(SEARCH_CAMPAIGN_TOML);
    expect(config.campaigns.map((campaign) => campaign.name)).toEqual(["Campaign #1", "Search #1"]);
  });

  it("throws when [reserve_floor].ssm_parameter is missing", () => {
    expect(() => parseConfig(VALID_TOML.replace(/\[reserve_floor\][\s\S]*/, ""))).toThrow(/reserve_floor/);
  });

  it("throws when a campaign's type is neither PERFORMANCE_MAX nor SEARCH", () => {
    const bad = VALID_TOML.replace('type = "PERFORMANCE_MAX"', 'type = "DISPLAY"');
    expect(() => parseConfig(bad)).toThrow(/must be "PERFORMANCE_MAX" or "SEARCH"/);
  });

  it("throws when a campaign has no [campaign.bidding]", () => {
    const bad = VALID_TOML.replace('[campaign.bidding]\nstrategy = "maximize_conversions"\n\n', "");
    expect(() => parseConfig(bad)).toThrow(/has no \[campaign\.bidding\]/);
  });
});

describe("ads-sync parseConfig bidding", () => {
  function withBidding(biddingToml) {
    return VALID_TOML.replace('[campaign.bidding]\nstrategy = "maximize_conversions"\n', biddingToml);
  }

  it("parses manual_cpc's enhanced_cpc", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "manual_cpc"\nenhanced_cpc = true\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "manual_cpc", enhancedCpc: true });
  });

  it("throws when manual_cpc has no enhanced_cpc", () => {
    expect(() => parseConfig(withBidding('[campaign.bidding]\nstrategy = "manual_cpc"\n'))).toThrow(/manual_cpc.*needs enhanced_cpc/);
  });

  it("parses maximize_clicks with no ceiling", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "maximize_clicks"\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "maximize_clicks" });
  });

  it("converts maximize_clicks's optional cpc_bid_ceiling_gbp to micros", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "maximize_clicks"\ncpc_bid_ceiling_gbp = 2.50\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "maximize_clicks", cpcBidCeilingMicros: "2500000" });
  });

  it("converts maximize_conversions's optional target_cpa_gbp to micros", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "maximize_conversions"\ntarget_cpa_gbp = 10\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "maximize_conversions", targetCpaMicros: "10000000" });
  });

  it("parses maximize_conversion_value's optional target_roas", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "maximize_conversion_value"\ntarget_roas = 3.5\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "maximize_conversion_value", targetRoas: 3.5 });
  });

  it("requires target_cpa_gbp for the target_cpa strategy", () => {
    expect(() => parseConfig(withBidding('[campaign.bidding]\nstrategy = "target_cpa"\n'))).toThrow(/target_cpa.*needs target_cpa_gbp/);
  });

  it("converts target_cpa's target_cpa_gbp to micros", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "target_cpa"\ntarget_cpa_gbp = 8\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "target_cpa", targetCpaMicros: "8000000" });
  });

  it("requires target_roas for the target_roas strategy", () => {
    expect(() => parseConfig(withBidding('[campaign.bidding]\nstrategy = "target_roas"\n'))).toThrow(/target_roas.*needs target_roas/);
  });

  it("parses the target_roas strategy's target_roas", () => {
    const config = parseConfig(withBidding('[campaign.bidding]\nstrategy = "target_roas"\ntarget_roas = 4\n'));
    expect(config.campaigns[0].bidding).toEqual({ strategy: "target_roas", targetRoas: 4 });
  });

  it("requires location and fraction for target_impression_share", () => {
    expect(() => parseConfig(withBidding('[campaign.bidding]\nstrategy = "target_impression_share"\n'))).toThrow(
      /target_impression_share.*needs location and fraction/,
    );
  });

  it("converts target_impression_share's fraction and optional ceiling to micros", () => {
    const config = parseConfig(
      withBidding(
        '[campaign.bidding]\nstrategy = "target_impression_share"\nlocation = "TOP_OF_PAGE"\nfraction = 0.65\ncpc_bid_ceiling_gbp = 1.20\n',
      ),
    );
    expect(config.campaigns[0].bidding).toEqual({
      strategy: "target_impression_share",
      location: "TOP_OF_PAGE",
      locationFractionMicros: "650000",
      cpcBidCeilingMicros: "1200000",
    });
  });

  it("requires bidding_strategy for the portfolio strategy", () => {
    expect(() => parseConfig(withBidding('[campaign.bidding]\nstrategy = "portfolio"\n'))).toThrow(/portfolio.*needs bidding_strategy/);
  });

  it("parses a portfolio strategy's bidding_strategy resource name", () => {
    const config = parseConfig(
      withBidding('[campaign.bidding]\nstrategy = "portfolio"\nbidding_strategy = "customers/8142685080/biddingStrategies/9"\n'),
    );
    expect(config.campaigns[0].bidding).toEqual({ strategy: "portfolio", biddingStrategy: "customers/8142685080/biddingStrategies/9" });
  });

  it("throws on an unknown strategy", () => {
    expect(() => parseConfig(withBidding('[campaign.bidding]\nstrategy = "auto_bid"\n'))).toThrow(/unknown strategy "auto_bid"/);
  });
});

describe("ads-sync parseConfig SEARCH campaigns", () => {
  it("parses a SEARCH campaign's budget, ad groups, keywords and ad", () => {
    const config = parseConfig(SEARCH_CAMPAIGN_TOML);
    const search = config.campaigns[1];
    expect(search.type).toBe("SEARCH");
    expect(search.status).toBe("PAUSED");
    expect(search.budgetMicros).toBe("5000000");
    expect(search.bidding).toEqual({ strategy: "maximize_conversions", targetCpaMicros: "12500000" });
    expect(search.adGroups).toEqual([
      {
        name: "VAT software",
        keywords: [
          { text: "vat filing software", matchType: "EXACT" },
          { text: "hmrc mtd vat", matchType: "PHRASE" },
          { text: "submit vat return", matchType: "BROAD" },
        ],
        ad: {
          headlines: ["File VAT Returns Online", "HMRC MTD Compliant Software", "Free VAT Filing Tool"],
          descriptions: ["Submit VAT returns direct to HMRC.", "Free, simple, MTD compliant."],
          finalUrl: "https://submit.diyaccounting.co.uk/",
        },
      },
    ]);
  });

  it("defaults status to PAUSED when not declared", () => {
    const withoutStatus = SEARCH_CAMPAIGN_TOML.replace('status = "PAUSED"\n', "");
    const config = parseConfig(withoutStatus);
    expect(config.campaigns[1].status).toBe("PAUSED");
  });

  it("throws when budget_gbp is missing", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace("budget_gbp = 5.00\n", "");
    expect(() => parseConfig(bad)).toThrow(/is missing budget_gbp/);
  });

  it("throws when a SEARCH campaign has no [[campaign.ad_group]]", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace(/\[\[campaign\.ad_group\]\][\s\S]*/, "");
    expect(() => parseConfig(bad)).toThrow(/has no \[\[campaign\.ad_group\]\]/);
  });

  it("throws when an ad group has no keywords", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace(/\[\[campaign\.ad_group\.keyword\]\][\s\S]*?(?=\[campaign\.ad_group\.ad\])/, "");
    expect(() => parseConfig(bad)).toThrow(/has no \[\[campaign\.ad_group\.keyword\]\]/);
  });

  it("throws on an invalid keyword match_type", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace('match_type = "EXACT"', 'match_type = "FUZZY"');
    expect(() => parseConfig(bad)).toThrow(/must be one of EXACT, PHRASE, BROAD/);
  });

  it("throws when there are fewer than 3 headlines", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace(
      'headlines = ["File VAT Returns Online", "HMRC MTD Compliant Software", "Free VAT Filing Tool"]',
      'headlines = ["File VAT Returns Online", "HMRC MTD Compliant"]',
    );
    expect(() => parseConfig(bad)).toThrow(/needs 3-15 headlines, found 2/);
  });

  it("throws when there are more than 15 headlines", () => {
    const tooMany = Array.from({ length: 16 }, (_, i) => `"Headline ${i}"`).join(", ");
    const bad = SEARCH_CAMPAIGN_TOML.replace(
      'headlines = ["File VAT Returns Online", "HMRC MTD Compliant Software", "Free VAT Filing Tool"]',
      `headlines = [${tooMany}]`,
    );
    expect(() => parseConfig(bad)).toThrow(/needs 3-15 headlines, found 16/);
  });

  it("throws when a headline is longer than 30 characters", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace('"File VAT Returns Online"', '"This Headline Is Much Too Long To Fit"');
    expect(() => parseConfig(bad)).toThrow(/longer than 30 characters/);
  });

  it("throws when there is only 1 description", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace(
      'descriptions = ["Submit VAT returns direct to HMRC.", "Free, simple, MTD compliant."]',
      'descriptions = ["Submit VAT returns direct to HMRC."]',
    );
    expect(() => parseConfig(bad)).toThrow(/needs 2-4 descriptions, found 1/);
  });

  it("throws when there are more than 4 descriptions", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace(
      'descriptions = ["Submit VAT returns direct to HMRC.", "Free, simple, MTD compliant."]',
      'descriptions = ["One.", "Two.", "Three.", "Four.", "Five."]',
    );
    expect(() => parseConfig(bad)).toThrow(/needs 2-4 descriptions, found 5/);
  });

  it("throws when a description is longer than 90 characters", () => {
    const longDescription = "D".repeat(91);
    const bad = SEARCH_CAMPAIGN_TOML.replace('"Submit VAT returns direct to HMRC."', `"${longDescription}"`);
    expect(() => parseConfig(bad)).toThrow(/longer than 90 characters/);
  });

  it("throws when final_url is not the submit.diyaccounting.co.uk domain", () => {
    const bad = SEARCH_CAMPAIGN_TOML.replace('final_url = "https://submit.diyaccounting.co.uk/"', 'final_url = "https://example.com/"');
    expect(() => parseConfig(bad)).toThrow(/final_url must start with https:\/\/submit\.diyaccounting\.co\.uk\//);
  });
});

describe("ads-sync planAds", () => {
  it("plans nothing when the declared state already matches live", () => {
    expect(planAds(parseConfig(VALID_TOML), baseLive())).toEqual([]);
  });

  it("plans a campaign budget update when the live budget differs", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.campaigns[0].budgetAmountMicros = "2000000";

    const plan = planAds(config, live);

    expect(plan).toEqual([
      {
        kind: "update-campaign-budget",
        budgetResourceName: "customers/8142685080/campaignBudgets/1",
        wanted: "1000000",
        live: "2000000",
      },
    ]);
    expect(describeAction(plan[0])).toContain("2000000 micros");
    expect(describeAction(plan[0])).toContain("declared 1000000 micros");
  });

  it("plans a create when the upload conversion action is missing live", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.conversionActions = live.conversionActions.filter((action) => action.name !== "DIY Accounting (upload) purchase");

    const plan = planAds(config, live);

    expect(plan).toEqual([{ kind: "create-upload-conversion-action", name: "DIY Accounting (upload) purchase" }]);
    expect(describeAction(plan[0])).toBe(
      'conversion action "DIY Accounting (upload) purchase": UPLOAD_CLICKS, PURCHASE, one per click (would create)',
    );
  });

  it("builds the upload conversion action create body", () => {
    expect(uploadConversionActionCreateBody({ kind: "create-upload-conversion-action", name: "DIY Accounting (upload) purchase" })).toEqual(
      {
        name: "DIY Accounting (upload) purchase",
        type: "UPLOAD_CLICKS",
        category: "PURCHASE",
        countingType: "ONE_PER_CLICK",
        status: "ENABLED",
      },
    );
  });

  it("throws when [upload].conversion_action_name is missing", () => {
    expect(() => parseConfig(VALID_TOML.replace(/\[upload\][\s\S]*?(?=\[\[conversion_action\]\])/, ""))).toThrow(/upload/);
  });

  it("fails the run when a declared conversion action has no live match", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.conversionActions = live.conversionActions.filter((action) => action.name !== "DIY Accounting (web) submit_vat_return");

    expect(() => planAds(config, live)).toThrow(/DIY Accounting \(web\) submit_vat_return/);
    expect(() => planAds(config, live)).toThrow(/never the GA4 conversion actions/);
  });

  it("ignores a live conversion action ads.toml does not declare", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.conversionActions.push({
      resourceName: "customers/8142685080/conversionActions/9",
      name: "Sign-up",
      type: "WEBPAGE_CODELESS",
      category: "SIGNUP",
      status: "ENABLED",
      primaryForGoal: false,
    });

    expect(planAds(config, live)).toEqual([]);
  });

  it("plans an auto-tagging update when live differs", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.customer.autoTaggingEnabled = false;

    const plan = planAds(config, live);

    expect(plan).toEqual([{ kind: "update-auto-tagging", wanted: true, live: false }]);
  });

  it("reports a conversion action's category or primary flag drift without failing the run", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.conversionActions[1].primaryForGoal = false;

    const plan = planAds(config, live);

    expect(plan).toEqual([
      {
        kind: "conversion-action-drift",
        name: "DIY Accounting (web) submit_vat_return",
        fields: ["primaryForGoal"],
        wanted: { category: "SIGNUP", primaryForGoal: true },
        live: { category: "SIGNUP", primaryForGoal: false },
      },
    ]);
    expect(describeAction(plan[0])).toContain("report only, not applied");
  });

  it("plans a conversion goal biddable update when live differs", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.conversionGoals[1].biddable = false;

    const plan = planAds(config, live);

    expect(plan).toEqual([{ kind: "update-conversion-goal", category: "SIGNUP", origin: "WEBSITE", wanted: true, live: false }]);
  });

  it("fails the run when a declared Performance Max campaign has no live match", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.campaigns = [];

    expect(() => planAds(config, live)).toThrow(/Campaign #1/);
  });
});

describe("ads-sync planAds bidding", () => {
  it("plans a bidding update when the live strategy differs", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.campaigns[0].bidding = { strategy: "manual_cpc", enhancedCpc: false };

    const plan = planAds(config, live);

    expect(plan).toEqual([
      {
        kind: "update-campaign-bidding",
        resourceName: "customers/8142685080/campaigns/1",
        wanted: { strategy: "maximize_conversions" },
        live: { strategy: "manual_cpc", enhancedCpc: false },
      },
    ]);
    expect(describeAction(plan[0])).toContain("would update");
  });

  it("plans a bidding update when a declared field differs from live", () => {
    const config = parseConfig(
      VALID_TOML.replace('strategy = "maximize_conversions"\n', 'strategy = "maximize_conversions"\ntarget_cpa_gbp = 10\n'),
    );
    const live = baseLive();
    live.campaigns[0].bidding = { strategy: "maximize_conversions", targetCpaMicros: "5000000" };

    const plan = planAds(config, live);

    expect(plan).toEqual([
      {
        kind: "update-campaign-bidding",
        resourceName: "customers/8142685080/campaigns/1",
        wanted: { strategy: "maximize_conversions", targetCpaMicros: "10000000" },
        live: { strategy: "maximize_conversions", targetCpaMicros: "5000000" },
      },
    ]);
  });

  it("plans nothing when an undeclared optional field differs live", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.campaigns[0].bidding = { strategy: "maximize_conversions", targetCpaMicros: "5000000" };

    expect(planAds(config, live)).toEqual([]);
  });

  it("refuses a strategy Performance Max cannot take, without applying it or blocking other diffs", () => {
    const config = parseConfig(VALID_TOML.replace('strategy = "maximize_conversions"', 'strategy = "manual_cpc"\nenhanced_cpc = true'));
    const live = baseLive();
    live.campaigns[0].status = "PAUSED";

    const plan = planAds(config, live);

    expect(plan).toEqual([
      {
        kind: "update-campaign-status",
        resourceName: "customers/8142685080/campaigns/1",
        wanted: "ENABLED",
        live: "PAUSED",
      },
      {
        kind: "refuse-bidding-strategy",
        campaignName: "Campaign #1",
        strategy: "manual_cpc",
        reason: "campaign type PERFORMANCE_MAX accepts only maximize_conversions, maximize_conversion_value",
      },
    ]);
    expect(describeAction(plan[1])).toContain("refused");
    expect(describeAction(plan[1])).toContain("not applied");
  });
});

describe("ads-sync planAds SEARCH campaign creation", () => {
  it("plans budget, campaign, ad group, keyword and ad creates when the SEARCH campaign has no live match", () => {
    const config = parseConfig(SEARCH_CAMPAIGN_TOML);

    const plan = planAds(config, baseLive());

    expect(plan).toEqual([
      { kind: "create-campaign-budget", campaignName: "Search #1", amountMicros: "5000000" },
      {
        kind: "create-campaign",
        campaignName: "Search #1",
        status: "PAUSED",
        budgetMicros: "5000000",
        bidding: { strategy: "maximize_conversions", targetCpaMicros: "12500000" },
        geoTargetType: "PRESENCE",
        network: { googleSearch: true, searchNetwork: false, contentNetwork: false },
        containsEuPoliticalAdvertising: false,
      },
      { kind: "create-campaign-locations", campaignName: "Search #1", locations: ["GB"] },
      { kind: "create-ad-group", campaignName: "Search #1", adGroupName: "VAT software" },
      {
        kind: "create-ad-group-keywords",
        campaignName: "Search #1",
        adGroupName: "VAT software",
        keywords: [
          { text: "vat filing software", matchType: "EXACT" },
          { text: "hmrc mtd vat", matchType: "PHRASE" },
          { text: "submit vat return", matchType: "BROAD" },
        ],
      },
      {
        kind: "create-ad-group-ad",
        campaignName: "Search #1",
        adGroupName: "VAT software",
        ad: {
          headlines: ["File VAT Returns Online", "HMRC MTD Compliant Software", "Free VAT Filing Tool"],
          descriptions: ["Submit VAT returns direct to HMRC.", "Free, simple, MTD compliant."],
          finalUrl: "https://submit.diyaccounting.co.uk/",
        },
      },
    ]);
    for (const action of plan) expect(describeAction(action)).toContain("would create");
  });

  it("does not refuse a Search campaign's bidding strategy on creation", () => {
    const config = parseConfig(SEARCH_CAMPAIGN_TOML);

    const plan = planAds(config, baseLive());

    expect(plan.some((action) => action.kind === "refuse-bidding-strategy")).toBe(false);
  });

  it("still fails the run when the Performance Max campaign is also missing", () => {
    const config = parseConfig(SEARCH_CAMPAIGN_TOML);
    const live = baseLive();
    live.campaigns = [];

    expect(() => planAds(config, live)).toThrow(/Campaign #1/);
  });
});

describe("ads-sync Search campaign targeting", () => {
  const liveSearchCampaign = (targeting) => ({
    resourceName: "customers/8142685080/campaigns/2",
    name: "Search #1",
    status: "PAUSED",
    advertisingChannelType: "SEARCH",
    budgetResourceName: "customers/8142685080/campaignBudgets/2",
    budgetAmountMicros: "5000000",
    bidding: { strategy: "maximize_conversions", targetCpaMicros: "12500000" },
    targeting,
    adGroups: [
      {
        resourceName: "customers/8142685080/adGroups/20",
        name: "VAT software",
        status: "ENABLED",
        keywords: [
          { resourceName: "customers/8142685080/adGroupCriteria/20~1", text: "vat filing software", matchType: "EXACT" },
          { resourceName: "customers/8142685080/adGroupCriteria/20~2", text: "hmrc mtd vat", matchType: "PHRASE" },
          { resourceName: "customers/8142685080/adGroupCriteria/20~3", text: "submit vat return", matchType: "BROAD" },
        ],
      },
    ],
    negativeKeywords: [],
  });
  const matchingTargeting = () => ({
    locations: ["geoTargetConstants/2826"],
    geoTargetType: "PRESENCE",
    network: { googleSearch: true, searchNetwork: false, contentNetwork: false },
    containsEuPoliticalAdvertising: false,
  });

  it("parses locations, geo target type, network settings and the EU political advertising declaration", () => {
    const search = parseConfig(SEARCH_CAMPAIGN_TOML).campaigns[1];
    expect(search.locations).toEqual(["GB"]);
    expect(search.geoTargetType).toBe("PRESENCE");
    expect(search.network).toEqual({ googleSearch: true, searchNetwork: false, contentNetwork: false });
    expect(search.containsEuPoliticalAdvertising).toBe(false);
  });

  it.each([
    ['locations = ["GB"]\n', /needs locations/],
    ['geo_target_type = "PRESENCE"\n', /needs geo_target_type/],
    ["contains_eu_political_advertising = false\n", /needs contains_eu_political_advertising/],
    ["search_network = false\n", /needs \[campaign.network\] search_network/],
    ["content_network = false\n", /needs \[campaign.network\] content_network/],
    ["google_search = true\n", /needs \[campaign.network\] google_search/],
  ])("throws when %s is not declared", (line, message) => {
    expect(() => parseConfig(SEARCH_CAMPAIGN_TOML.replace(line, ""))).toThrow(message);
  });

  it("throws on a country code with no known geo target constant", () => {
    expect(() => parseConfig(SEARCH_CAMPAIGN_TOML.replace('["GB"]', '["ZZ"]'))).toThrow(/location "ZZ"/);
  });

  it("builds the campaign create body with geo target type, network settings and the EU political advertising status", () => {
    const [, campaignAction] = planAds(parseConfig(SEARCH_CAMPAIGN_TOML), baseLive());
    expect(campaignCreateBody(campaignAction, "customers/8142685080/campaignBudgets/9")).toEqual({
      name: "Search #1",
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
      campaignBudget: "customers/8142685080/campaignBudgets/9",
      geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      maximizeConversions: { targetCpaMicros: "12500000" },
    });
  });

  it("sends CONTAINS_EU_POLITICAL_ADVERTISING when declared true", () => {
    const [, campaignAction] = planAds(
      parseConfig(SEARCH_CAMPAIGN_TOML.replace("contains_eu_political_advertising = false", "contains_eu_political_advertising = true")),
      baseLive(),
    );
    expect(campaignCreateBody(campaignAction, "b").containsEuPoliticalAdvertising).toBe("CONTAINS_EU_POLITICAL_ADVERTISING");
  });

  it("builds one location criterion per declared country against the created campaign", () => {
    const action = { kind: "create-campaign-locations", campaignName: "Search #1", locations: ["GB"] };
    expect(locationCriteriaOperations(action, "customers/8142685080/campaigns/7")).toEqual([
      { create: { campaign: "customers/8142685080/campaigns/7", location: { geoTargetConstant: "geoTargetConstants/2826" } } },
    ]);
  });

  it("describes the creation of each targeting field", () => {
    const plan = planAds(parseConfig(SEARCH_CAMPAIGN_TOML), baseLive());
    const text = plan.map(describeAction).join("\n");
    expect(text).toContain("geo target type PRESENCE");
    expect(text).toContain('network {"googleSearch":true,"searchNetwork":false,"contentNetwork":false}');
    expect(text).toContain("EU political advertising false");
    expect(text).toContain("locations GB (geoTargetConstants/2826)");
  });

  it("plans nothing for a live Search campaign whose targeting matches", () => {
    const live = baseLive();
    live.campaigns.push(liveSearchCampaign(matchingTargeting()));
    expect(planAds(parseConfig(SEARCH_CAMPAIGN_TOML), live)).toEqual([]);
  });

  it("reports drift on locations and network settings of a live Search campaign", () => {
    const live = baseLive();
    live.campaigns.push(
      liveSearchCampaign({
        ...matchingTargeting(),
        locations: [],
        network: { googleSearch: true, searchNetwork: true, contentNetwork: true },
      }),
    );
    const plan = planAds(parseConfig(SEARCH_CAMPAIGN_TOML), live);
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe("campaign-targeting-drift");
    expect(plan[0].fields).toEqual(["locations", "network"]);
    expect(describeAction(plan[0])).toContain("report only, not applied");
  });

  it("reports every targeting field as drift when live carries no targeting", () => {
    const live = baseLive();
    live.campaigns.push(liveSearchCampaign(null));
    const [drift] = planAds(parseConfig(SEARCH_CAMPAIGN_TOML), live);
    expect(drift.fields).toEqual(["locations", "geoTargetType", "network", "containsEuPoliticalAdvertising"]);
  });

  it("shapes targeting from the campaign and location criterion responses, skipping negative locations", () => {
    const targeting = shapeCampaignTargeting(
      {
        results: [
          {
            campaign: {
              resourceName: "customers/1/campaigns/2",
              networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true },
              geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE_OR_INTEREST" },
              containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            },
          },
        ],
      },
      {
        results: [
          {
            campaign: { resourceName: "customers/1/campaigns/2" },
            campaignCriterion: { negative: false, location: { geoTargetConstant: "geoTargetConstants/2826" } },
          },
          {
            campaign: { resourceName: "customers/1/campaigns/2" },
            campaignCriterion: { negative: true, location: { geoTargetConstant: "geoTargetConstants/2840" } },
          },
        ],
      },
    );
    expect(targeting.get("customers/1/campaigns/2")).toEqual({
      network: { googleSearch: true, searchNetwork: true, contentNetwork: false },
      geoTargetType: "PRESENCE_OR_INTEREST",
      containsEuPoliticalAdvertising: false,
      locations: ["geoTargetConstants/2826"],
    });
  });
});

describe("ads-sync shapeCampaignBidding", () => {
  it("shapes each strategy's fields from a googleAds:search response", () => {
    const body = {
      results: [
        {
          campaign: {
            resourceName: "customers/8142685080/campaigns/1",
            biddingStrategyType: "MAXIMIZE_CONVERSIONS",
            maximizeConversions: { targetCpaMicros: "10000000" },
          },
        },
        {
          campaign: {
            resourceName: "customers/8142685080/campaigns/2",
            biddingStrategy: "customers/8142685080/biddingStrategies/9",
            biddingStrategyType: "TARGET_CPA",
          },
        },
      ],
    };

    const byResourceName = shapeCampaignBidding(body);

    expect(byResourceName.get("customers/8142685080/campaigns/1")).toEqual({
      strategy: "maximize_conversions",
      targetCpaMicros: "10000000",
    });
    expect(byResourceName.get("customers/8142685080/campaigns/2")).toEqual({
      strategy: "portfolio",
      biddingStrategy: "customers/8142685080/biddingStrategies/9",
    });
  });

  it("shapes an unrecognised bidding strategy type to a null strategy", () => {
    const body = { results: [{ campaign: { resourceName: "customers/8142685080/campaigns/3", biddingStrategyType: "COMMISSION" } }] };

    expect(shapeCampaignBidding(body).get("customers/8142685080/campaigns/3")).toEqual({ strategy: null });
  });
});

const NEGATIVE_KEYWORDS_TOML = `${SEARCH_CAMPAIGN_TOML}
[campaign.negative_keywords]
phrase = ["login", "Jobs"]
exact = ["vat online account"]
`;

describe("ads-sync negative keywords", () => {
  const CAMPAIGN = "customers/8142685080/campaigns/2";
  const liveCampaign = (overrides) => ({
    resourceName: CAMPAIGN,
    name: "Search #1",
    status: "PAUSED",
    advertisingChannelType: "SEARCH",
    budgetResourceName: "customers/8142685080/campaignBudgets/2",
    budgetAmountMicros: "5000000",
    bidding: { strategy: "maximize_conversions", targetCpaMicros: "12500000" },
    targeting: {
      locations: ["geoTargetConstants/2826"],
      geoTargetType: "PRESENCE",
      network: { googleSearch: true, searchNetwork: false, contentNetwork: false },
      containsEuPoliticalAdvertising: false,
    },
    adGroups: [
      {
        resourceName: "customers/8142685080/adGroups/20",
        name: "VAT software",
        status: "ENABLED",
        keywords: [
          { resourceName: "customers/8142685080/adGroupCriteria/20~1", text: "vat filing software", matchType: "EXACT" },
          { resourceName: "customers/8142685080/adGroupCriteria/20~2", text: "hmrc mtd vat", matchType: "PHRASE" },
          { resourceName: "customers/8142685080/adGroupCriteria/20~3", text: "submit vat return", matchType: "BROAD" },
        ],
      },
    ],
    negativeKeywords: [],
    ...overrides,
  });
  const liveWith = (campaign) => {
    const live = baseLive();
    live.campaigns.push(campaign);
    return live;
  };

  it("parses negative keywords per match type, upper-casing the match type and trimming the text", () => {
    const [, search] = parseConfig(NEGATIVE_KEYWORDS_TOML).campaigns;
    expect(search.negativeKeywords).toEqual([
      { text: "login", matchType: "PHRASE" },
      { text: "Jobs", matchType: "PHRASE" },
      { text: "vat online account", matchType: "EXACT" },
    ]);
  });

  it("declares no negative keywords when the table is absent", () => {
    const [, search] = parseConfig(SEARCH_CAMPAIGN_TOML).campaigns;
    expect(search.negativeKeywords).toEqual([]);
  });

  it("throws on an unknown negative keyword match type", () => {
    expect(() => parseConfig(`${SEARCH_CAMPAIGN_TOML}\n[campaign.negative_keywords]\nfuzzy = ["x"]\n`)).toThrow(/match type "fuzzy"/);
  });

  it("throws on a negative keyword declared twice, ignoring case", () => {
    expect(() => parseConfig(`${SEARCH_CAMPAIGN_TOML}\n[campaign.negative_keywords]\nphrase = ["Jobs", "jobs"]\n`)).toThrow(
      /more than once/,
    );
  });

  it("throws on a keyword declared twice in one ad group", () => {
    const duplicated = SEARCH_CAMPAIGN_TOML.replace(
      'text = "hmrc mtd vat"\nmatch_type = "PHRASE"',
      'text = "vat filing software"\nmatch_type = "EXACT"',
    );
    expect(() => parseConfig(duplicated)).toThrow(/more than once/);
  });

  it("plans one add action with every declared negative when the live campaign has none", () => {
    const plan = planAds(parseConfig(NEGATIVE_KEYWORDS_TOML), liveWith(liveCampaign()));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ kind: "add-campaign-negative-keywords", campaignResourceName: CAMPAIGN });
    expect(plan[0].keywords).toHaveLength(3);
    expect(describeAction(plan[0])).toContain('EXACT "vat online account"');
    expect(describeAction(plan[0])).toContain("(would create)");
  });

  it("plans nothing when the live negatives match, ignoring case", () => {
    const negativeKeywords = [
      { resourceName: `${CAMPAIGN}~1`, text: "login", matchType: "PHRASE" },
      { resourceName: `${CAMPAIGN}~2`, text: "jobs", matchType: "PHRASE" },
      { resourceName: `${CAMPAIGN}~3`, text: "vat online account", matchType: "EXACT" },
    ];
    expect(planAds(parseConfig(NEGATIVE_KEYWORDS_TOML), liveWith(liveCampaign({ negativeKeywords })))).toEqual([]);
  });

  it("adds a missing negative and removes an undeclared one, treating a changed match type as both", () => {
    const negativeKeywords = [
      { resourceName: `${CAMPAIGN}~1`, text: "login", matchType: "EXACT" },
      { resourceName: `${CAMPAIGN}~2`, text: "jobs", matchType: "PHRASE" },
      { resourceName: `${CAMPAIGN}~3`, text: "vat online account", matchType: "EXACT" },
      { resourceName: `${CAMPAIGN}~4`, text: "salary", matchType: "PHRASE" },
    ];
    const plan = planAds(parseConfig(NEGATIVE_KEYWORDS_TOML), liveWith(liveCampaign({ negativeKeywords })));
    const added = plan.find((action) => action.kind === "add-campaign-negative-keywords");
    const removed = plan.find((action) => action.kind === "remove-campaign-negative-keywords");
    expect(added.keywords).toEqual([{ text: "login", matchType: "PHRASE" }]);
    expect(removed.keywords.map((keyword) => keyword.resourceName)).toEqual([`${CAMPAIGN}~1`, `${CAMPAIGN}~4`]);
    expect(describeAction(removed)).toContain("(would remove)");
  });

  it("removes every live negative when the campaign declares none", () => {
    const negativeKeywords = [{ resourceName: `${CAMPAIGN}~1`, text: "login", matchType: "PHRASE" }];
    const plan = planAds(parseConfig(SEARCH_CAMPAIGN_TOML), liveWith(liveCampaign({ negativeKeywords })));
    expect(plan.map((action) => action.kind)).toEqual(["remove-campaign-negative-keywords"]);
  });

  it("plans the negatives after the locations when the campaign is created", () => {
    const plan = planAds(parseConfig(NEGATIVE_KEYWORDS_TOML), baseLive());
    const kinds = plan.map((action) => action.kind);
    expect(kinds.indexOf("add-campaign-negative-keywords")).toBe(kinds.indexOf("create-campaign-locations") + 1);
    expect(plan.find((action) => action.kind === "add-campaign-negative-keywords").campaignResourceName).toBeUndefined();
  });

  it("builds campaign-level negative criteria against the campaign", () => {
    expect(negativeKeywordOperations([{ text: "login", matchType: "PHRASE" }], CAMPAIGN)).toEqual([
      { create: { campaign: CAMPAIGN, negative: true, keyword: { text: "login", matchType: "PHRASE" } } },
    ]);
  });
});

describe("ads-sync ad groups on a live Search campaign", () => {
  const CAMPAIGN = "customers/8142685080/campaigns/2";
  const liveAdGroup = (name, status, keywords = []) => ({
    resourceName: `customers/8142685080/adGroups/${name}`,
    name,
    status,
    keywords,
  });
  const liveCampaign = (adGroups) => ({
    resourceName: CAMPAIGN,
    name: "Search #1",
    status: "PAUSED",
    advertisingChannelType: "SEARCH",
    budgetResourceName: "customers/8142685080/campaignBudgets/2",
    budgetAmountMicros: "5000000",
    bidding: { strategy: "maximize_conversions", targetCpaMicros: "12500000" },
    targeting: {
      locations: ["geoTargetConstants/2826"],
      geoTargetType: "PRESENCE",
      network: { googleSearch: true, searchNetwork: false, contentNetwork: false },
      containsEuPoliticalAdvertising: false,
    },
    adGroups,
    negativeKeywords: [],
  });
  const plan = (adGroups) => {
    const live = baseLive();
    live.campaigns.push(liveCampaign(adGroups));
    return planAds(parseConfig(SEARCH_CAMPAIGN_TOML), live);
  };
  const declaredKeywords = [
    { resourceName: "k1", text: "vat filing software", matchType: "EXACT" },
    { resourceName: "k2", text: "hmrc mtd vat", matchType: "PHRASE" },
    { resourceName: "k3", text: "submit vat return", matchType: "BROAD" },
  ];

  it("creates a declared ad group the campaign lacks, with keywords and ad, and pauses an undeclared enabled one", () => {
    const actions = plan([liveAdGroup("Old group", "ENABLED", [{ resourceName: "k9", text: "old", matchType: "EXACT" }])]);
    expect(actions.map((action) => action.kind)).toEqual([
      "create-ad-group",
      "create-ad-group-keywords",
      "create-ad-group-ad",
      "update-ad-group-status",
    ]);
    expect(actions[0].campaignResourceName).toBe(CAMPAIGN);
    expect(actions[3]).toMatchObject({ adGroupName: "Old group", wanted: "PAUSED", live: "ENABLED" });
    expect(describeAction(actions[3])).toContain("(would pause)");
  });

  it("leaves an undeclared ad group that is already paused alone", () => {
    const actions = plan([liveAdGroup("VAT software", "ENABLED", declaredKeywords), liveAdGroup("Old group", "PAUSED")]);
    expect(actions).toEqual([]);
  });

  it("adds missing keywords and removes undeclared ones in a declared ad group", () => {
    const actions = plan([
      liveAdGroup("VAT software", "ENABLED", [
        declaredKeywords[0],
        { resourceName: "k2", text: "hmrc mtd vat", matchType: "EXACT" },
        { resourceName: "k9", text: "old", matchType: "PHRASE" },
      ]),
    ]);
    const added = actions.find((action) => action.kind === "create-ad-group-keywords");
    const removed = actions.find((action) => action.kind === "remove-ad-group-keywords");
    expect(added.adGroupResourceName).toBe("customers/8142685080/adGroups/VAT software");
    expect(added.keywords).toEqual([
      { text: "hmrc mtd vat", matchType: "PHRASE" },
      { text: "submit vat return", matchType: "BROAD" },
    ]);
    expect(removed.keywords.map((keyword) => keyword.resourceName)).toEqual(["k2", "k9"]);
  });

  it("re-enables a declared ad group that is paused live", () => {
    const [action] = plan([liveAdGroup("VAT software", "PAUSED", declaredKeywords)]);
    expect(action).toMatchObject({ kind: "update-ad-group-status", wanted: "ENABLED", live: "PAUSED" });
  });

  it("shapes ad groups, their keywords and the campaign negatives from search responses", () => {
    const shaped = shapeCampaignKeywords(
      {
        results: [
          { campaign: { resourceName: CAMPAIGN }, adGroup: { resourceName: "customers/1/adGroups/5", name: "G", status: "ENABLED" } },
        ],
      },
      {
        results: [
          {
            adGroup: { resourceName: "customers/1/adGroups/5" },
            adGroupCriterion: { resourceName: "customers/1/adGroupCriteria/5~1", keyword: { text: "a b", matchType: "PHRASE" } },
          },
        ],
      },
      {
        results: [
          {
            campaign: { resourceName: CAMPAIGN },
            campaignCriterion: { resourceName: `${CAMPAIGN}~9`, keyword: { text: "jobs", matchType: "PHRASE" } },
          },
        ],
      },
    );
    expect(shaped.get(CAMPAIGN)).toEqual({
      adGroups: [
        {
          resourceName: "customers/1/adGroups/5",
          name: "G",
          status: "ENABLED",
          keywords: [{ resourceName: "customers/1/adGroupCriteria/5~1", text: "a b", matchType: "PHRASE" }],
        },
      ],
      negativeKeywords: [{ resourceName: `${CAMPAIGN}~9`, text: "jobs", matchType: "PHRASE" }],
    });
  });
});

describe("infra/google/ads/ads.toml", () => {
  const config = parseConfig(fs.readFileSync(path.join(process.cwd(), "infra/google/ads/ads.toml"), "utf-8"));
  const search = config.campaigns.find((campaign) => campaign.name === "Search: MTD VAT");
  const words = (text) => text.toLowerCase().split(/\s+/);
  const containsPhrase = (haystack, needle) => {
    const hay = words(haystack);
    const need = words(needle);
    return hay.some((_, start) => need.every((word, offset) => hay[start + offset] === word));
  };

  it("runs the search campaign at 1 pound a day with a 1 pound click ceiling", () => {
    expect(search.budgetMicros).toBe("1000000");
    expect(search.bidding).toEqual({ strategy: "maximize_clicks", cpcBidCeilingMicros: "1000000" });
  });

  it("declares six ad groups of phrase-match keywords, 34 in all, each with one ad", () => {
    expect(search.adGroups.map((adGroup) => adGroup.name)).toEqual([
      "Own brand",
      "Bridging software",
      "MTD VAT software",
      "Submit VAT return",
      "Free MTD VAT",
      "Spreadsheet and Excel",
    ]);
    const keywords = search.adGroups.flatMap((adGroup) => adGroup.keywords);
    expect(keywords).toHaveLength(34);
    expect(keywords.every((keyword) => keyword.matchType === "PHRASE")).toBe(true);
    expect(new Set(keywords.map((keyword) => keyword.text)).size).toBe(34);
  });

  it("carries negatives that block none of its own keywords", () => {
    expect(search.negativeKeywords.length).toBeGreaterThan(100);
    const keywords = search.adGroups.flatMap((adGroup) => adGroup.keywords.map((keyword) => keyword.text));
    const blocked = [];
    for (const negative of search.negativeKeywords) {
      for (const keyword of keywords) {
        const hit =
          negative.matchType === "EXACT" ? keyword.toLowerCase() === negative.text.toLowerCase() : containsPhrase(keyword, negative.text);
        if (hit) blocked.push(`${negative.text} blocks ${keyword}`);
      }
    }
    expect(blocked).toEqual([]);
  });
});
