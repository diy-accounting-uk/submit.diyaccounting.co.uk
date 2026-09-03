// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/create-hmrc-test-user.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { createHmrcTestUser, parseServiceNames } from "../../../scripts/create-hmrc-test-user.js";

describe("scripts/create-hmrc-test-user", () => {
  describe("parseServiceNames", () => {
    test("defaults to mtd-vat when the value is empty", () => {
      expect(parseServiceNames(undefined)).toEqual(["mtd-vat"]);
      expect(parseServiceNames(null)).toEqual(["mtd-vat"]);
      expect(parseServiceNames("")).toEqual(["mtd-vat"]);
      expect(parseServiceNames("   ")).toEqual(["mtd-vat"]);
    });

    test("splits and trims a comma-separated list", () => {
      expect(parseServiceNames("mtd-vat,mtd-income-tax")).toEqual(["mtd-vat", "mtd-income-tax"]);
      expect(parseServiceNames(" mtd-vat , mtd-income-tax ")).toEqual(["mtd-vat", "mtd-income-tax"]);
    });

    test("rejects an empty entry", () => {
      expect(() => parseServiceNames("mtd-vat,,mtd-income-tax")).toThrow(/empty entry/);
    });

    test("rejects an unknown service name", () => {
      expect(() => parseServiceNames("mtd-vat,not-a-real-service")).toThrow(/Unknown HMRC service name "not-a-real-service"/);
    });
  });

  describe("createHmrcTestUser", () => {
    let mockFetch;

    beforeEach(() => {
      vi.resetAllMocks();
      mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      // 1st call: OAuth2 token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ access_token: "test-access-token" }),
      });
      // 2nd call: create-test-user request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        json: () =>
          Promise.resolve({
            userId: "123456789012",
            password: "test-password",
            userFullName: "Test User",
            emailAddress: "test@example.com",
            organisationDetails: { name: "Test Org", address: { line1: "1 Test Street", postcode: "AA1 1AA" } },
            vrn: "999999999",
            nino: "AB123456C",
          }),
      });
    });

    test("requests only mtd-vat by default", async () => {
      await createHmrcTestUser("client-id", "client-secret");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [createUserUrl, createUserRequest] = mockFetch.mock.calls[1];
      expect(createUserUrl).toMatch(/\/create-test-user\/organisations$/);
      expect(JSON.parse(createUserRequest.body)).toEqual({ serviceNames: ["mtd-vat"] });
    });

    test("requests both services when both are named", async () => {
      const serviceNames = parseServiceNames("mtd-vat,mtd-income-tax");

      await createHmrcTestUser("client-id", "client-secret", { serviceNames });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, createUserRequest] = mockFetch.mock.calls[1];
      expect(JSON.parse(createUserRequest.body)).toEqual({ serviceNames: ["mtd-vat", "mtd-income-tax"] });
    });

    test("returns the vrn and nino from the HMRC response", async () => {
      const testUser = await createHmrcTestUser("client-id", "client-secret", {
        serviceNames: parseServiceNames("mtd-vat,mtd-income-tax"),
      });

      expect(testUser.vrn).toBe("999999999");
      expect(testUser.nino).toBe("AB123456C");
    });
  });
});
