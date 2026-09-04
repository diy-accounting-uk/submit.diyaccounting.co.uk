// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/create-hmrc-test-user.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import { createHmrcTestUser, parseServiceNames } from "../../../scripts/create-hmrc-test-user.js";

describe("parseServiceNames", () => {
  test("defaults to mtd-vat when raw is undefined", () => {
    expect(parseServiceNames(undefined)).toEqual(["mtd-vat"]);
  });

  test("defaults to mtd-vat when raw is blank", () => {
    expect(parseServiceNames("")).toEqual(["mtd-vat"]);
    expect(parseServiceNames("   ")).toEqual(["mtd-vat"]);
  });

  test("splits a comma-separated list", () => {
    expect(parseServiceNames("mtd-vat,mtd-income-tax")).toEqual(["mtd-vat", "mtd-income-tax"]);
  });

  test("trims whitespace around each entry", () => {
    expect(parseServiceNames(" mtd-vat , mtd-income-tax ")).toEqual(["mtd-vat", "mtd-income-tax"]);
  });

  test("throws on an empty entry", () => {
    expect(() => parseServiceNames("mtd-vat,,mtd-income-tax")).toThrow(/empty entry/);
  });

  test("throws on a name outside the allowed list", () => {
    expect(() => parseServiceNames("mtd-vat,not-a-service")).toThrow(/not-a-service/);
  });
});

describe("createHmrcTestUser", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("HMRC_SANDBOX_BASE_URI", "https://test-api.example.test");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  function stubFetchSequence(organisationsResponseBody) {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "test-token" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => organisationsResponseBody,
    });
    global.fetch = mockFetch;
    return mockFetch;
  }

  test("sends only mtd-vat in the request body by default", async () => {
    const mockFetch = stubFetchSequence({ vrn: "999999999" });

    await createHmrcTestUser("client-id", "client-secret");

    const organisationsCall = mockFetch.mock.calls[1];
    expect(organisationsCall[0]).toBe("https://test-api.example.test/create-test-user/organisations");
    expect(JSON.parse(organisationsCall[1].body)).toEqual({ serviceNames: ["mtd-vat"] });
  });

  test("sends both service names when both are requested", async () => {
    const mockFetch = stubFetchSequence({ vrn: "999999999", nino: "AB123456C" });

    await createHmrcTestUser("client-id", "client-secret", { serviceNames: ["mtd-vat", "mtd-income-tax"] });

    const organisationsCall = mockFetch.mock.calls[1];
    expect(JSON.parse(organisationsCall[1].body)).toEqual({ serviceNames: ["mtd-vat", "mtd-income-tax"] });
  });

  test("returns the vrn and nino from the HMRC response", async () => {
    stubFetchSequence({ vrn: "999999999", nino: "AB123456C" });

    const testUser = await createHmrcTestUser("client-id", "client-secret", { serviceNames: ["mtd-vat", "mtd-income-tax"] });

    expect(testUser.vrn).toBe("999999999");
    expect(testUser.nino).toBe("AB123456C");
  });

  test("leaves nino undefined when HMRC does not return one", async () => {
    stubFetchSequence({ vrn: "999999999" });

    const testUser = await createHmrcTestUser("client-id", "client-secret");

    expect(testUser.vrn).toBe("999999999");
    expect(testUser.nino).toBeUndefined();
  });
});
