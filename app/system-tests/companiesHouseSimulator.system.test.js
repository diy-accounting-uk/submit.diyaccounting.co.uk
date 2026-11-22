// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/companiesHouseSimulator.system.test.js
// System tests for the Companies House Lambdas against the HTTP simulator. No network.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startSimulator } from "../http-simulator/index.js";
import { ingestHandler as companiesHouseSearchGetHandler } from "../functions/companies-house/companiesHouseSearchGet.js";
import { ingestHandler as companiesHouseCompanyGetHandler } from "../functions/companies-house/companiesHouseCompanyGet.js";
import { ingestHandler as companiesHouseFilingHistoryGetHandler } from "../functions/companies-house/companiesHouseFilingHistoryGet.js";
import { ingestHandler as companiesHouseFiledAccountsGetHandler } from "../functions/companies-house/companiesHouseFiledAccountsGet.js";
import { ingestHandler as companiesHouseFiledDocumentGetHandler } from "../functions/companies-house/companiesHouseFiledDocumentGet.js";
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

function companyEvent(companyNumber, extraPathParameters = {}) {
  const event = buildHmrcEvent({ pathParameters: { companyNumber, ...extraPathParameters } });
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
    process.env.COMPANIES_HOUSE_DOCUMENT_BASE_URI = simulator.baseUrl;
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
    const response = await companiesHouseSearchGetHandler(searchEvent("Simulator Example"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.items.some((item) => item.companyNumber === "00000001")).toBe(true);
    expect(body.items.some((item) => item.title === "SIMULATOR EXAMPLE COMPANY LIMITED")).toBe(true);
  });

  it("search paginates with start index and items per page", async () => {
    const response = await companiesHouseSearchGetHandler(searchEvent("SIMULATOR", { itemsPerPage: "1", startIndex: "1" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.items).toHaveLength(1);
    expect(body.startIndex).toBe(1);
    expect(body.itemsPerPage).toBe(1);
  });

  it("profile returns the example company for 00000001", async () => {
    const response = await companiesHouseCompanyGetHandler(companyEvent("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.companyName).toBe("SIMULATOR EXAMPLE COMPANY LIMITED");
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

  it("profile answers the accounting reference date, the next period start and the last accounts", async () => {
    const body = parseResponseBody(await companiesHouseCompanyGetHandler(companyEvent("00000001")));
    expect(body.accountingReferenceDate).toEqual({ day: "30", month: "04" });
    expect(body.accountsNextPeriodStart).toBe("2098-05-01");
    expect(body.accountsLastPeriodStart).toBe("2097-05-01");
    expect(body.accountsLastPeriodEnd).toBe("2098-04-30");
    expect(body.accountsLastType).toBe("micro-entity");
  });

  it("filing history lists every category of filing, newest first", async () => {
    const response = await companiesHouseFilingHistoryGetHandler(companyEvent("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.totalCount).toBe(3);
    expect(body.filings.map((filing) => filing.type)).toEqual(["AA", "CS01", "AA"]);
    expect(body.filings[2].paperFiled).toBe(true);
  });

  it("filing history returns 404 for an unknown company number", async () => {
    const response = await companiesHouseFilingHistoryGetHandler(companyEvent("99999999"));
    expect(response.statusCode).toBe(404);
  });

  it("filed accounts lists the software-filed set with an iXBRL document and the paper set without", async () => {
    const response = await companiesHouseFiledAccountsGetHandler(companyEvent("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.filedAccounts).toEqual([
      expect.objectContaining({
        transactionId: "SIMTX00000001AA2098",
        madeUpDate: "2098-04-30",
        accountsType: "micro-entity",
        ixbrl: true,
      }),
      expect.objectContaining({
        transactionId: "SIMTX00000001AA2097",
        madeUpDate: "2097-04-30",
        accountsType: "total-exemption-full",
        paperFiled: true,
        ixbrl: false,
      }),
    ]);
  });

  it("filed accounts document answers the iXBRL text of a software-filed set", async () => {
    const response = await companiesHouseFiledDocumentGetHandler(companyEvent("00000001", { transactionId: "SIMTX00000001AA2098" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.contentType).toBe("application/xhtml+xml");
    expect(body.document).toContain("SIMULATOR EXAMPLE COMPANY LIMITED");
    expect(body.document).toContain("ix:nonNumeric");
  });

  it("filed accounts document answers a JSON 404 for a paper-filed set", async () => {
    const response = await companiesHouseFiledDocumentGetHandler(companyEvent("00000001", { transactionId: "SIMTX00000001AA2097" }));
    expect(response.statusCode).toBe(404);
    expect(parseResponseBody(response).code).toBe("NO_IXBRL_DOCUMENT");
  });

  it("the simulator rejects a request with no Authorization header", async () => {
    const response = await fetch(`${simulator.baseUrl}/search/companies?q=diy`);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });
});
