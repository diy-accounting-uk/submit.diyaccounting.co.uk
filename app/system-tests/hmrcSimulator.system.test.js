// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/hmrcSimulator.system.test.js
// System tests for the HTTP simulator

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startSimulator, resetState } from "../http-simulator/index.js";

describe("HTTP Simulator", () => {
  let simulator;
  let baseUrl;

  beforeAll(async () => {
    simulator = await startSimulator({ port: 0 }); // Use random port
    baseUrl = simulator.baseUrl;
  });

  afterAll(async () => {
    if (simulator) {
      await simulator.stop();
    }
  });

  describe("Health Check", () => {
    it("should return healthy status", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("http-simulator");
    });
  });

  describe("Index Page", () => {
    it("should return index HTML page", async () => {
      const response = await fetch(baseUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("HTTP Simulator");
      expect(html).toContain("/oauth/authorize");
      expect(html).toContain("/organisations/vat");
    });
  });

  describe("Local OAuth (Mock OAuth2 Server replacement)", () => {
    it("should return login form for GET /oauth/authorize with client_id=debugger", async () => {
      const url = new URL(`${baseUrl}/oauth/authorize`);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", "debugger");
      url.searchParams.set("redirect_uri", "http://localhost:3000/callback");
      url.searchParams.set("scope", "openid somescope");
      url.searchParams.set("state", "test-state");

      const response = await fetch(url.toString());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("Mock OAuth2 Login");
      expect(html).toContain('name="username"');
    });

    it("should exchange auth code for tokens at POST /default/token", async () => {
      // First, get an authorization code by posting to /oauth/authorize
      const authParams = new URLSearchParams({
        redirect_uri: "http://localhost:3000/callback",
        state: "test-state",
        client_id: "debugger",
        username: "testuser",
        claims: JSON.stringify({ email: "test@example.com" }),
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: authParams.toString(),
        redirect: "manual",
      });

      expect(authResponse.status).toBe(302);
      const redirectUrl = new URL(authResponse.headers.get("location"));
      const code = redirectUrl.searchParams.get("code");
      expect(code).toBeTruthy();

      // Exchange code for token
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "debugger",
        redirect_uri: "http://localhost:3000/callback",
      });

      const tokenResponse = await fetch(`${baseUrl}/default/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });

      expect(tokenResponse.status).toBe(200);
      const tokenData = await tokenResponse.json();

      expect(tokenData).toHaveProperty("access_token");
      expect(tokenData).toHaveProperty("id_token");
      expect(tokenData).toHaveProperty("token_type", "Bearer");
      expect(tokenData).toHaveProperty("expires_in");

      // Verify JWT structure
      const [, payloadB64] = tokenData.access_token.split(".");
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      expect(payload.sub).toBe("testuser");
      expect(payload.email).toBe("test@example.com");
    });
  });

  describe("HMRC OAuth", () => {
    it("should auto-redirect for GET /oauth/authorize with HMRC client_id and autoGrant=true", async () => {
      const url = new URL(`${baseUrl}/oauth/authorize`);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", "uqMHA6RsDGGa7h8EG2VqfqAmv4tV");
      url.searchParams.set("redirect_uri", "http://localhost:3000/hmrc-callback");
      url.searchParams.set("scope", "read:vat write:vat");
      url.searchParams.set("state", "hmrc-state");
      url.searchParams.set("autoGrant", "true");

      const response = await fetch(url.toString(), { redirect: "manual" });
      expect(response.status).toBe(302);

      const redirectUrl = new URL(response.headers.get("location"));
      expect(redirectUrl.pathname).toBe("/hmrc-callback");
      expect(redirectUrl.searchParams.get("code")).toBeTruthy();
      expect(redirectUrl.searchParams.get("state")).toBe("hmrc-state");
    });

    it("should exchange HMRC auth code for tokens at POST /oauth/token", async () => {
      // First get a code using autoGrant mode
      const url = new URL(`${baseUrl}/oauth/authorize`);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", "uqMHA6RsDGGa7h8EG2VqfqAmv4tV");
      url.searchParams.set("redirect_uri", "http://localhost:3000/hmrc-callback");
      url.searchParams.set("scope", "read:vat write:vat");
      url.searchParams.set("state", "hmrc-state");
      url.searchParams.set("autoGrant", "true");

      const authResponse = await fetch(url.toString(), { redirect: "manual" });
      const redirectUrl = new URL(authResponse.headers.get("location"));
      const code = redirectUrl.searchParams.get("code");

      // Exchange for token
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "uqMHA6RsDGGa7h8EG2VqfqAmv4tV",
        client_secret: "test-secret",
        redirect_uri: "http://localhost:3000/hmrc-callback",
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });

      expect(tokenResponse.status).toBe(200);
      const tokenData = await tokenResponse.json();

      expect(tokenData).toHaveProperty("access_token");
      expect(tokenData).toHaveProperty("refresh_token");
      expect(tokenData).toHaveProperty("token_type", "bearer");
      expect(tokenData).toHaveProperty("expires_in", 14400);
      expect(tokenData).toHaveProperty("scope");
    });
  });

  describe("VAT Obligations", () => {
    it("should return obligations for valid VAT registration number", async () => {
      const response = await fetch(`${baseUrl}/organisations/vat/443941738/obligations?from=2025-01-01&to=2025-12-01`, {
        headers: {
          Accept: "application/vnd.hmrc.1.0+json",
          Authorization: "Bearer test-token",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty("obligations");
      expect(Array.isArray(data.obligations)).toBe(true);
      expect(data.obligations.length).toBeGreaterThan(0);

      const obligation = data.obligations[0];
      expect(obligation).toHaveProperty("periodKey");
      expect(obligation).toHaveProperty("start");
      expect(obligation).toHaveProperty("end");
      expect(obligation).toHaveProperty("due");
      expect(obligation).toHaveProperty("status");
    });

    it("should return 400 for invalid VAT registration number", async () => {
      const response = await fetch(`${baseUrl}/organisations/vat/invalid/obligations?from=2025-01-01&to=2025-12-01`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.code).toBe("VRN_INVALID");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND", async () => {
      const response = await fetch(`${baseUrl}/organisations/vat/443941738/obligations?from=2025-01-01&to=2025-12-01`, {
        headers: {
          "Gov-Test-Scenario": "NOT_FOUND",
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("NOT_FOUND");
    });
  });

  describe("ITSA Business Details", () => {
    it("should return a business list for a valid NINO", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/details/AB123456C/list`, {
        headers: {
          Accept: "application/vnd.hmrc.2.0+json",
          Authorization: "Bearer test-token",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty("listOfBusinesses");
      expect(Array.isArray(data.listOfBusinesses)).toBe(true);
      expect(data.listOfBusinesses.length).toBeGreaterThan(0);

      const business = data.listOfBusinesses[0];
      expect(business).toHaveProperty("typeOfBusiness");
      expect(business).toHaveProperty("businessId");
    });

    it("should return 400 for an invalid NINO", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/details/invalid-nino/list`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/details/AB123456C/list`, {
        headers: {
          "Gov-Test-Scenario": "NOT_FOUND",
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("should return a property business for Gov-Test-Scenario PROPERTY", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/details/AB123456C/list`, {
        headers: {
          "Gov-Test-Scenario": "PROPERTY",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.listOfBusinesses[0].typeOfBusiness).toBe("uk-property");
    });

    it("should return both business types for Gov-Test-Scenario BUSINESS_AND_PROPERTY", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/details/AB123456C/list`, {
        headers: {
          "Gov-Test-Scenario": "BUSINESS_AND_PROPERTY",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const types = data.listOfBusinesses.map((b) => b.typeOfBusiness);
      expect(types).toContain("self-employment");
      expect(types).toContain("uk-property");
    });
  });

  describe("ITSA Obligations", () => {
    it("should return obligations for a valid NINO", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/income-and-expenditure`, {
        headers: {
          Accept: "application/vnd.hmrc.3.0+json",
          Authorization: "Bearer test-token",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty("obligations");
      expect(Array.isArray(data.obligations)).toBe(true);
      expect(data.obligations.length).toBeGreaterThan(0);

      const business = data.obligations[0];
      expect(business).toHaveProperty("typeOfBusiness");
      expect(business).toHaveProperty("businessId");
      expect(Array.isArray(business.obligationDetails)).toBe(true);
    });

    it("should return 400 for an invalid NINO", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/invalid-nino/income-and-expenditure`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/income-and-expenditure`, {
        headers: {
          "Gov-Test-Scenario": "NOT_FOUND",
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("should return only open obligations for Gov-Test-Scenario OPEN", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/income-and-expenditure`, {
        headers: {
          "Gov-Test-Scenario": "OPEN",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const statuses = data.obligations.flatMap((business) => business.obligationDetails.map((detail) => detail.status));
      expect(statuses).toEqual(["open"]);
    });

    it("should filter by status query parameter", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/income-and-expenditure?status=fulfilled`);

      expect(response.status).toBe(200);
      const data = await response.json();
      const statuses = data.obligations.flatMap((business) => business.obligationDetails.map((detail) => detail.status));
      expect(statuses.every((status) => status === "fulfilled")).toBe(true);
    });
  });

  describe("ITSA Self-Employment Period", () => {
    const validBody = () => ({
      periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
      periodIncome: { turnover: 1000, other: 0 },
      periodExpenses: { costOfGoods: 100 },
    });

    it("should create a period summary for a valid request", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/period`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.5.0+json",
          "Authorization": "Bearer test-token",
        },
        body: JSON.stringify(validBody()),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.periodId).toBe("2024-04-06_2024-07-05");
    });

    it("should return 400 for an invalid NINO", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/invalid-nino/XAIS12345678910/period`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should return 400 for an invalid businessId", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/not-a-business-id/period`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_BUSINESS_ID");
    });

    it("should return 400 when periodDates is missing", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/period`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodIncome: { turnover: 1000 } }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    it("should respect Gov-Test-Scenario header for OVERLAPPING_PERIOD", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/period`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "OVERLAPPING_PERIOD" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_OVERLAPPING_PERIOD");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/period`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "NOT_FOUND" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });
  });

  describe("ITSA UK Property Period", () => {
    const validBody = () => ({
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      ukNonFhlProperty: {
        income: { periodAmount: 1000, otherIncome: 0 },
        expenses: { repairsAndMaintenance: 100 },
      },
    });

    it("should create a period summary for a valid request", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/period/2024-25`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.6.0+json",
          "Authorization": "Bearer test-token",
        },
        body: JSON.stringify(validBody()),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.submissionId).toBe("2024-04-06_2024-07-05");
    });

    it("should return 400 for an invalid NINO", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/invalid-nino/XAIS12345678910/period/2024-25`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should return 400 when neither ukFhlProperty nor ukNonFhlProperty is present", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/period/2024-25`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: "2024-04-06", toDate: "2024-07-05" }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    it("should respect Gov-Test-Scenario header for OVERLAPPING", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/period/2024-25`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "OVERLAPPING" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_OVERLAPPING_PERIOD");
    });

    it("should retrieve a period summary when a scenario is given", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/period/2024-25/2024-04-06_2024-07-05`,
        { headers: { "Gov-Test-Scenario": "UK_PROPERTY" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ukNonFhlProperty).toBeDefined();
    });

    it("should default the retrieve to not-found when no scenario is given, matching the adjustable summary's retrieve", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/period/2024-25/2024-04-06_2024-07-05`,
      );
      expect(response.status).toBe(404);
    });

    it("should amend a period summary and answer 204 with no body", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/period/2024-25/2024-04-06_2024-07-05`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ukNonFhlProperty: { income: { periodAmount: 1200 } } }),
        },
      );
      expect(response.status).toBe(204);
    });

    it("should list period summaries on the untyped property path", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/AB123456C/XAIS12345678910/period/2024-25`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.periods)).toBe(true);
    });
  });

  describe("ITSA UK Property Annual", () => {
    const validBody = () => ({ ukProperty: { adjustments: { balancingCharge: 100 } } });

    it("should retrieve an annual submission when a scenario is given", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/annual/2023-24`, {
        headers: { "Gov-Test-Scenario": "UK_PROPERTY" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ukProperty).toBeDefined();
    });

    it("should default the retrieve to not-found when no scenario is given", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/annual/2023-24`);
      expect(response.status).toBe(404);
    });

    it("should create and amend an annual submission and answer 200, not 204", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.6.0+json",
        },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(200);
    });

    it("should return 400 when the body is entirely empty", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ukProperty: {} }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    it("should return 400 when propertyIncomeAllowance sits beside the itemised allowances", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ukProperty: { allowances: { propertyIncomeAllowance: 1000, annualInvestmentAllowance: 200 } },
        }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_BOTH_ALLOWANCES_SUPPLIED");
    });

    it("should return 400 when propertyIncomeAllowance sits beside a privateUseAdjustment", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/property/uk/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ukProperty: { adjustments: { privateUseAdjustment: 50 }, allowances: { propertyIncomeAllowance: 1000 } },
        }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_PROPERTY_INCOME_ALLOWANCE");
    });
  });

  describe("ITSA Self-Employment Annual", () => {
    const validBody = () => ({
      adjustments: { includedNonTaxableProfits: 200 },
      allowances: { annualInvestmentAllowance: 500 },
    });

    it("should retrieve the default annual submission", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        headers: { "Accept": "application/vnd.hmrc.5.0+json", "Authorization": "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.adjustments).toBeDefined();
      expect(data.allowances).toBeDefined();
    });

    it("should respect Gov-Test-Scenario header for TRADING_ALLOWANCE on retrieve", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        headers: { "Gov-Test-Scenario": "TRADING_ALLOWANCE" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.allowances.tradingIncomeAllowance).toBeDefined();
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND on retrieve", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        headers: { "Gov-Test-Scenario": "NOT_FOUND" },
      });
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("should return 400 for an invalid NINO on retrieve", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/invalid-nino/XAIS12345678910/annual/2023-24`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should create and amend an annual submission for a valid request", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.5.0+json",
          "Authorization": "Bearer test-token",
        },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(204);
    });

    it("should return 400 for an invalid businessId on create/amend", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/not-a-business-id/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_BUSINESS_ID");
    });

    it("should return 400 for an entirely empty body on create/amend", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    it("should return 400 when both allowance forms are supplied", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowances: { tradingIncomeAllowance: 200, annualInvestmentAllowance: 500 } }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_BOTH_ALLOWANCES_SUPPLIED");
    });

    it("should respect Gov-Test-Scenario header for ALLOWANCE_NOT_SUPPORTED", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "ALLOWANCE_NOT_SUPPORTED" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_ALLOWANCE_NOT_SUPPORTED");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND on create/amend", async () => {
      const response = await fetch(`${baseUrl}/individuals/business/self-employment/AB123456C/XAIS12345678910/annual/2023-24`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "NOT_FOUND" },
        body: JSON.stringify(validBody()),
      });
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });
  });

  describe("ITSA Crystallisation Obligations", () => {
    it("should return one open obligation by default, with dates derived from the requested tax year", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/crystallisation?taxYear=2023-24`, {
        headers: { "Accept": "application/vnd.hmrc.3.0+json", "Authorization": "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.obligations)).toBe(true);
      expect(data.obligations).toHaveLength(1);
      expect(data.obligations[0].status).toBe("open");
      expect(data.obligations[0].periodStartDate).toBe("2023-04-06");
      expect(data.obligations[0].periodEndDate).toBe("2024-04-05");
      expect(data.obligations[0].dueDate).toBe("2025-01-31");
    });

    it("should derive different dates for a different requested tax year, never a fixed one", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/crystallisation?taxYear=2022-23`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.obligations[0].periodStartDate).toBe("2022-04-06");
      expect(data.obligations[0].dueDate).toBe("2024-01-31");
    });

    it("should return 400 for an invalid NINO", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/invalid-nino/crystallisation`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should respect Gov-Test-Scenario header for MULTIPLE", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/crystallisation?taxYear=2023-24`, {
        headers: { "Gov-Test-Scenario": "MULTIPLE" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.obligations.length).toBeGreaterThan(1);
    });

    it("should respect Gov-Test-Scenario header for INSOLVENT_TRADER", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/crystallisation`, {
        headers: { "Gov-Test-Scenario": "INSOLVENT_TRADER" },
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INSOLVENT_TRADER");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/crystallisation`, {
        headers: { "Gov-Test-Scenario": "NOT_FOUND" },
      });
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("should filter by status query parameter", async () => {
      const response = await fetch(`${baseUrl}/obligations/details/AB123456C/crystallisation?taxYear=2023-24&status=fulfilled`, {
        headers: { "Gov-Test-Scenario": "MULTIPLE" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.obligations.every((detail) => detail.status === "fulfilled")).toBe(true);
    });
  });

  describe("ITSA Status", () => {
    it("should return the itsaStatuses for a valid NINO and tax year", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/AB123456C/2023-24`, {
        headers: { "Accept": "application/vnd.hmrc.2.0+json", "Authorization": "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.itsaStatuses)).toBe(true);
      expect(data.itsaStatuses).toHaveLength(1);
      expect(data.itsaStatuses[0].taxYear).toBe("2023-24");
      expect(Array.isArray(data.itsaStatuses[0].itsaStatusDetails)).toBe(true);
    });

    it("should include the following tax year when futureYears=true", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/AB123456C/2023-24?futureYears=true`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.itsaStatuses).toHaveLength(2);
      expect(data.itsaStatuses[1].taxYear).toBe("2024-25");
    });

    it("should return 400 for an invalid NINO", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/invalid-nino/2023-24`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should return 400 for an invalid taxYear", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/AB123456C/2023`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_TAX_YEAR");
    });

    it("should respect Gov-Test-Scenario header for NOT_FOUND", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/AB123456C/2023-24`, {
        headers: { "Gov-Test-Scenario": "NOT_FOUND" },
      });
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("should respect Gov-Test-Scenario header for NOT_ENROLLED", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/AB123456C/2023-24`, {
        headers: { "Gov-Test-Scenario": "NOT_ENROLLED" },
      });
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe("CLIENT_NOT_MTD_ENROLLED");
    });

    it("should return the default set for STATEFUL, since the simulator has no per-user state", async () => {
      const response = await fetch(`${baseUrl}/individuals/person/itsa-status/AB123456C/2023-24`, {
        headers: { "Gov-Test-Scenario": "STATEFUL" },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.itsaStatuses[0].taxYear).toBe("2023-24");
    });
  });

  describe("ITSA BSAS", () => {
    const validTriggerBody = () => ({
      accountingPeriod: { startDate: "2023-04-06", endDate: "2024-04-05" },
      typeOfBusiness: "self-employment",
      businessId: "XAIS12345678910",
    });

    it("should trigger a summary for a valid request", async () => {
      const response = await fetch(`${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.7.0+json",
          "Authorization": "Bearer test-token",
        },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.calculationId).toBe("string");
    });

    it("should return 400 for an invalid NINO on trigger", async () => {
      const response = await fetch(`${baseUrl}/individuals/self-assessment/adjustable-summary/invalid-nino/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should return 400 for an incomplete trigger body", async () => {
      const response = await fetch(`${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeOfBusiness: "self-employment" }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    it("should respect Gov-Test-Scenario header for OBLIGATIONS_NOT_MET on trigger", async () => {
      const response = await fetch(`${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "OBLIGATIONS_NOT_MET" },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_OBLIGATIONS_NOT_MET");
    });

    it("should respect Gov-Test-Scenario header for REQUEST_CANNOT_BE_FULFILLED on trigger", async () => {
      const response = await fetch(`${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "REQUEST_CANNOT_BE_FULFILLED" },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.code).toBe("RULE_REQUEST_CANNOT_BE_FULFILLED");
    });

    it("should answer not-found with no Gov-Test-Scenario header on retrieve, matching HMRC's own default", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/2023-24`,
        { headers: { "Accept": "application/vnd.hmrc.7.0+json", "Authorization": "Bearer test-token" } },
      );
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("should retrieve a profit summary for SELF_EMPLOYMENT_PROFIT", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/2023-24`,
        { headers: { "Gov-Test-Scenario": "SELF_EMPLOYMENT_PROFIT" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.adjustableSummaryCalculation.netProfit).toBeDefined();
    });

    it("should retrieve a loss summary for SELF_EMPLOYMENT_LOSS", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/2023-24`,
        { headers: { "Gov-Test-Scenario": "SELF_EMPLOYMENT_LOSS" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.adjustableSummaryCalculation.netLoss).toBeDefined();
    });

    it("should reflect the request's nino, calculationId and taxYear for a DYNAMIC_ scenario", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/12345678/2022-23`,
        { headers: { "Gov-Test-Scenario": "DYNAMIC_SELF_EMPLOYMENT_PROFIT" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.metadata.calculationId).toBe("12345678");
      expect(data.metadata.taxYear).toBe("2022-23");
      expect(data.metadata.nino).toBe("AB123456C");
    });

    it("should return 400 for an invalid calculationId on retrieve", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/not-a-calculation-id/2023-24`,
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_CALCULATION_ID");
    });

    it("should submit adjustments for a valid request", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/vnd.hmrc.7.0+json",
            "Authorization": "Bearer test-token",
          },
          body: JSON.stringify({ income: { turnover: 1000 } }),
        },
      );
      expect(response.status).toBe(200);
    });

    it("should accept zeroAdjustments on its own", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zeroAdjustments: true }),
        },
      );
      expect(response.status).toBe(200);
    });

    it("should return 400 when zeroAdjustments is supplied together with figures", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zeroAdjustments: true, income: { turnover: 1000 } }),
        },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_BOTH_ADJUSTMENTS_SUPPLIED");
    });

    it("should return 400 for an entirely empty adjust body", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    it("should respect Gov-Test-Scenario header for ALREADY_ADJUSTED", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/self-employment/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "ALREADY_ADJUSTED" },
          body: JSON.stringify({ income: { turnover: 1000 } }),
        },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_ALREADY_ADJUSTED");
    });

    it("should trigger a summary for a UK property business", async () => {
      const response = await fetch(`${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountingPeriod: { startDate: "2023-04-06", endDate: "2024-04-05" },
          typeOfBusiness: "uk-property",
          businessId: "XAIS12345678910",
        }),
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.calculationId).toBe("string");
    });

    it("should answer not-found with no Gov-Test-Scenario header on the UK property retrieve", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/2023-24`,
      );
      expect(response.status).toBe(404);
    });

    it("should retrieve a profit summary for UK_PROPERTY_PROFIT, using the adjustable summary's own income labels", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/2023-24`,
        { headers: { "Gov-Test-Scenario": "UK_PROPERTY_PROFIT" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.adjustableSummaryCalculation.income.totalRentsReceived).toBeDefined();
      expect(data.adjustableSummaryCalculation.netProfit).toBeDefined();
    });

    it("should retrieve a loss summary for UK_PROPERTY_LOSS", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/2023-24`,
        { headers: { "Gov-Test-Scenario": "UK_PROPERTY_LOSS" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.adjustableSummaryCalculation.netLoss).toBeDefined();
    });

    it("should adjust a UK property summary and answer 200 with no body", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ukProperty: { income: { totalRentsReceived: 9000 } } }),
        },
      );
      expect(response.status).toBe(200);
    });

    it("should return 400 for an entirely empty UK property adjust body", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/self-assessment/adjustable-summary/AB123456C/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2023-24`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });
  });

  describe("ITSA Calculations", () => {
    const validTriggerBody = () => ({});

    it("should trigger a calculation for a valid request", async () => {
      const response = await fetch(`${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/trigger/in-year`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.8.0+json",
          "Authorization": "Bearer test-token",
        },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(202);
      const data = await response.json();
      expect(typeof data.calculationId).toBe("string");
    });

    it("should return 400 for an invalid NINO on trigger", async () => {
      const response = await fetch(`${baseUrl}/individuals/calculations/invalid-nino/self-assessment/2023-24/trigger/in-year`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_NINO");
    });

    it("should return 400 for an invalid calculationType on trigger", async () => {
      const response = await fetch(`${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/trigger/not-a-type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_CALCULATION_TYPE");
    });

    it("should respect Gov-Test-Scenario header for RECENT_SUBMISSIONS_EXIST on trigger", async () => {
      const response = await fetch(`${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/trigger/intent-to-finalise`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "RECENT_SUBMISSIONS_EXIST" },
        body: JSON.stringify(validTriggerBody()),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_RECENT_SUBMISSIONS_EXIST");
    });

    it("should retrieve a default success example with no Gov-Test-Scenario header", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c`,
        { headers: { "Accept": "application/vnd.hmrc.8.0+json", "Authorization": "Bearer test-token" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.calculation.taxCalculation.totalIncomeTaxAndNicsDue).toBeDefined();
    });

    it("should return not-found for NOT_FOUND", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c`,
        { headers: { "Gov-Test-Scenario": "NOT_FOUND" } },
      );
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("should return messages with no calculation for ERROR_MESSAGES_EXIST", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c`,
        { headers: { "Gov-Test-Scenario": "ERROR_MESSAGES_EXIST" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.calculation).toBeUndefined();
      expect(data.messages.errors.length).toBeGreaterThan(0);
    });

    it("should retrieve the UK_SE_SAVINGS_EXAMPLE calculation", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c`,
        { headers: { "Gov-Test-Scenario": "UK_SE_SAVINGS_EXAMPLE" } },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.metadata.calculationType).toBe("in-year");
    });

    it("should return 400 for an invalid calculationId on retrieve", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/not-a-calculation-id`,
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_CALCULATION_ID");
    });

    it("should submit a final declaration for a valid request", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/final-declaration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/vnd.hmrc.8.0+json",
            "Authorization": "Bearer test-token",
          },
        },
      );
      expect(response.status).toBe(204);
    });

    it("should respect Gov-Test-Scenario header for FINAL_DECLARATION_RECEIVED", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/final-declaration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Gov-Test-Scenario": "FINAL_DECLARATION_RECEIVED" },
        },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("RULE_FINAL_DECLARATION_RECEIVED");
    });

    it("should return 400 for an invalid calculationType on final declaration", async () => {
      const response = await fetch(
        `${baseUrl}/individuals/calculations/AB123456C/self-assessment/2023-24/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/not-a-type`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("FORMAT_CALCULATION_TYPE");
    });
  });

  describe("VAT Returns", () => {
    it("should accept VAT return submission", async () => {
      resetState(); // Clear any previous submissions

      const returnData = {
        periodKey: "25S3",
        vatDueSales: 1000,
        vatDueAcquisitions: 0,
        totalVatDue: 1000,
        vatReclaimedCurrPeriod: 0,
        netVatDue: 1000,
        totalValueSalesExVAT: 0,
        totalValuePurchasesExVAT: 0,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
        finalised: true,
      };

      const response = await fetch(`${baseUrl}/organisations/vat/443941738/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.1.0+json",
          "Authorization": "Bearer test-token",
        },
        body: JSON.stringify(returnData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data).toHaveProperty("processingDate");
      expect(data).toHaveProperty("formBundleNumber");
      expect(data).toHaveProperty("paymentIndicator");
      expect(data).toHaveProperty("chargeRefNumber");
    });

    it("should retrieve submitted VAT return", async () => {
      // Submit a return first
      const returnData = {
        periodKey: "25S4",
        vatDueSales: 500,
        vatDueAcquisitions: 0,
        totalVatDue: 500,
        vatReclaimedCurrPeriod: 100,
        netVatDue: 400,
        totalValueSalesExVAT: 2000,
        totalValuePurchasesExVAT: 500,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
        finalised: true,
      };

      await fetch(`${baseUrl}/organisations/vat/443941738/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(returnData),
      });

      // Retrieve it
      const response = await fetch(`${baseUrl}/organisations/vat/443941738/returns/25S4`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.periodKey).toBe("25S4");
      expect(data.vatDueSales).toBe(500);
      expect(data.netVatDue).toBe(400);
    });
  });

  describe("Fraud Prevention Headers Validation", () => {
    it("should return validation result with missing headers", async () => {
      const response = await fetch(`${baseUrl}/test/fraud-prevention-headers/validate`, {
        headers: {
          Authorization: "Bearer test-token",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty("specVersion");
      expect(data).toHaveProperty("code");
      expect(data).toHaveProperty("errors");
      expect(data).toHaveProperty("warnings");
      expect(Array.isArray(data.errors)).toBe(true);
    });

    it("should return VALID when all required headers present", async () => {
      const response = await fetch(`${baseUrl}/test/fraud-prevention-headers/validate`, {
        headers: {
          "Authorization": "Bearer test-token",
          "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
          "Gov-Client-Device-ID": "test-device-id",
          "Gov-Client-User-IDs": "cognito=anonymous",
          "Gov-Client-Timezone": "UTC+00:00",
          "Gov-Client-Screens": "width=1920&height=1080&colour-depth=24&scaling-factor=1",
          "Gov-Client-Window-Size": "width=1920&height=1080",
          "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
          "Gov-Vendor-Version": "test-version=1.0.0",
          "Gov-Vendor-Product-Name": "test-product",
          "Gov-Vendor-Public-IP": "127.0.0.1",
          "Gov-Vendor-Forwarded": "by=127.0.0.1&for=127.0.0.1",
          "Gov-Client-Public-IP": "127.0.0.1",
          "Gov-Client-Public-IP-Timestamp": new Date().toISOString(),
          "Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-01-08T00:00:00Z&unique-reference=test",
          "Gov-Vendor-License-IDs": "diyaccounting=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
          "Gov-Client-Public-Port": "443",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.code).toBe("VALID");
      expect(data.errors).toHaveLength(0);
      expect(data.warnings).toHaveLength(0);
    });
  });

  describe("OpenAPI Specs", () => {
    it("should list available specs at /openapi", async () => {
      const response = await fetch(`${baseUrl}/openapi`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("specs");
      expect(Array.isArray(data.specs)).toBe(true);
    });
  });
});
