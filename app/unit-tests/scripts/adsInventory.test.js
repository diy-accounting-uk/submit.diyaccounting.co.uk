// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import {
  parseArgs,
  parseConfig,
  shapeCustomer,
  shapeConversionActions,
  shapeCampaigns,
  shapeAssetGroups,
  shapeAdsLinks,
  findingForAccessLevel,
  ADS_API_OVERVIEW_URL,
} from "../../../infra/google/ads/ads-inventory.js";

describe("ads-inventory parseArgs", () => {
  it("defaults to no consent and no client file", () => {
    expect(parseArgs([])).toEqual({ consent: false, clientFile: undefined });
  });
  it("reads --consent", () => {
    expect(parseArgs(["--consent"]).consent).toBe(true);
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

describe("ads-inventory parseConfig", () => {
  const VALID_TOML = `
[account]
customer_id = "8142685080"

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
`;

  it("reads the account, project, secrets, scope, api version and ga4 property", () => {
    expect(parseConfig(VALID_TOML)).toEqual({
      customerId: "8142685080",
      projectId: "diyaccounting-ga4",
      oauthClientSecretName: "prod/submit/youtube/oauth_client",
      refreshTokenSecretName: "prod/submit/google/ads/refresh_token",
      scope: "https://www.googleapis.com/auth/adwords",
      apiVersion: "v25",
      ga4PropertyId: "523400333",
    });
  });

  it("throws when [account].customer_id is missing", () => {
    expect(() => parseConfig('[project]\nid = "diyaccounting-ga4"\n')).toThrow(/ads\.toml is missing/);
  });

  it("throws when [ga4].property_id is missing", () => {
    const withoutGa4 = VALID_TOML.replace(/\[ga4\][\s\S]*/, "");
    expect(() => parseConfig(withoutGa4)).toThrow(/ads\.toml is missing/);
  });
});

describe("ads-inventory shapeCustomer", () => {
  it("shapes the one customer row", () => {
    const body = {
      results: [
        {
          customer: {
            id: "8142685080",
            descriptiveName: "DIY Accounting",
            autoTaggingEnabled: true,
            currencyCode: "GBP",
            timeZone: "Europe/London",
          },
        },
      ],
    };
    expect(shapeCustomer(body)).toEqual({
      id: "8142685080",
      name: "DIY Accounting",
      autoTaggingEnabled: true,
      currencyCode: "GBP",
      timeZone: "Europe/London",
    });
  });

  it("answers null when there are no results", () => {
    expect(shapeCustomer({ results: [] })).toBeNull();
    expect(shapeCustomer({})).toBeNull();
  });
});

describe("ads-inventory shapeConversionActions", () => {
  it("shapes both the conversion actions and the default conversion goals", () => {
    const conversionActionsBody = {
      results: [
        {
          conversionAction: {
            resourceName: "customers/8142685080/conversionActions/1",
            name: "purchase",
            type: "WEBPAGE",
            category: "PURCHASE",
            status: "ENABLED",
            primaryForGoal: true,
          },
        },
      ],
    };
    const conversionGoalsBody = {
      results: [{ customerConversionGoal: { category: "PURCHASE", origin: "WEBSITE", biddable: true } }],
    };

    expect(shapeConversionActions(conversionActionsBody, conversionGoalsBody)).toEqual({
      actions: [
        {
          resourceName: "customers/8142685080/conversionActions/1",
          name: "purchase",
          type: "WEBPAGE",
          category: "PURCHASE",
          status: "ENABLED",
          primaryForGoal: true,
        },
      ],
      goals: [{ category: "PURCHASE", origin: "WEBSITE", biddable: true }],
    });
  });

  it("answers empty arrays when there are no results", () => {
    expect(shapeConversionActions({}, {})).toEqual({ actions: [], goals: [] });
  });
});

describe("ads-inventory shapeCampaigns", () => {
  it("joins the campaign row with its budget's amount", () => {
    const body = {
      results: [
        {
          campaign: {
            resourceName: "customers/8142685080/campaigns/1",
            name: "Performance Max",
            status: "ENABLED",
            advertisingChannelType: "PERFORMANCE_MAX",
            campaignBudget: "customers/8142685080/campaignBudgets/1",
          },
          campaignBudget: { amountMicros: "1000000" },
        },
      ],
    };
    expect(shapeCampaigns(body)).toEqual([
      {
        resourceName: "customers/8142685080/campaigns/1",
        name: "Performance Max",
        status: "ENABLED",
        advertisingChannelType: "PERFORMANCE_MAX",
        budgetResourceName: "customers/8142685080/campaignBudgets/1",
        budgetAmountMicros: "1000000",
      },
    ]);
  });

  it("answers null budget fields when the budget row is absent", () => {
    const body = { results: [{ campaign: { resourceName: "r", name: "n", status: "s", advertisingChannelType: "t" } }] };
    expect(shapeCampaigns(body)[0].budgetAmountMicros).toBeNull();
  });

  it("answers an empty array when there are no results", () => {
    expect(shapeCampaigns({})).toEqual([]);
  });
});

describe("ads-inventory shapeAssetGroups", () => {
  it("shapes an asset group row", () => {
    const body = {
      results: [
        {
          assetGroup: {
            resourceName: "customers/8142685080/assetGroups/1",
            name: "Main asset group",
            status: "ENABLED",
            campaign: "customers/8142685080/campaigns/1",
          },
        },
      ],
    };
    expect(shapeAssetGroups(body)).toEqual([
      {
        resourceName: "customers/8142685080/assetGroups/1",
        name: "Main asset group",
        status: "ENABLED",
        campaign: "customers/8142685080/campaigns/1",
      },
    ]);
  });

  it("answers an empty array when there are no results", () => {
    expect(shapeAssetGroups({})).toEqual([]);
  });
});

describe("ads-inventory shapeAdsLinks", () => {
  it("shapes a GA4 googleAdsLinks entry", () => {
    const body = {
      googleAdsLinks: [
        {
          name: "properties/523400333/googleAdsLinks/1",
          customerId: "8142685080",
          canManageClients: false,
          adsPersonalizationEnabled: true,
        },
      ],
    };
    expect(shapeAdsLinks(body)).toEqual([
      { name: "properties/523400333/googleAdsLinks/1", customerId: "8142685080", canManageClients: false, adsPersonalizationEnabled: true },
    ]);
  });

  it("answers an empty array when there are no links", () => {
    expect(shapeAdsLinks({})).toEqual([]);
  });
});

describe("ads-inventory findingForAccessLevel", () => {
  it("answers null for a non-403 error", () => {
    expect(findingForAccessLevel(new Error("500 from googleAds:search: server error"), "diyaccounting-ga4")).toBeNull();
  });

  it("names the Test access level and the Overview page for DEVELOPER_TOKEN_NOT_APPROVED", () => {
    const error = new Error(
      '403 from googleAds:search: {"error":{"status":"PERMISSION_DENIED","details":[{"errorCode":{"authorizationError":"DEVELOPER_TOKEN_NOT_APPROVED"}}]}}',
    );
    const finding = findingForAccessLevel(error, "diyaccounting-ga4");
    expect(finding).toContain("Test");
    expect(finding).toContain(`${ADS_API_OVERVIEW_URL}?project=diyaccounting-ga4`);
  });

  it("names the missing user access for NOT_ADS_USER", () => {
    const error = new Error('403 from googleAds:search: {"error":{"details":[{"errorCode":{"authenticationError":"NOT_ADS_USER"}}]}}');
    const finding = findingForAccessLevel(error, "diyaccounting-ga4");
    expect(finding).toContain("no access");
  });

  it("falls back to a generic access-level reason for any other 403", () => {
    const error = new Error("403 from googleAds:search: forbidden");
    const finding = findingForAccessLevel(error, "diyaccounting-ga4");
    expect(finding).toContain("access level");
  });
});
