// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/companiesHouseCacheDrop.system.test.js
// A company's cached register answers, against local Dynalite tables and the HTTP simulator: an
// accepted filing drops them, so the next read goes to Companies House, and a rejected filing
// leaves them.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startSimulator } from "../http-simulator/index.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const COMPANY = "00000001";
const USER = "cache-drop-system-user";

let simulator;
let stopDynalite;
let cachedCompaniesHouseGet;
let recordSubmissionStatus;
let putAsyncRequest;

const readProfile = () => cachedCompaniesHouseGet(COMPANY, `/company/${COMPANY}`, {}, { kind: "profile" });

async function recordOutcome(submissionNumber, statusCode) {
  const tableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  await putAsyncRequest(USER, submissionNumber, "pending", { kind: "psc-cessation", companyNumber: COMPANY }, tableName);
  const status = {
    statusCode,
    submissionNumber,
    companyNumber: COMPANY,
    rejections: statusCode === "REJECT" ? [{ rejectCode: "9999", description: "The PSC named is not on the register" }] : [],
  };
  return recordSubmissionStatus({
    userSub: USER,
    submissionNumber,
    persistedRequest: { status: "pending", data: { kind: "psc-cessation", companyNumber: COMPANY }, createdAt: new Date().toISOString() },
    status,
    kind: "psc-cessation",
  });
}

beforeAll(async () => {
  const { ensureConfiguredTablesExist } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = () => server.close();
  const endpoint = `http://${host}:${address.port}`;

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  delete process.env.ACTIVITY_BUS_NAME;
  await ensureConfiguredTablesExist(endpoint);

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  simulator = await startSimulator({ port: 0 });
  process.env.COMPANIES_HOUSE_BASE_URI = simulator.baseUrl;
  process.env.COMPANIES_HOUSE_API_KEY = "simulator-companies-house-key";
  delete process.env.COMPANIES_HOUSE_API_KEY_ARN;

  ({ cachedCompaniesHouseGet } = await import("../services/companiesHouseCache.js"));
  ({ recordSubmissionStatus } = await import("../services/companiesHouseSubmissionStatus.js"));
  ({ putAsyncRequest } = await import("../data/dynamoDbAsyncRequestRepository.js"));
});

afterAll(async () => {
  if (simulator) await simulator.stop();
  stopDynalite?.();
});

describe("a company's cached register answers after a filing, against DynamoDB", () => {
  test("a rejected filing leaves the cached profile, and an accepted one makes the next read go to Companies House", async () => {
    const first = await readProfile();
    expect(first.ok).toBe(true);
    expect(first.fromCache).toBe(false);
    expect((await readProfile()).fromCache).toBe(true);

    const rejected = await recordOutcome("SYSDROP1", "REJECT");
    expect(rejected.recorded).toBe(true);
    expect((await readProfile()).fromCache).toBe(true);

    const accepted = await recordOutcome("SYSDROP2", "ACCEPT");
    expect(accepted.recorded).toBe(true);
    expect(accepted.data.receiptId).toBeDefined();
    const afterAcceptance = await readProfile();
    expect(afterAcceptance.ok).toBe(true);
    expect(afterAcceptance.fromCache).toBe(false);
    expect(afterAcceptance.data.company_number).toBe(COMPANY);
    expect((await readProfile()).fromCache).toBe(true);
  });
});
