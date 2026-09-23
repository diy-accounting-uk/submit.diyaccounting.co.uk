// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { parseArgs, parseConfig, planAds, describe as describeAction } from "../../../infra/google/ads/ads-sync.js";

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

[[campaign.asset_group]]
name = "Asset Group 1"

[reserve_floor]
ssm_parameter = "/submit/prod/ads/reserve-floor-gbp"
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
    expect(config.campaign).toEqual({
      name: "Campaign #1",
      type: "PERFORMANCE_MAX",
      status: "ENABLED",
      budgetMicros: "1000000",
      assetGroups: [{ name: "Asset Group 1" }],
    });
    expect(config.reserveFloorSsmParameter).toBe("/submit/prod/ads/reserve-floor-gbp");
  });

  it("throws when [account].auto_tagging is missing", () => {
    expect(() => parseConfig(VALID_TOML.replace("auto_tagging = true\n", ""))).toThrow(/auto_tagging/);
  });

  it("throws when no [[conversion_action]] is declared", () => {
    const withoutActions = VALID_TOML.replace(/\[\[conversion_action\]\][\s\S]*?(?=\[\[customer_conversion_goal\]\])/, "");
    expect(() => parseConfig(withoutActions)).toThrow(/no \[\[conversion_action\]\]/);
  });

  it("throws when more than one [[campaign]] is declared", () => {
    const twoCampaigns = `${VALID_TOML}\n[[campaign]]\nname = "Campaign #2"\ntype = "PERFORMANCE_MAX"\nstatus = "ENABLED"\nbudget_micros = 1\n`;
    expect(() => parseConfig(twoCampaigns)).toThrow(/exactly one \[\[campaign\]\]/);
  });

  it("throws when [reserve_floor].ssm_parameter is missing", () => {
    expect(() => parseConfig(VALID_TOML.replace(/\[reserve_floor\][\s\S]*/, ""))).toThrow(/reserve_floor/);
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

  it("fails the run when the declared campaign has no live match", () => {
    const config = parseConfig(VALID_TOML);
    const live = baseLive();
    live.campaigns = [];

    expect(() => planAds(config, live)).toThrow(/Campaign #1/);
  });
});
