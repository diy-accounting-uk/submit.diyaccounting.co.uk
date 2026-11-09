// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/companiesHouseGrantAccess.test.js
// Opening a Companies House grant: ownership, expiry, the company bound from the scope, and the
// raw bearer token that passes unchanged, over an in-memory table.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { FakeCodesEntryTable } from "@app/test-helpers/fakeCodesEntryTable.js";
import { _setTestSalt, hashSub } from "@app/services/subHasher.js";
import { sealFor, COMPANIES_HOUSE_GRANT_PURPOSE } from "@app/lib/codesSeal.js";

const table = new FakeCodesEntryTable();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (builder) => table.execute(builder),
  getResourceName: () => "test-mcp-sessions",
}));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { createCompaniesHouseGrant } = await import("@app/data/dynamoDbCompaniesHouseGrantRepository.js");
const {
  openCompaniesHouseGrantFor,
  companiesHouseAccessFromEvent,
  companiesHouseGrantIdFromEvent,
  companyNumberFromScope,
  COMPANIES_HOUSE_GRANT_HEADER,
} = await import("@app/lib/companiesHouseGrantAccess.js");

const SUB = "user-sub-1";
const SCOPE =
  "https://identity.company-information.service.gov.uk/user/profile.read https://api.company-information.service.gov.uk/company/01234567/registered-email-address.update";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function storeGrant({ expiresIn = 3600, sub = SUB, scope = SCOPE } = {}) {
  const { grantId } = await createCompaniesHouseGrant({
    hashedSub: hashSub(sub),
    scope,
    companyNumber: companyNumberFromScope(scope),
    accessExpiresAt: nowSeconds() + expiresIn,
    seal: (id) => sealFor(COMPANIES_HOUSE_GRANT_PURPOSE, { accessToken: "ch-access-1" }, id),
  });
  return grantId;
}

function eventFor(headers) {
  return buildLambdaEvent({ headers, authorizer: { authorizer: { jwt: { claims: { sub: SUB } } } } });
}

describe("companiesHouseGrantAccess", () => {
  beforeEach(() => {
    _setTestSalt("test-salt");
    table.items.clear();
  });

  test("companyNumberFromScope reads the company from the filing scope and null from any other", () => {
    expect(companyNumberFromScope(SCOPE)).toBe("01234567");
    expect(companyNumberFromScope("https://identity.company-information.service.gov.uk/user/profile.read")).toBeNull();
    expect(companyNumberFromScope(undefined)).toBeNull();
  });

  test("opens a grant for its owner with the access token and the bound company", async () => {
    const grantId = await storeGrant();
    const opened = await openCompaniesHouseGrantFor(grantId, SUB);
    expect(opened.status).toBe("granted");
    expect(opened.accessToken).toBe("ch-access-1");
    expect(opened.companyNumber).toBe("01234567");
  });

  test("refuses a grant that belongs to another user", async () => {
    const grantId = await storeGrant({ sub: "someone-else" });
    expect((await openCompaniesHouseGrantFor(grantId, SUB)).status).toBe("forbidden");
  });

  test("answers missing for an unknown grant and for an expired one", async () => {
    expect((await openCompaniesHouseGrantFor("00000000-0000-4000-8000-000000000000", SUB)).status).toBe("missing");
    const grantId = await storeGrant({ expiresIn: -10 });
    expect((await openCompaniesHouseGrantFor(grantId, SUB)).status).toBe("missing");
  });

  test("reads the grant id from the header, then from a bearer value shaped like one", async () => {
    const grantId = await storeGrant();
    expect(companiesHouseGrantIdFromEvent({ headers: { [COMPANIES_HOUSE_GRANT_HEADER]: grantId } })).toBe(grantId);
    expect(companiesHouseGrantIdFromEvent({ headers: { Authorization: `Bearer ${grantId}` } })).toBe(grantId);
    expect(companiesHouseGrantIdFromEvent({ headers: { Authorization: "Bearer a-raw-token" } })).toBeNull();
  });

  test("a request that names a grant gets the grant's token and company", async () => {
    const grantId = await storeGrant();
    const byHeader = await companiesHouseAccessFromEvent(eventFor({ [COMPANIES_HOUSE_GRANT_HEADER]: grantId }), SUB);
    expect(byHeader).toEqual({ accessToken: "ch-access-1", companyNumber: "01234567" });
    const byBearer = await companiesHouseAccessFromEvent(eventFor({ Authorization: `Bearer ${grantId}` }), SUB);
    expect(byBearer).toEqual({ accessToken: "ch-access-1", companyNumber: "01234567" });
  });

  test("a raw bearer token passes unchanged with no company", async () => {
    const access = await companiesHouseAccessFromEvent(eventFor({ Authorization: "Bearer a-raw-token" }), SUB);
    expect(access).toEqual({ accessToken: "a-raw-token", companyNumber: null });
  });

  test("a request with no token, or a grant that does not open, answers null", async () => {
    expect(await companiesHouseAccessFromEvent(eventFor({}), SUB)).toBeNull();
    const other = await storeGrant({ sub: "someone-else" });
    expect(await companiesHouseAccessFromEvent(eventFor({ [COMPANIES_HOUSE_GRANT_HEADER]: other }), SUB)).toBeNull();
    expect(await companiesHouseAccessFromEvent(eventFor({ [COMPANIES_HOUSE_GRANT_HEADER]: "not-a-grant-id" }), SUB)).toBeNull();
  });
});
