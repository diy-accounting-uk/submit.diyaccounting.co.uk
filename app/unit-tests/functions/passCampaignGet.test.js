// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockListCampaignPasses = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  listCampaignPasses: (...args) => mockListCampaignPasses(...args),
}));
const mockGetPassFigures = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getPassFigures: (...args) => mockGetPassFigures(...args),
  getPassesByIssuer: vi.fn(),
}));

import { ingestHandler } from "@app/functions/account/passCampaignGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const operatorEmail = "operator@example.com";
const tokenFor = (email) => makeIdToken("caller-sub", { email });
const campaignPass = {
  code: "lantern-brisk-meadow-oak",
  passTypeId: "custom-campaign",
  bundleId: "resident-vat-comp",
  validFrom: "2026-11-22T00:00:00.000Z",
  validUntil: "2027-05-22T00:00:00.000Z",
  maxUses: 1000,
  usesPerAccount: 1,
  grants: [{ bundleId: "resident-vat-comp", duration: "P1Y" }],
  useCount: 12,
  createdAt: "2026-11-22T00:00:00.000Z",
};

describe("passCampaignGet", () => {
  beforeEach(() => {
    mockListCampaignPasses.mockReset();
    mockListCampaignPasses.mockResolvedValue([
      campaignPass,
      { ...campaignPass, code: "deleted-pass", deletedAt: "2026-11-23T00:00:00.000Z" },
    ]);
    mockGetPassFigures.mockReset();
    mockGetPassFigures.mockResolvedValue(new Map());
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.OPERATOR_EMAILS = operatorEmail;
  });

  test("returns 401 and lists nothing without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, null, { method: "GET" }));
    expect(result.statusCode).toBe(401);
    expect(mockListCampaignPasses).not.toHaveBeenCalled();
  });

  test("returns 403 and lists nothing for a customer", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor("customer@example.com"), null, { method: "GET" }));
    expect(result.statusCode).toBe(403);
    expect(mockListCampaignPasses).not.toHaveBeenCalled();
  });

  test("an operator gets each live campaign pass with its terms and redemptions so far", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), null, { method: "GET" }));

    expect(result.statusCode).toBe(200);
    const { passes, count } = JSON.parse(result.body);
    expect(count).toBe(1);
    expect(passes[0]).toMatchObject({
      code: "lantern-brisk-meadow-oak",
      passTypeId: "custom-campaign",
      validFrom: "2026-11-22T00:00:00.000Z",
      validUntil: "2027-05-22T00:00:00.000Z",
      maxUses: 1000,
      usesPerAccount: 1,
      grants: [{ bundleId: "resident-vat-comp", duration: "P1Y" }],
      useCount: 12,
    });
    expect(mockGetPassFigures).toHaveBeenCalledWith(["lantern-brisk-meadow-oak"]);
  });

  test("returns 500 JSON when the query throws", async () => {
    mockListCampaignPasses.mockRejectedValue(new Error("boom"));
    const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), null, { method: "GET" }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("Failed to list campaign passes");
  });
});
