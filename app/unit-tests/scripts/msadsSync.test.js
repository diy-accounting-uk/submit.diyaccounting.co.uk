// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import TOML from "@iarna/toml";
import {
  parseDesired,
  planChanges,
  formatPlan,
  applyPlan,
  exportToToml,
  buildCampaignBody,
  buildAdBody,
  buildGoalBody,
  buildLocationCriteria,
  buildNegativeKeywordBodies,
  shapeGoal,
  LOCATION_IDS,
} from "../../../infra/microsoft/ads/msads-sync.js";

const adsToml = fs.readFileSync("infra/microsoft/ads/ads.toml", "utf8");
const googleToml = TOML.parse(fs.readFileSync("infra/google/ads/ads.toml", "utf8"));
const desired = parseDesired(adsToml);
const campaign = desired.campaigns[0];

const emptyLive = {
  account: { id: "188495572", name: "DIY Accounting Limited", timeStamp: "AAA=" },
  msclkidAutoTagging: false,
  uetTags: [],
  goals: [],
  campaigns: [],
};

function liveCampaignMatching(c) {
  return {
    id: "900",
    name: c.name,
    status: c.status,
    type: "Search",
    dailyBudget: c.dailyBudget,
    languages: c.languages,
    finalUrlSuffix: c.finalUrlSuffix,
    biddingScheme: { Type: "EnhancedCpc" },
    criteria: [
      { type: "LocationCriterion", negative: false, detail: { LocationId: String(LOCATION_IDS.GB) } },
      { type: "LocationIntentCriterion", negative: false, detail: { IntentOption: c.locationIntent } },
    ],
    negativeKeywords: c.negativeKeywords,
    adGroups: c.adGroups.map((g, i) => ({
      id: String(1000 + i),
      name: g.name,
      status: "Active",
      cpcBid: g.cpcBid,
      keywords: g.keywords.map((k) => ({ ...k })),
      ads: [
        {
          id: String(2000 + i),
          type: "ResponsiveSearch",
          headlines: g.ad.headlines,
          descriptions: g.ad.descriptions,
          finalUrls: [g.ad.finalUrl],
        },
      ],
    })),
  };
}

const matchingLive = () => ({
  account: { ...emptyLive.account },
  msclkidAutoTagging: true,
  uetTags: [{ id: "55", name: desired.uet.name }],
  goals: desired.goals.map((g) => ({
    id: g.name,
    name: g.name,
    type: g.type,
    category: g.category,
    status: "Active",
    countType: g.countType,
    windowMinutes: g.windowMinutes,
    event: g.event,
  })),
  campaigns: [liveCampaignMatching(campaign)],
});

describe("ads.toml", () => {
  it("mirrors the Google Search campaign's ad groups, keywords, negatives and ad copy", () => {
    const google = googleToml.campaign.find((c) => c.name === "Search: MTD VAT");
    expect(campaign.name).toBe(google.name);
    expect(campaign.adGroups.map((g) => g.name)).toEqual(google.ad_group.map((g) => g.name));
    for (const [i, g] of google.ad_group.entries()) {
      expect(campaign.adGroups[i].keywords.map((k) => k.text)).toEqual(g.keyword.map((k) => k.text));
      expect(campaign.adGroups[i].ad.headlines).toEqual(g.ad.headlines);
      expect(campaign.adGroups[i].ad.descriptions).toEqual(g.ad.descriptions);
    }
    expect(campaign.negativeKeywords.filter((n) => n.matchType === "Phrase").map((n) => n.text)).toEqual(google.negative_keywords.phrase);
    expect(campaign.negativeKeywords.filter((n) => n.matchType === "Exact").map((n) => n.text)).toEqual(google.negative_keywords.exact);
  });

  it("keeps the bid at or under the Google ceiling, the budget at one pound and the campaign not political", () => {
    const google = googleToml.campaign.find((c) => c.name === "Search: MTD VAT");
    const toml = TOML.parse(adsToml).campaign[0];
    expect(toml.bidding.cpc_bid_ceiling_gbp).toBe(google.bidding.cpc_bid_ceiling_gbp);
    expect(campaign.adGroups.every((g) => g.cpcBid <= google.bidding.cpc_bid_ceiling_gbp)).toBe(true);
    expect(campaign.dailyBudget).toBe(1);
    expect(campaign.isPolitical).toBe(false);
    expect(campaign.status).toBe("Active");
    expect(campaign.finalUrlSuffix).toMatch(/^utm_source=bing&utm_medium=cpc&utm_campaign=/);
  });

  it("declares an event goal for each Google conversion action and an offline goal for the upload", () => {
    const events = desired.goals.filter((g) => g.type === "Event").map((g) => g.event);
    expect(events).toEqual(googleToml.conversion_action.map((a) => a.ga4_event));
    expect(desired.goals.find((g) => g.type === "OfflineConversion").name).toBe(desired.uploadGoalName);
  });

  it("refuses a headline over 30 characters and a political campaign", () => {
    expect(() => parseDesired(adsToml.replace('"DIY Accounting Submit",', '"A headline that is far too long to fit",'))).toThrow(
      /headline over 30/,
    );
    expect(() => parseDesired(adsToml.replace("is_political = false", "is_political = true"))).toThrow(/is_political must be false/);
  });
});

describe("request bodies", () => {
  it("builds the campaign with a daily budget, Enhanced CPC, the suffix and the political declaration", () => {
    expect(buildCampaignBody(campaign)).toEqual({
      Name: "Search: MTD VAT",
      CampaignType: "Search",
      Status: "Active",
      BudgetType: "DailyBudgetStandard",
      DailyBudget: 1,
      TimeZone: "GreenwichMeanTimeDublinEdinburghLisbonLondon",
      Languages: ["English"],
      BiddingScheme: { Type: "EnhancedCpc" },
      FinalUrlSuffix: campaign.finalUrlSuffix,
      IsPolitical: false,
    });
  });

  it("builds a responsive search ad from text assets", () => {
    const body = buildAdBody(campaign.adGroups[0].ad);
    expect(body.Type).toBe("ResponsiveSearch");
    expect(body.Headlines[0]).toEqual({ Asset: { Type: "TextAsset", Text: "DIY Accounting Submit" } });
    expect(body.FinalUrls).toEqual(["https://submit.diyaccounting.co.uk/"]);
  });

  it("builds United Kingdom location and presence criteria", () => {
    const criteria = buildLocationCriteria("900", campaign);
    expect(criteria.map((c) => c.Criterion)).toEqual([
      { Type: "LocationCriterion", LocationId: 188 },
      { Type: "LocationIntentCriterion", IntentOption: "PeopleIn" },
    ]);
  });

  it("sends the negative keywords for one campaign in one request with a match type each", () => {
    const [body, ...rest] = buildNegativeKeywordBodies("900", campaign.negativeKeywords);
    expect(rest).toEqual([]);
    expect(body.EntityNegativeKeywords[0].EntityType).toBe("Campaign");
    expect(body.EntityNegativeKeywords[0].NegativeKeywords).toHaveLength(campaign.negativeKeywords.length);
    expect(body.EntityNegativeKeywords[0].NegativeKeywords.at(-1)).toEqual({ Text: "vat account", MatchType: "Exact" });
  });

  it("builds event goals on the tag and offline goals without one", () => {
    const purchase = buildGoalBody(desired.goals[0], "55");
    expect(purchase).toMatchObject({
      Type: "Event",
      TagId: "55",
      ActionOperator: "Equals",
      ActionExpression: "purchase",
      GoalCategory: "Purchase",
    });
    expect(purchase.Revenue).toEqual({ Type: "VariableValue", CurrencyCode: "GBP" });
    const offline = buildGoalBody(desired.goals.at(-1), "55");
    expect(offline.Type).toBe("OfflineConversion");
    expect(offline.TagId).toBeUndefined();
  });
});

describe("plan", () => {
  it("creates everything on an empty account, tag and goals first, auto-tagging last", () => {
    const plan = planChanges(desired, emptyLive);
    const kinds = plan.actions.map((a) => a.kind);
    expect(kinds[0]).toBe("create-uet");
    expect(kinds.filter((k) => k === "create-goal")).toHaveLength(5);
    expect(kinds.indexOf("create-campaign")).toBeGreaterThan(kinds.lastIndexOf("create-goal"));
    expect(kinds.filter((k) => k === "create-ad-group")).toHaveLength(6);
    expect(kinds.at(-1)).toBe("enable-auto-tagging");
    expect(plan.unmanaged).toEqual([]);
    expect(formatPlan(plan)).toContain('+ create campaign "Search: MTD VAT" Active budget 1.00/day EnhancedCpc not political');
  });

  it("plans nothing when the account matches the file", () => {
    const plan = planChanges(desired, matchingLive());
    expect(plan.actions).toEqual([]);
    expect(formatPlan(plan)).toContain("The account matches the file.");
  });

  it("plans the update, the missing keyword and the changed ad, and never a delete", () => {
    const live = matchingLive();
    live.campaigns[0].dailyBudget = 5;
    live.campaigns[0].adGroups[0].keywords.pop();
    live.campaigns[0].adGroups[0].keywords.push({ text: "stray", matchType: "Broad" });
    live.campaigns[0].adGroups[1].ads[0].headlines = ["Old headline"];
    live.campaigns.push({ ...liveCampaignMatching({ ...campaign, name: "Other" }), id: "901", name: "Other" });
    const plan = planChanges(desired, live);
    expect(plan.actions.map((a) => a.kind)).toEqual(["update-campaign", "create-keywords", "update-ad"]);
    expect(plan.actions[0].differences).toEqual(["daily budget 5 to 1"]);
    expect(plan.unmanaged).toEqual(['keyword "stray" [Broad] in "Own brand"', 'campaign "Other"']);
    expect(formatPlan(plan)).toContain("0 deletes");
  });

  it("uses the live tag id when the tag exists", () => {
    const live = matchingLive();
    expect(planChanges(desired, live).tagId).toBe("55");
  });

  it("shapes a live goal", () => {
    expect(
      shapeGoal({ Id: 7, Name: "n", Type: "Event", GoalCategory: "Purchase", Status: "Active", ActionExpression: "purchase", TagId: 55 }),
    ).toMatchObject({
      id: "7",
      event: "purchase",
      tagId: "55",
    });
  });
});

describe("apply", () => {
  function recordingApi() {
    const calls = [];
    let next = 100;
    const api = async (path, body, options = {}) => {
      calls.push({ path, method: options.method ?? "POST", body });
      if (path === "/UetTags") return { UetTags: [{ Id: 55 }] };
      if (path === "/ConversionGoals") return { ConversionGoalIds: [++next] };
      if (path === "/Campaigns") return { CampaignIds: [900] };
      if (path === "/AdGroups") return { AdGroupIds: [++next] };
      if (path === "/Keywords") return { KeywordIds: body.Keywords.map(() => ++next) };
      if (path === "/Ads") return { AdIds: [++next] };
      return {};
    };
    return { api, calls };
  }

  it("creates the tag, goals on its id, the campaign with targeting and negatives, then each ad group", async () => {
    const { api, calls } = recordingApi();
    const ctx = await applyPlan(planChanges(desired, emptyLive), { api, accountId: "188495572" });
    expect(ctx.tagId).toBe("55");
    const paths = calls.map((c) => `${c.method} ${c.path}`);
    expect(paths.slice(0, 7)).toEqual(["POST /UetTags", ...Array(5).fill("POST /ConversionGoals"), "POST /Campaigns"]);
    expect(paths.slice(7, 9)).toEqual(["POST /CampaignCriterions", "POST /EntityNegativeKeywords"]);
    expect(calls.filter((c) => c.path === "/AdGroups")).toHaveLength(6);
    expect(calls.filter((c) => c.path === "/Keywords")).toHaveLength(6);
    expect(calls.filter((c) => c.path === "/Ads")).toHaveLength(6);
    expect(calls.find((c) => c.path === "/ConversionGoals").body.ConversionGoals[0].TagId).toBe("55");
    expect(calls.find((c) => c.path === "/Campaigns").body.Campaigns[0].IsPolitical).toBe(false);
    expect(calls.find((c) => c.path === "/CampaignCriterions").body.CriterionType).toBe("Targets");
    const adGroup = calls.find((c) => c.path === "/AdGroups");
    expect(adGroup.body.CampaignId).toBe("900");
    expect(adGroup.body.AdGroups[0]).toMatchObject({ Name: "Own brand", CpcBid: { Amount: 1 }, Network: "OwnedAndOperatedOnly" });
    expect(calls.at(-1)).toMatchObject({ method: "PUT", path: "/AccountProperties" });
    expect(calls.at(-1).body.AccountProperties).toEqual([{ Name: "MSCLKIDAutoTaggingEnabled", Value: "true" }]);
  });

  it("updates with PUT and sends only the changed entity", async () => {
    const live = matchingLive();
    live.campaigns[0].dailyBudget = 5;
    const { api, calls } = recordingApi();
    await applyPlan(planChanges(desired, live), { api, accountId: "188495572" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "PUT", path: "/Campaigns" });
    expect(calls[0].body.Campaigns[0]).toMatchObject({ Id: "900", DailyBudget: 1 });
    expect(calls[0].body.Campaigns[0].CampaignType).toBeUndefined();
  });

  it("stops with the error code when Microsoft returns a partial error", async () => {
    const api = async () => ({ PartialErrors: [{ ErrorCode: "PoliticalCampaignsAreNotSupported", Message: "not supported" }] });
    await expect(applyPlan(planChanges(desired, emptyLive), { api, accountId: "1" })).rejects.toThrow(/PoliticalCampaignsAreNotSupported/);
  });
});

describe("export", () => {
  it("prints the live campaign in the shape of ads.toml", () => {
    const live = matchingLive();
    const exported = TOML.parse(exportToToml(live));
    expect(exported.campaign[0].name).toBe("Search: MTD VAT");
    expect(exported.campaign[0].locations).toEqual(["GB"]);
    expect(exported.campaign[0].ad_group).toHaveLength(6);
    expect(exported.campaign[0].ad_group[0].keyword[0]).toEqual({ text: "diy accounting", match_type: "PHRASE" });
    expect(exported.uet.tag_id).toBe("55");
    expect(exported.account.auto_tagging).toBe(true);
  });
});
