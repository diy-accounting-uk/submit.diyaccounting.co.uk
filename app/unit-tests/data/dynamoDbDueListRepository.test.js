// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbDueListRepository.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();

class ConditionalCheckFailedException extends Error {
  constructor(message) {
    super(message);
    this.name = "ConditionalCheckFailedException";
  }
}

function commandClass(name) {
  return class {
    constructor(params) {
      this.name = name;
      this.params = params;
    }
  };
}

const dynamoDbModule = {
  PutCommand: commandClass("Put"),
  GetCommand: commandClass("Get"),
  QueryCommand: commandClass("Query"),
  UpdateCommand: commandClass("Update"),
  BatchWriteCommand: commandClass("BatchWrite"),
};

vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const mockSubHashCandidates = vi.fn((sub) => [{ version: "v1", hashedSub: `hashed-${sub}` }]);

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn((sub) => `hashed-${sub}`),
  subHashCandidates: (sub) => mockSubHashCandidates(sub),
}));

const { putBusiness, deleteBusiness, listBusinessesAndRows, putRows, closeRow, queryJobsDue, putFeedToken, findFeedByTokenHash, rowSk } =
  await import("@app/data/dynamoDbDueListRepository.js");

const TABLE = "test-due-list-table";

// The commands of one kind the repository sent, in order.
const sent = (name) => mockSend.mock.calls.map(([command]) => command).filter((command) => command.name === name);
const batchRequests = () => sent("BatchWrite").flatMap((command) => command.params.RequestItems[TABLE]);

// Answers each Query with the stored items of the partition it asks for.
function storeHolds(items) {
  mockSend.mockImplementation(async (command) => {
    if (command.name === "Query") {
      const hashedSub = command.params.ExpressionAttributeValues[":hashedSub"];
      return { Items: items.filter((item) => item.hashedSub === hashedSub) };
    }
    return {};
  });
}

const VAT_ROW = {
  businessId: "b1",
  type: "vat-return",
  filterType: "vat",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  dueDate: "2026-11-07",
  kind: "filing",
  source: "hmrc",
  readAt: "2026-11-22T10:00:00.000Z",
};

describe("data/dynamoDbDueListRepository", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    mockSubHashCandidates.mockImplementation((sub) => [{ version: "v1", hashedSub: `hashed-${sub}` }]);
    process.env.DUE_LIST_DYNAMODB_TABLE_NAME = TABLE;
  });

  test("a row's sort key names its business, its type and its period end, or the date the user entered", () => {
    expect(rowSk(VAT_ROW)).toBe("row#b1#vat-return#2026-09-30");
    expect(rowSk({ businessId: "b2", type: "ico-fee", date: "2027-03-31" })).toBe("row#b2#ico-fee#2027-03-31");
  });

  test("putBusiness stores the business under the account's hashed sub, with the raw sub only when it names a job", async () => {
    await putBusiness("user-1", { id: "b1", kind: "vat", label: "Shop" });
    await putBusiness("user-1", {
      id: "c1",
      kind: "company",
      label: "Acme Ltd",
      companyNumber: "00000001",
      job: "refresh",
      jobOn: "2026-11-23",
    });

    const [plain, withJob] = sent("Put").map((command) => command.params);
    expect(plain.TableName).toBe(TABLE);
    expect(plain.Item).toEqual({ hashedSub: "hashed-user-1", sk: "business#b1", businessId: "b1", kind: "vat", label: "Shop" });
    expect(withJob.Item).toMatchObject({ sk: "business#c1", job: "refresh", jobOn: "2026-11-23", sub: "user-1" });
  });

  test("listBusinessesAndRows reads the account with one Query on its hashed sub", async () => {
    storeHolds([
      { hashedSub: "hashed-user-1", sk: "business#b1", kind: "vat" },
      { hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), ...VAT_ROW },
      { hashedSub: "hashed-user-1", sk: "feed", tokenHash: "abc" },
      { hashedSub: "hashed-user-2", sk: "business#x", kind: "vat" },
    ]);

    const { businesses, rows } = await listBusinessesAndRows("user-1");

    expect(sent("Query")).toHaveLength(1);
    expect(sent("Query")[0].params.KeyConditionExpression).toBe("hashedSub = :hashedSub");
    expect(businesses.map((item) => item.sk)).toEqual(["business#b1"]);
    expect(rows.map((item) => item.sk)).toEqual(["row#b1#vat-return#2026-09-30"]);
  });

  test("listBusinessesAndRows finds the account under an earlier salt version during a rotation", async () => {
    mockSubHashCandidates.mockImplementation((sub) => [
      { version: "v2", hashedSub: `new-${sub}` },
      { version: "v1", hashedSub: `hashed-${sub}` },
    ]);
    storeHolds([{ hashedSub: "hashed-user-1", sk: "business#b1", kind: "vat" }]);

    const { businesses } = await listBusinessesAndRows("user-1");

    expect(sent("Query").map((command) => command.params.ExpressionAttributeValues[":hashedSub"])).toEqual(["new-user-1", "hashed-user-1"]);
    expect(businesses).toHaveLength(1);
  });

  test("putRows refreshes only the readAt of an unchanged row, so it keeps its status and its reminder", async () => {
    const stored = {
      ...VAT_ROW,
      hashedSub: "hashed-user-1",
      sk: rowSk(VAT_ROW),
      status: "closed",
      job: "remind",
      jobOn: "2026-10-31",
      readAt: "2026-11-01T10:00:00.000Z",
    };
    storeHolds([stored]);

    const result = await putRows("user-1", [VAT_ROW]);

    expect(result).toEqual({ written: 0, refreshed: 1, removed: 0 });
    const [update] = sent("Update").map((command) => command.params);
    expect(update.Key).toEqual({ hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30" });
    expect(update.UpdateExpression).toBe("SET readAt = :readAt");
    expect(update.ExpressionAttributeValues).toEqual({ ":readAt": "2026-11-22T10:00:00.000Z" });
    expect(sent("BatchWrite")).toHaveLength(0);
  });

  test("putRows writes a row whose due date or source changed as a new open row with a ttl 90 days after its due date", async () => {
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), dueDate: "2026-11-01", status: "closed" }]);

    const result = await putRows("user-1", [VAT_ROW]);

    expect(result).toEqual({ written: 1, refreshed: 0, removed: 0 });
    const [{ PutRequest }] = batchRequests();
    expect(PutRequest.Item).toMatchObject({ hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30", status: "open" });
    expect(PutRequest.Item.ttl).toBe(Date.UTC(2027, 1, 5) / 1000);
    expect(PutRequest.Item).not.toHaveProperty("sub");
  });

  test("putRows writes a row whose source changed as a new open row", async () => {
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), source: "computed", status: "closed" }]);

    expect(await putRows("user-1", [VAT_ROW])).toEqual({ written: 1, refreshed: 0, removed: 0 });
    expect(batchRequests()[0].PutRequest.Item).toMatchObject({ source: "hmrc", status: "open" });
  });

  test("putRows writes a changed row under the salt version that holds the account's rows during a rotation", async () => {
    mockSubHashCandidates.mockImplementation((sub) => [
      { version: "v2", hashedSub: `new-${sub}` },
      { version: "v1", hashedSub: `hashed-${sub}` },
    ]);
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), dueDate: "2026-11-01" }]);

    await putRows("user-1", [VAT_ROW, { ...VAT_ROW, periodEnd: "2026-12-31" }]);

    expect(batchRequests().map((request) => request.PutRequest.Item.hashedSub)).toEqual(["hashed-user-1", "hashed-user-1"]);
  });

  test("putRows replaces the stored rows that the replace selects and that the new rows do not hold", async () => {
    const otherBusiness = { ...VAT_ROW, businessId: "b2", hashedSub: "hashed-user-1" };
    storeHolds([
      { ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW) },
      { ...VAT_ROW, periodEnd: "2026-06-30", hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-06-30" },
      { ...VAT_ROW, source: "computed", periodEnd: "2026-12-31", hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-12-31" },
      { ...otherBusiness, sk: rowSk(otherBusiness) },
    ]);

    const result = await putRows("user-1", [VAT_ROW], (row) => row.businessId === "b1");

    expect(result).toEqual({ written: 0, refreshed: 1, removed: 2 });
    expect(batchRequests().map((request) => request.DeleteRequest.Key.sk)).toEqual([
      "row#b1#vat-return#2026-06-30",
      "row#b1#vat-return#2026-12-31",
    ]);
  });

  test("putRows writes more than 25 rows in batches and sends again what DynamoDB left unprocessed", async () => {
    let first = true;
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") return { Items: [] };
      if (command.name === "BatchWrite" && first) {
        first = false;
        return { UnprocessedItems: { [TABLE]: command.params.RequestItems[TABLE].slice(0, 2) } };
      }
      return {};
    });
    const rows = Array.from({ length: 30 }, (unused, index) => ({
      ...VAT_ROW,
      periodEnd: `2026-01-${String(index + 1).padStart(2, "0")}`,
    }));

    await putRows("user-1", rows);

    expect(sent("BatchWrite").map((command) => command.params.RequestItems[TABLE].length)).toEqual([25, 2, 5]);
  });

  test("closeRow closes the row and removes its job so the reminder job no longer finds it", async () => {
    expect(await closeRow("user-1", "row#b1#vat-return#2026-09-30")).toBe(true);

    const [update] = sent("Update").map((command) => command.params);
    expect(update.Key).toEqual({ hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30" });
    expect(update.UpdateExpression).toBe("SET #status = :closed REMOVE job, jobOn, #sub");
    expect(update.ExpressionAttributeNames).toEqual({ "#status": "status", "#sub": "sub" });
    expect(update.ExpressionAttributeValues).toEqual({ ":closed": "closed" });
    expect(update.ConditionExpression).toBe("attribute_exists(sk)");
  });

  test("closeRow leaves a business, the feed pointer and a seen filing as they are", async () => {
    for (const sk of ["business#b1", "feed", "seen#01234567", undefined]) {
      expect(await closeRow("user-1", sk)).toBe(false);
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("a row with no period end and no date, no type or no business has no sort key, and putRows writes none of its rows", async () => {
    expect(() => rowSk({ businessId: "b1", type: "sa-payment-on-account" })).toThrow(/periodEnd or a date/);
    expect(() => rowSk({ businessId: "b1", periodEnd: "2026-09-30" })).toThrow(/type/);
    expect(() => rowSk({ type: "vat-return", periodEnd: "2026-09-30" })).toThrow(/businessId/);

    storeHolds([]);
    await expect(putRows("user-1", [VAT_ROW, { ...VAT_ROW, periodEnd: undefined }])).rejects.toThrow(/periodEnd or a date/);
    expect(sent("BatchWrite")).toEqual([]);
  });

  test("closeRow answers false when the account holds no such row", async () => {
    mockSend.mockRejectedValue(new ConditionalCheckFailedException("no row"));
    expect(await closeRow("user-1", "row#b1#vat-return#2026-09-30")).toBe(false);
  });

  test("deleteBusiness removes the business and its rows and no other business's", async () => {
    storeHolds([
      { hashedSub: "hashed-user-1", sk: "business#b1" },
      { hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30" },
      { hashedSub: "hashed-user-1", sk: "business#b10" },
      { hashedSub: "hashed-user-1", sk: "row#b10#vat-return#2026-09-30" },
    ]);

    expect(await deleteBusiness("user-1", "b1")).toBe(2);
    expect(batchRequests().map((request) => request.DeleteRequest.Key.sk)).toEqual(["business#b1", "row#b1#vat-return#2026-09-30"]);
  });

  test("queryJobsDue reads the job index for the job's items due on or before the date", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ sk: "a" }], LastEvaluatedKey: { sk: "a" } }).mockResolvedValueOnce({ Items: [{ sk: "b" }] });

    const items = await queryJobsDue("remind", "2026-11-22");

    expect(items).toEqual([{ sk: "a" }, { sk: "b" }]);
    const [query] = sent("Query").map((command) => command.params);
    expect(query.IndexName).toBe("job-jobOn-index");
    expect(query.KeyConditionExpression).toBe("job = :job AND jobOn <= :date");
    expect(query.ExpressionAttributeValues).toEqual({ ":job": "remind", ":date": "2026-11-22" });
    expect(sent("Query")[1].params.ExclusiveStartKey).toEqual({ sk: "a" });
  });

  test("putFeedToken stores the lookup and the account's pointer, and removes the token it replaces", async () => {
    mockSend.mockImplementation(async (command) => (command.name === "Get" ? { Item: { tokenHash: "old" } } : {}));

    await putFeedToken("user-1", "new");

    const requests = batchRequests();
    expect(requests[0].PutRequest.Item).toMatchObject({ hashedSub: "feed#new", sk: "feed", sub: "user-1" });
    expect(requests[1].PutRequest.Item).toEqual({ hashedSub: "hashed-user-1", sk: "feed", tokenHash: "new" });
    expect(requests[2].DeleteRequest.Key).toEqual({ hashedSub: "feed#old", sk: "feed" });
  });

  test("findFeedByTokenHash answers the feed's sub, or null for an unknown token", async () => {
    mockSend.mockResolvedValueOnce({ Item: { hashedSub: "feed#abc", sk: "feed", sub: "user-1", createdAt: "2026-11-22T10:00:00.000Z" } });
    expect(await findFeedByTokenHash("abc")).toEqual({ sub: "user-1", createdAt: "2026-11-22T10:00:00.000Z" });
    expect(sent("Get")[0].params.Key).toEqual({ hashedSub: "feed#abc", sk: "feed" });

    mockSend.mockResolvedValueOnce({});
    expect(await findFeedByTokenHash("unknown")).toBeNull();
  });
});
