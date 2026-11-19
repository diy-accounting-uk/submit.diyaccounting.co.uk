// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/companiesHouseFinalStatusClaim.system.test.js
// The claim on a Companies House final status, run against a local Dynalite table so the
// conditional update's string comparison of claim times is evaluated by DynamoDB itself.

import { describe, test, expect, beforeAll, afterAll } from "vitest";

const tableName = "companies-house-async-requests-system-test";
let stopDynalite;
let claimFinalStatus;
let releaseFinalStatus;
let staleMinutes;

beforeAll(async () => {
  const { ensureAsyncRequestsTableExists } = await import("../bin/dynamodb.js");
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
  process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = tableName;

  await ensureAsyncRequestsTableExists(tableName, endpoint);

  const repository = await import("../data/dynamoDbCompaniesHouseFilingStateRepository.js");
  claimFinalStatus = repository.claimFinalStatus;
  releaseFinalStatus = repository.releaseFinalStatus;
  staleMinutes = repository.FINAL_STATUS_CLAIM_STALE_MINUTES;
});

afterAll(() => stopDynalite?.());

describe("claimFinalStatus against DynamoDB", () => {
  test("a claim held within the stale limit refuses a second claim, and one past it is taken", async () => {
    const claimedAt = new Date("2026-11-19T10:00:00.000Z");
    expect(await claimFinalStatus("SYS001", { now: claimedAt })).toBe(true);

    const withinLimit = new Date(claimedAt.getTime() + (staleMinutes - 1) * 60 * 1000);
    expect(await claimFinalStatus("SYS001", { now: withinLimit })).toBe(false);

    const pastLimit = new Date(claimedAt.getTime() + (staleMinutes + 1) * 60 * 1000);
    expect(await claimFinalStatus("SYS001", { now: pastLimit })).toBe(true);
    expect(await claimFinalStatus("SYS001", { now: new Date(pastLimit.getTime() + 60 * 1000) })).toBe(false);
  });

  test("a released claim can be taken at once", async () => {
    const now = new Date("2026-11-19T11:00:00.000Z");
    expect(await claimFinalStatus("SYS002", { now })).toBe(true);
    await releaseFinalStatus("SYS002");
    expect(await claimFinalStatus("SYS002", { now })).toBe(true);
  });
});
