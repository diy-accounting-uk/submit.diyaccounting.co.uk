// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, afterEach } from "vitest";
import { corsOriginHeaders, isAllowedCorsOrigin } from "../../lib/corsOrigins.js";

const originalEnvironmentName = process.env.ENVIRONMENT_NAME;

afterEach(() => {
  process.env.ENVIRONMENT_NAME = originalEnvironmentName;
});

describe("corsOriginHeaders", () => {
  test("reflects the prod site origin in prod", () => {
    process.env.ENVIRONMENT_NAME = "prod";
    expect(corsOriginHeaders({ Origin: "https://submit.diyaccounting.co.uk" })).toEqual({
      "Access-Control-Allow-Origin": "https://submit.diyaccounting.co.uk",
      "Vary": "Origin",
    });
  });

  test("reads the Origin header whatever its case", () => {
    process.env.ENVIRONMENT_NAME = "prod";
    expect(corsOriginHeaders({ origin: "https://submit.diyaccounting.co.uk" })["Access-Control-Allow-Origin"]).toBe(
      "https://submit.diyaccounting.co.uk",
    );
  });

  test("refuses a foreign origin", () => {
    process.env.ENVIRONMENT_NAME = "prod";
    expect(corsOriginHeaders({ Origin: "https://evil.example" })).toEqual({ Vary: "Origin" });
  });

  test("refuses a request with no Origin", () => {
    process.env.ENVIRONMENT_NAME = "prod";
    expect(corsOriginHeaders({})).toEqual({ Vary: "Origin" });
    expect(corsOriginHeaders(undefined)).toEqual({ Vary: "Origin" });
  });

  test("refuses the ci origin in prod", () => {
    process.env.ENVIRONMENT_NAME = "prod";
    expect(isAllowedCorsOrigin("https://ci-submit.diyaccounting.co.uk")).toBe(false);
  });

  test("allows the ci apex and a ci deployment host in ci", () => {
    process.env.ENVIRONMENT_NAME = "ci";
    expect(isAllowedCorsOrigin("https://ci-submit.diyaccounting.co.uk")).toBe(true);
    expect(isAllowedCorsOrigin("https://ci-set1.submit.diyaccounting.co.uk")).toBe(true);
  });

  test("refuses a deployment-shaped host in prod and a lookalike in ci", () => {
    process.env.ENVIRONMENT_NAME = "prod";
    expect(isAllowedCorsOrigin("https://ci-set1.submit.diyaccounting.co.uk")).toBe(false);
    process.env.ENVIRONMENT_NAME = "ci";
    expect(isAllowedCorsOrigin("https://ci-set1.submit.diyaccounting.co.uk.evil.example")).toBe(false);
    expect(isAllowedCorsOrigin("http://ci-set1.submit.diyaccounting.co.uk")).toBe(false);
  });

  test("allows the local origins for their environments only", () => {
    process.env.ENVIRONMENT_NAME = "proxy";
    expect(isAllowedCorsOrigin("https://local.submit.diyaccounting.co.uk:3443")).toBe(true);
    expect(isAllowedCorsOrigin("http://localhost:3000")).toBe(false);
    process.env.ENVIRONMENT_NAME = "simulator";
    expect(isAllowedCorsOrigin("http://localhost:3000")).toBe(true);
  });

  test("allows nothing when the environment is unknown", () => {
    delete process.env.ENVIRONMENT_NAME;
    expect(isAllowedCorsOrigin("https://submit.diyaccounting.co.uk")).toBe(false);
  });
});
