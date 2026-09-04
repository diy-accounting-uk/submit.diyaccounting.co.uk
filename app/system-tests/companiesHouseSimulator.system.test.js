// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/companiesHouseSimulator.system.test.js
// System tests for the Companies House Lambdas against the HTTP simulator. No network.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startSimulator } from "../http-simulator/index.js";
import { ingestHandler as companiesHouseSearchGetHandler } from "../functions/companies-house/companiesHouseSearchGet.js";
import { ingestHandler as companiesHouseCompanyGetHandler } from "../functions/companies-house/companiesHouseCompanyGet.js";
import { buildHmrcEvent } from "../test-helpers/eventBuilders.js";
import { parseResponseBody } from "../test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let simulator;
let stopDynalite;

function searchEvent(q, extraQuery = {}) {
  const event = buildHmrcEvent({ queryStringParameters: { q, ...extraQuery } });
  event.requestContext.http.method = "GET";
  return event;
}

function companyEvent(companyNumber) {
  const event = buildHmrcEvent({ pathParameters: { companyNumber } });
  event.requestContext.http.method = "GET";
  return event;
}

describe("System: Companies House Simulator", () => {
  beforeAll(async () => {
    const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
    const { default: dynalite } = await import("dynalite");

    const host = "127.0.0.1";
    const bundleTableName = "test-bundle-table";

    const server = dynalite({ createTableMs: 0 });
    const actualPort = await new Promise((resolve, reject) => {
      server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address().port)));
    });
    stopDynalite = async () => {
      try {
        server.close();
      } catch {}
    };
    const endpoint = `http://${host}:${actualPort}`;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundleTableName;

    const { initializeSalt } = await import("../services/subHasher.js");
    await initializeSalt();

    await ensureBundleTableExists(bundleTableName, endpoint);

    simulator = await startSimulator({ port: 0 });
    process.env.COMPANIES_HOUSE_BASE_URI = simulator.baseUrl;
    process.env.COMPANIES_HOUSE_API_KEY = "simulator-companies-house-key";
    delete process.env.COMPANIES_HOUSE_API_KEY_ARN;
  });

  afterAll(async () => {
    if (simulator) await simulator.stop();
    try {
      await stopDynalite?.();
    } catch {}
  });

  it("search returns the fixture company for a name fragment", async () => {
    const response = await companiesHouseSearchGetHandler(searchEvent("DIY Accounting"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.items.some((item) => item.companyNumber === "06846849")).toBe(true);
    expect(body.items.some((item) => item.title === "DIY ACCOUNTING LIMITED")).toBe(true);
  });

  it("search paginates with start index and items per page", async () => {
    const response = await companiesHouseSearchGetHandler(searchEvent("SIMULATOR", { itemsPerPage: "1", startIndex: "1" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.items).toHaveLength(1);
    expect(body.startIndex).toBe(1);
    expect(body.itemsPerPage).toBe(1);
  });

  it("profile returns DIY Accounting Limited for 06846849", async () => {
    const response = await companiesHouseCompanyGetHandler(companyEvent("06846849"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.companyName).toBe("DIY ACCOUNTING LIMITED");
    expect(body.companyStatus).toBe("active");
  });

  it("profile returns 404 for an unknown company number", async () => {
    const response = await companiesHouseCompanyGetHandler(companyEvent("99999999"));
    expect(response.statusCode).toBe(404);
  });

  it("profile returns 429 with Retry-After for the throttled fixture number", async () => {
    const response = await companiesHouseCompanyGetHandler(companyEvent("42942942"));
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  it("the simulator rejects a request with no Authorization header", async () => {
    const response = await fetch(`${simulator.baseUrl}/search/companies?q=diy`);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });
});
