// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/dueList.system.test.js
// The due list routes against a local DynamoDB: add a business, write its HMRC rows, read the list,
// close a row through a filed return, and delete the business with its rows.

import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { COUNT_SETTLE_MS } from "../lib/dueListCount.js";

const USER = "due-list-system-user";
let signedIn = USER;
vi.mock("../services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: async () => ({ userSub: signedIn }),
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
  await (await import("../test-support/dynaliteTransactions.js")).emulateTransactions();

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
    filterType: "taxes",
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
    const finalDeclaration = { type: "itsa-final-declaration", filterType: "taxes", dueDate: "2028-01-31", kind: "filing", source: "hmrc" };

    expect(
      (await routes.rows(event("POST", "/api/v1/due-list/rows", { body: { businessId: "s1", rows: [finalDeclaration] } }))).statusCode,
    ).toBe(200);

    const { rows } = bodyOf(await routes.get(event("GET", "/api/v1/due-list")));
    expect(rows.map((row) => row.sk)).toEqual(["row#s1#itsa-final-declaration#2028-01-31"]);
  });
});

describe("System: the due list's limits and removals under writes that overlap", () => {
  const putBusiness = (id, body = { kind: "vat", label: id }) =>
    routes.business(event("PUT", `/api/v1/due-list/businesses/${id}`, { pathParameters: { id }, body }));
  const deleteBusiness = (id) => routes.business(event("DELETE", `/api/v1/due-list/businesses/${id}`, { pathParameters: { id } }));
  const postRows = (businessId, rows) => routes.rows(event("POST", "/api/v1/due-list/rows", { body: { businessId, rows } }));
  const list = async () => bodyOf(await routes.get(event("GET", "/api/v1/due-list")));
  const statusCounts = (responses) =>
    responses.reduce((counts, { statusCode }) => ({ ...counts, [statusCode]: (counts[statusCode] ?? 0) + 1 }), {});
  // VAT return rows with a different period end each, from a day number.
  const vatRows = (count, firstDay) =>
    Array.from({ length: count }, (_, index) => {
      const periodEnd = new Date(Date.UTC(2027, 0, 1 + firstDay + index)).toISOString().slice(0, 10);
      return { type: "vat-return", periodEnd, dueDate: periodEnd, kind: "filing", source: "hmrc" };
    });
  let account = 0;

  beforeEach(() => {
    account += 1;
    signedIn = `due-list-overlap-user-${account}`;
  });

  test("60 businesses added at once leave 50 stored and refuse the other 10", async () => {
    const responses = await Promise.all(Array.from({ length: 60 }, (_, index) => putBusiness(`shop-${index}`)));

    expect(statusCounts(responses)).toEqual({ 200: 50, 409: 10 });
    expect((await list()).businesses).toHaveLength(50);
    expect(bodyOf(responses.find(({ statusCode }) => statusCode === 409))).toMatchObject({ reason: "due_list_full" });
  });

  test("a business replaced at the limit is stored, and a removal makes room for one more", async () => {
    for (let index = 0; index < 50; index += 1) await putBusiness(`shop-${index}`);

    expect((await putBusiness("shop-50")).statusCode).toBe(409);
    expect((await putBusiness("shop-0", { kind: "vat", label: "Renamed" })).statusCode).toBe(200);
    expect((await deleteBusiness("shop-1")).statusCode).toBe(200);
    expect((await putBusiness("shop-50")).statusCode).toBe(200);
    expect((await putBusiness("shop-51")).statusCode).toBe(409);
    expect((await list()).businesses).toHaveLength(50);
  });

  test("rows written at once for three businesses never pass 500 stored, and a refused write stores none of its rows", async () => {
    for (const id of ["a", "b", "c"]) await putBusiness(id);

    const responses = await Promise.all([postRows("a", vatRows(300, 0)), postRows("b", vatRows(300, 0)), postRows("c", vatRows(300, 0))]);

    expect(statusCounts(responses)).toEqual({ 200: 1, 409: 2 });
    expect((await list()).rows).toHaveLength(300);
    expect(bodyOf(responses.find(({ statusCode }) => statusCode === 409))).toMatchObject({ reason: "due_list_rows_full" });
  });

  test("a write that replaces a business's 500 rows with 500 others is stored, because its removals go first", async () => {
    await putBusiness("a");
    expect((await postRows("a", vatRows(500, 0))).statusCode).toBe(200);

    const response = await postRows("a", vatRows(500, 1000));

    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toMatchObject({ written: 500, removed: 500 });
    expect((await list()).rows).toHaveLength(500);
  });

  test("a list whose count item is gone, as after a salt rotation, still refuses a 51st business", async () => {
    for (let index = 0; index < 50; index += 1) await putBusiness(`shop-${index}`);
    const { getDynamoDbDocClient } = await import("../lib/dynamoDbClient.js");
    const { docClient, module } = await getDynamoDbDocClient();
    const { businesses } = await repository.listBusinessesAndRows(signedIn);
    await docClient.send(
      new module.DeleteCommand({
        TableName: process.env.DUE_LIST_DYNAMODB_TABLE_NAME,
        Key: { hashedSub: businesses[0].hashedSub, sk: "count" },
      }),
    );

    expect((await putBusiness("shop-50")).statusCode).toBe(409);
    expect((await deleteBusiness("shop-0")).statusCode).toBe(200);
    expect((await putBusiness("shop-50")).statusCode).toBe(200);
    expect((await list()).businesses).toHaveLength(50);
  });

  test("a write over the limit that would take several transactions changes nothing, removals included", async () => {
    await putBusiness("a");
    await putBusiness("b");
    expect((await postRows("a", vatRows(100, 0))).statusCode).toBe(200);
    expect((await postRows("b", vatRows(350, 0))).statusCode).toBe(200);
    const before = (await list()).rows.filter((row) => row.businessId === "a").map((row) => row.sk);

    const response = await postRows("a", vatRows(160, 1000));

    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toMatchObject({ reason: "due_list_rows_full" });
    const after = (await list()).rows;
    expect(after.filter((row) => row.businessId === "a").map((row) => row.sk)).toEqual(before);
    expect(after).toHaveLength(450);
  });

  test("rows that left without a write, as an expired row does, make room again once the count has settled", async () => {
    await putBusiness("a");
    await putBusiness("b");
    expect((await postRows("a", vatRows(500, 0))).statusCode).toBe(200);
    expect((await postRows("b", vatRows(1, 0))).statusCode).toBe(409);

    const { getDynamoDbDocClient } = await import("../lib/dynamoDbClient.js");
    const { docClient, module } = await getDynamoDbDocClient();
    const { rows } = await repository.listBusinessesAndRows(signedIn);
    for (const row of rows.slice(0, 40)) {
      await docClient.send(
        new module.DeleteCommand({ TableName: process.env.DUE_LIST_DYNAMODB_TABLE_NAME, Key: { hashedSub: row.hashedSub, sk: row.sk } }),
      );
    }
    expect((await postRows("b", vatRows(40, 0))).statusCode).toBe(409);
    // The count settles: no write has moved it for longer than any write takes.
    await docClient.send(
      new module.UpdateCommand({
        TableName: process.env.DUE_LIST_DYNAMODB_TABLE_NAME,
        Key: { hashedSub: rows[0].hashedSub, sk: "count" },
        UpdateExpression: "SET countedAt = :then",
        ExpressionAttributeValues: { ":then": Date.now() - COUNT_SETTLE_MS - 1 },
      }),
    );

    expect((await postRows("b", vatRows(40, 0))).statusCode).toBe(200);
    expect((await postRows("b", vatRows(41, 0))).statusCode).toBe(409);
    expect((await list()).rows).toHaveLength(500);
  });

  test("a business removed while its rows are being written stays removed, with no rows, and the write answers 404", async () => {
    await putBusiness("a");
    const { getDynamoDbDocClient } = await import("../lib/dynamoDbClient.js");
    const { docClient, module } = await getDynamoDbDocClient();
    const send = docClient.send;
    let removedMeanwhile = false;
    // The removal lands after the rows write has read the account's items and before it writes.
    docClient.send = async (command) => {
      const result = await send(command);
      if (!removedMeanwhile && command instanceof module.QueryCommand) {
        removedMeanwhile = true;
        expect((await deleteBusiness("a")).statusCode).toBe(200);
      }
      return result;
    };
    try {
      const response = await postRows("a", vatRows(3, 0));

      expect(removedMeanwhile).toBe(true);
      expect(response.statusCode).toBe(404);
      expect(bodyOf(response)).toMatchObject({ message: "No such business on the due list" });
      expect(await list()).toEqual({ businesses: [], rows: [] });
    } finally {
      docClient.send = send;
    }
  });

  test("a salt rotation step during a rows write keeps the write's reservation, so a second write cannot pass 500", async () => {
    await putBusiness("a");
    await putBusiness("b");
    expect((await postRows("a", vatRows(300, 0))).statusCode).toBe(200);
    const { deleteSettledRecountedItem } = await import("../../scripts/salt-rotate.js");
    const { getDynamoDbDocClient } = await import("../lib/dynamoDbClient.js");
    const { docClient, module } = await getDynamoDbDocClient();
    const { businesses } = await repository.listBusinessesAndRows(signedIn);
    const countKey = { hashedSub: businesses[0].hashedSub, sk: "count" };
    const send = docClient.send;
    let second;
    let stepRan = false;
    // Once the first write has reserved its 200 rows and before it writes them, the rotation's step on
    // the account's count runs, and a second write of 100 rows arrives.
    docClient.send = async (command) => {
      if (!stepRan && command instanceof module.BatchWriteCommand) {
        stepRan = true;
        await deleteSettledRecountedItem(
          { doc: docClient, now: () => new Date().toISOString() },
          process.env.DUE_LIST_DYNAMODB_TABLE_NAME,
          countKey,
        );
        second = await postRows("b", vatRows(100, 1000));
      }
      return send(command);
    };
    let first;
    try {
      first = await postRows("a", vatRows(500, 0));
    } finally {
      docClient.send = send;
    }

    expect(stepRan).toBe(true);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(bodyOf(second)).toMatchObject({ reason: "due_list_rows_full" });
    expect((await list()).rows).toHaveLength(500);
  });

  test("a write that reserves before a salt cutover gives its unwritten rows back to the count it reserved on", async () => {
    const { getDynamoDbDocClient } = await import("../lib/dynamoDbClient.js");
    const subHasher = await import("../services/subHasher.js");
    const { docClient, module } = await getDynamoDbDocClient();
    const table = process.env.DUE_LIST_DYNAMODB_TABLE_NAME;
    await putBusiness("a");
    expect((await postRows("a", vatRows(300, 0))).statusCode).toBe(200);
    const { businesses } = await repository.listBusinessesAndRows(signedIn);
    const earlierCountKey = { hashedSub: businesses[0].hashedSub, sk: "count" };
    const countOf = async (key) => (await docClient.send(new module.GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
    const rows = vatRows(200, 300);
    const leftUnprocessed = new Set(rows.slice(150).map((row) => row.periodEnd));
    const saltBefore = process.env.USER_SUB_HASH_SALT;

    const send = docClient.send;
    let cutOver = false;
    // Once the write has reserved its 200 rows, the salt's current version becomes v2, and DynamoDB
    // leaves the last 50 of those rows unprocessed on every attempt.
    docClient.send = async (command) => {
      if (!(command instanceof module.BatchWriteCommand)) return send(command);
      if (!cutOver) {
        cutOver = true;
        process.env.USER_SUB_HASH_SALT =
          '{"current":"v2","versions":{"v1":"test-salt-for-system-tests","v2":"second-salt-for-system-tests"}}';
        subHasher._clearSalt();
        await subHasher.initializeSalt();
      }
      const requests = command.input.RequestItems[table];
      const held = requests.filter((request) => leftUnprocessed.has(request.PutRequest?.Item?.periodEnd));
      const sent = requests.filter((request) => !held.includes(request));
      if (sent.length) await send(new module.BatchWriteCommand({ RequestItems: { [table]: sent } }));
      return { UnprocessedItems: held.length ? { [table]: held } : {} };
    };
    let response;
    try {
      response = await postRows("a", rows);
    } finally {
      docClient.send = send;
      process.env.USER_SUB_HASH_SALT = saltBefore;
      subHasher._clearSalt();
      await subHasher.initializeSalt();
    }

    expect(cutOver).toBe(true);
    // The write replaces the business's 300 stored rows with 200, of which 50 stay unwritten: the
    // count it reserved on holds the 150 stored.
    expect(bodyOf(response)).toMatchObject({ written: 150, removed: 300 });
    expect(bodyOf(response).unwritten).toHaveLength(50);
    expect((await list()).rows).toHaveLength(150);
    expect((await countOf(earlierCountKey)).rows).toBe(150);
  }, 60000);
});
