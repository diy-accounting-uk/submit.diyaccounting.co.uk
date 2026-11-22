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
import { ingestHandler as companiesHouseLastAccountsGetHandler } from "../functions/companies-house/companiesHouseLastAccountsGet.js";
import { ingestHandler as companiesHousePublicRegisterGetHandler } from "../functions/companies-house/companiesHousePublicRegisterGet.js";
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
    expect(body.truncated).toBe(false);
    expect(body.filings.map((filing) => filing.type)).toEqual(["AA", "CS01", "AA"]);
    expect(body.filings[2].paperFiled).toBe(true);
  });

  it("filing history answers five pages of a longer history and says it is truncated", async () => {
    const response = await companiesHouseFilingHistoryGetHandler(companyEvent("12345678"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.totalCount).toBe(621);
    expect(body.truncated).toBe(true);
    expect(body.filings).toHaveLength(500);
    expect(body.filings[0].date).toBe("2098-12-31");
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

  it("last accounts answers the micro-entity figures of 00000001's software-filed set", async () => {
    const response = await companiesHouseLastAccountsGetHandler(companyEvent("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.outcome).toBe("mapped");
    expect(body.set).toEqual(expect.objectContaining({ transactionId: "SIMTX00000001AA2098", madeUpDate: "2098-04-30" }));
    expect(body.accounts).toEqual(
      expect.objectContaining({
        regime: "micro",
        approvalDate: "2098-10-20",
        balanceSheet: expect.objectContaining({ fixedAssets: 10000, profitAndLossAccount: 9900, capitalAndReserves: 10000 }),
      }),
    );
  });

  it("last accounts answers the small company figures and profit and loss account of SC000000's set", async () => {
    const body = parseResponseBody(await companiesHouseLastAccountsGetHandler(companyEvent("SC000000")));
    expect(body.outcome).toBe("mapped");
    expect(body.accounts.regime).toBe("small");
    expect(body.accounts.balanceSheet).toEqual(
      expect.objectContaining({ stocks: 600, debtors: 3400, cashAtBank: 9000, capitalAndReserves: 15000 }),
    );
    expect(body.accounts.profitAndLoss).toEqual({ format: 1, figures: expect.objectContaining({ turnover: 60000, tax: 1000 }) });
  });

  it("last accounts answers paper for 00000003, whose last set was filed on paper", async () => {
    const body = parseResponseBody(await companiesHouseLastAccountsGetHandler(companyEvent("00000003")));
    expect(body.outcome).toBe("paper");
    expect(body.set.madeUpDate).toBe("2098-03-31");
    expect(body.accounts).toBeUndefined();
  });

  it("last accounts answers none for a company with no accounts on the register", async () => {
    const body = parseResponseBody(await companiesHouseLastAccountsGetHandler(companyEvent("12345678")));
    expect(body).toEqual({ companyNumber: "12345678", outcome: "none" });
  });

  it("last accounts answers a JSON 404 for an unknown company", async () => {
    const response = await companiesHouseLastAccountsGetHandler(companyEvent("99999999"));
    expect(response.statusCode).toBe(404);
    expect(response.headers["Content-Type"]).toBe("application/json");
  });

  function registerEvent(number) {
    const event = buildHmrcEvent({ queryStringParameters: { number } });
    event.requestContext.http.method = "GET";
    return event;
  }

  it("public register answers the profile, the current officers and the last set's iXBRL text for 00000001", async () => {
    const response = await companiesHousePublicRegisterGetHandler(registerEvent("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.profile).toEqual(
      expect.objectContaining({
        companyNumber: "00000001",
        accountsNextPeriodStart: "2098-05-01",
        accountsLastPeriodStart: "2097-05-01",
        accountsLastPeriodEnd: "2098-04-30",
        accountsLastType: "micro-entity",
      }),
    );
    expect(body.officers.map((officer) => Object.keys(officer).sort())).toEqual(
      body.officers.map(() => ["appointedOn", "name", "officerRole"]),
    );
    expect(body.officers[0]).toEqual({ name: "BRAMWELL, Eleanor", officerRole: "director", appointedOn: "2015-01-01" });
    expect(body.filedAccounts).toEqual(
      expect.objectContaining({ status: "ixbrl", madeUpDate: "2098-04-30", accountsType: "micro-entity" }),
    );
    expect(body.filedAccounts.ixbrl).toContain("ix:nonNumeric");
    expect(response.body).not.toContain("1970");
    expect(response.body).not.toContain("British");
  });

  it("public register marks a last set filed as a PDF only", async () => {
    const body = parseResponseBody(await companiesHousePublicRegisterGetHandler(registerEvent("00000003")));
    expect(body.filedAccounts).toEqual({ status: "pdf", madeUpDate: "2098-03-31", accountsType: "micro-entity", filedOn: "2098-10-14" });
  });

  it("public register marks a company with no accounts filed", async () => {
    const body = parseResponseBody(await companiesHousePublicRegisterGetHandler(registerEvent("06846849")));
    expect(body.filedAccounts).toEqual({ status: "none" });
    expect(body.officers.length).toBeGreaterThan(0);
  });

  it("public register answers a JSON 404 for an unknown company and a JSON 429 for the throttled fixture", async () => {
    expect((await companiesHousePublicRegisterGetHandler(registerEvent("99999999"))).statusCode).toBe(404);
    const throttled = await companiesHousePublicRegisterGetHandler(registerEvent("42942942"));
    expect(throttled.statusCode).toBe(429);
    expect(throttled.headers["Retry-After"]).toBe("300");
  });

  it("the simulator rejects a request with no Authorization header", async () => {
    const response = await fetch(`${simulator.baseUrl}/search/companies?q=diy`);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });
});
