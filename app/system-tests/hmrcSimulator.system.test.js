// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
