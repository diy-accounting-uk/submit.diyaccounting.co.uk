// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/dueList.system.test.js
// The due list routes against a local DynamoDB: add a business, write its HMRC rows, read the list,
// close a row through a filed return, and delete the business with its rows.

import { describe, test, expect, vi, beforeAll, afterAll } from "vitest";

const USER = "due-list-system-user";
vi.mock("../services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: async () => ({ userSub: USER }),
}));

let stopDynalite;
let routes;
let repository;

function event(method, path, { pathParameters = {}, body } = {}) {
  return {
    requestContext: { http: { method, path } },
    pathParameters,
    headers: { "host": "localhost", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}
const bodyOf = (response) => JSON.parse(response.body);

beforeAll(async () => {
  const { ensureDueListTableExists } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");
  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = async () => server.close();
  const endpoint = `http://${host}:${address.port}`;

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.DUE_LIST_DYNAMODB_TABLE_NAME = "system-test-due-list";
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';
  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();
  await ensureDueListTableExists(process.env.DUE_LIST_DYNAMODB_TABLE_NAME, endpoint);

  routes = {
    get: (await import("../functions/account/dueListGet.js")).ingestHandler,
    business: (await import("../functions/account/dueListBusinessPut.js")).ingestHandler,
    rows: (await import("../functions/account/dueListRowsPost.js")).ingestHandler,
  };
  repository = await import("../data/dynamoDbDueListRepository.js");
});

afterAll(async () => {
  await stopDynalite?.();
});

describe("System: the due list against DynamoDB", () => {
  const VAT_ROW = {
    type: "vat-return",
    filterType: "vat",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    dueDate: "2026-11-07",
    kind: "filing",
    source: "hmrc",
  };

  test("adds a business, writes its HMRC rows, reads them, closes the filed period and deletes the business with its rows", async () => {
    const added = await routes.business(
      event("PUT", "/api/v1/due-list/businesses/v1", { pathParameters: { id: "v1" }, body: { kind: "vat", label: "Shop" } }),
    );
    expect(added.statusCode).toBe(200);

    const written = await routes.rows(
      event("POST", "/api/v1/due-list/rows", {
        body: {
          businessId: "v1",
          rows: [VAT_ROW, { ...VAT_ROW, periodStart: "2026-10-01", periodEnd: "2026-12-31", dueDate: "2027-02-07" }],
        },
      }),
    );
    expect(written.statusCode).toBe(200);
    expect(bodyOf(written)).toMatchObject({ written: 2, refreshed: 0, removed: 0 });

    const read = bodyOf(await routes.get(event("GET", "/api/v1/due-list")));
    expect(read.businesses).toEqual([
      expect.objectContaining({ businessId: "v1", kind: "vat", label: "Shop", hmrcReadAt: expect.any(String) }),
    ]);
    expect(read.rows.map((row) => [row.periodEnd, row.status])).toEqual([
      ["2026-09-30", "open"],
      ["2026-12-31", "open"],
    ]);
    expect(read.rows[0]).not.toHaveProperty("ttl");

    expect(await repository.closeVatReturnRow(USER, "2026-09-30")).toEqual({ matched: 1, closed: true });

    const again = await routes.rows(event("POST", "/api/v1/due-list/rows", { body: { businessId: "v1", rows: [VAT_ROW] } }));
    expect(bodyOf(again)).toMatchObject({ written: 0, refreshed: 1, removed: 1 });
    const afterClose = bodyOf(await routes.get(event("GET", "/api/v1/due-list")));
    expect(afterClose.rows).toEqual([expect.objectContaining({ periodEnd: "2026-09-30", status: "closed" })]);

    const removed = await routes.business(event("DELETE", "/api/v1/due-list/businesses/v1", { pathParameters: { id: "v1" } }));
    expect(bodyOf(removed)).toMatchObject({ removed: 2 });
    expect(bodyOf(await routes.get(event("GET", "/api/v1/due-list")))).toEqual({ businesses: [], rows: [] });
  });

  test("stores a row with no period end under its due date", async () => {
    await routes.business(
      event("PUT", "/api/v1/due-list/businesses/s1", {
        pathParameters: { id: "s1" },
        body: { kind: "sole-trader", label: "Me", itsa: true },
      }),
    );
    const finalDeclaration = { type: "itsa-final-declaration", filterType: "itsa", dueDate: "2028-01-31", kind: "filing", source: "hmrc" };

    expect(
      (await routes.rows(event("POST", "/api/v1/due-list/rows", { body: { businessId: "s1", rows: [finalDeclaration] } }))).statusCode,
    ).toBe(200);

    const { rows } = bodyOf(await routes.get(event("GET", "/api/v1/due-list")));
    expect(rows.map((row) => row.sk)).toEqual(["row#s1#itsa-final-declaration#2028-01-31"]);
  });
});
