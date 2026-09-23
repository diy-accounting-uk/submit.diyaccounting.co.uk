// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { parseArgs, parseConfig, planAds, describe as describeAction, shapeCampaignBidding } from "../../../infra/google/ads/ads-sync.js";

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

  it("fails the run when a declared conversion action has no live match", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.conversionActions = live.conversionActions.filter((action) => action.name !== "DIY Accounting (web) submit_vat_return");

    expect(() => planAds(config, live)).toThrow(/DIY Accounting \(web\) submit_vat_return/);
    expect(() => planAds(config, live)).toThrow(/never creates/);
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
      },
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
