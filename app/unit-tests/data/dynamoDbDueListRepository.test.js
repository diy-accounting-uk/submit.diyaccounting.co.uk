// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbDueListRepository.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
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
  DeleteCommand: commandClass("Delete"),
};

vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

const mockSubHashCandidates = vi.fn((sub) => [{ version: "v1", hashedSub: `hashed-${sub}` }]);

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: (sub) => mockSubHashCandidates(sub)[0].hashedSub,
  subHashCandidates: (sub) => mockSubHashCandidates(sub),
}));

const {
  putBusiness,
  deleteBusiness,
  listBusinessesAndRows,
  putRows,
  closeRow,
  closeVatReturnRow,
  queryJobsDue,
  putFeedToken,
  findFeedByTokenHash,
  rowSk,
} = await import("@app/data/dynamoDbDueListRepository.js");

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
    if (command.name === "Delete") {
      const { hashedSub, sk } = command.params.Key;
      const stored = items.find((item) => item.hashedSub === hashedSub && item.sk === sk);
      return stored ? { Attributes: stored } : {};
    }
    return {};
  });
}

// A salt rotation in progress: the current version hashes to new-<sub>, the earlier one to hashed-<sub>.
function saltRotationInProgress() {
  mockSubHashCandidates.mockImplementation((sub) => [
    { version: "v2", hashedSub: `new-${sub}` },
    { version: "v1", hashedSub: `hashed-${sub}` },
  ]);
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

    expect(result).toEqual({ written: 0, refreshed: 1, removed: 0, unwritten: [] });
    const [update] = sent("Update").map((command) => command.params);
    expect(update.Key).toEqual({ hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30" });
    expect(update.UpdateExpression).toBe("SET readAt = :readAt");
    expect(update.ExpressionAttributeValues).toEqual({ ":readAt": "2026-11-22T10:00:00.000Z" });
    expect(sent("BatchWrite")).toHaveLength(0);
  });

  test("putRows writes a row whose due date or source changed as a new open row with a ttl 90 days after its due date", async () => {
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), dueDate: "2026-11-01", status: "closed" }]);

    const result = await putRows("user-1", [VAT_ROW]);

    expect(result).toEqual({ written: 1, refreshed: 0, removed: 0, unwritten: [] });
    const [{ PutRequest }] = batchRequests();
    expect(PutRequest.Item).toMatchObject({ hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30", status: "open" });
    expect(PutRequest.Item.ttl).toBe(Date.UTC(2027, 1, 5) / 1000);
    expect(PutRequest.Item).not.toHaveProperty("sub");
  });

  test("putRows writes a row whose source changed as a new open row", async () => {
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), source: "computed", status: "closed" }]);

    expect(await putRows("user-1", [VAT_ROW])).toEqual({ written: 1, refreshed: 0, removed: 0, unwritten: [] });
    expect(batchRequests()[0].PutRequest.Item).toMatchObject({ source: "hmrc", status: "open" });
  });

  test("putRows during a rotation rewrites a changed row where it sits and writes a new row under the current salt version", async () => {
    saltRotationInProgress();
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), dueDate: "2026-11-01" }]);

    await putRows("user-1", [VAT_ROW, { ...VAT_ROW, periodEnd: "2026-12-31" }]);

    expect(batchRequests().map((request) => request.PutRequest.Item.hashedSub)).toEqual(["hashed-user-1", "new-user-1"]);
  });

  test("a business added during a rotation hides none of the account's older items", async () => {
    saltRotationInProgress();
    const stored = [
      { hashedSub: "hashed-user-1", sk: "business#b1", kind: "company" },
      { hashedSub: "hashed-user-1", sk: "row#b1#accounts#2026-03-31", dueDate: "2026-12-31" },
    ];
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Put") stored.push(command.params.Item);
      if (command.name === "Query") {
        return { Items: stored.filter((item) => item.hashedSub === command.params.ExpressionAttributeValues[":hashedSub"]) };
      }
      return {};
    });

    await putBusiness("user-1", { id: "b2", kind: "vat", label: "Acme VAT" });
    const { businesses, rows } = await listBusinessesAndRows("user-1");

    expect(businesses.map((business) => [business.hashedSub, business.sk])).toEqual([
      ["new-user-1", "business#b2"],
      ["hashed-user-1", "business#b1"],
    ]);
    expect(rows).toHaveLength(1);
  });

  test("an item held under both salt versions is read once, from the current version", async () => {
    saltRotationInProgress();
    storeHolds([
      { hashedSub: "hashed-user-1", sk: "business#b1", label: "before the move" },
      { hashedSub: "new-user-1", sk: "business#b1", label: "after the move" },
    ]);

    expect((await listBusinessesAndRows("user-1")).businesses).toEqual([
      { hashedSub: "new-user-1", sk: "business#b1", label: "after the move" },
    ]);
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

    expect(result).toEqual({ written: 0, refreshed: 1, removed: 2, unwritten: [] });
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

  describe("a table that keeps leaving items unprocessed", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // Leaves the last row of every batch unprocessed, and records when each batch was sent.
    function tableLeavesLastRowUnprocessed(storedItems = []) {
      const sentAt = [];
      mockSend.mockImplementation(async (command) => {
        if (command.name === "Query") return { Items: storedItems };
        if (command.name !== "BatchWrite") return {};
        sentAt.push(Date.now());
        return { UnprocessedItems: { [TABLE]: command.params.RequestItems[TABLE].slice(-1) } };
      });
      return sentAt;
    }

    test("putRows sends a batch at most five times, waits twice as long each time, and names the rows it could not write", async () => {
      const sentAt = tableLeavesLastRowUnprocessed();
      const rows = [VAT_ROW, { ...VAT_ROW, periodEnd: "2026-12-31" }];

      const pending = putRows("user-1", rows);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(sent("BatchWrite").map((command) => command.params.RequestItems[TABLE].length)).toEqual([2, 1, 1, 1, 1]);
      expect(sentAt.slice(1).map((time, index) => time - sentAt[index])).toEqual([50, 100, 200, 400]);
      expect(result).toEqual({ written: 1, refreshed: 0, removed: 0, unwritten: ["row#b1#vat-return#2026-12-31"] });
    });

    test("deleteBusiness fails when an item of the business could not be removed", async () => {
      tableLeavesLastRowUnprocessed([
        { hashedSub: "hashed-user-1", sk: "business#b1" },
        { hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2026-09-30" },
      ]);

      const pending = deleteBusiness("user-1", "b1").catch((error) => error);
      await vi.runAllTimersAsync();

      expect((await pending).message).toBe("1 of the business's 2 due list items could not be removed");
    });

    test("putFeedToken fails when the lookup or the pointer could not be written", async () => {
      tableLeavesLastRowUnprocessed();

      const pending = putFeedToken("user-1", "token-hash").catch((error) => error);
      await vi.runAllTimersAsync();

      expect((await pending).message).toMatch(/could not be written/);
    });
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
    // The business goes on its own first, so a rows write that lands afterwards finds it gone.
    expect(sent("Delete").map((command) => command.params.Key.sk)).toEqual(["business#b1"]);
    expect(batchRequests().map((request) => request.DeleteRequest.Key.sk)).toEqual(["row#b1#vat-return#2026-09-30"]);
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
    storeHolds([{ hashedSub: "hashed-user-1", sk: "feed", tokenHash: "old" }]);

    await putFeedToken("user-1", "new");

    const requests = batchRequests();
    expect(requests[0].PutRequest.Item).toMatchObject({ hashedSub: "feed#new", sk: "feed", sub: "user-1" });
    expect(requests[1].PutRequest.Item).toEqual({ hashedSub: "hashed-user-1", sk: "feed", tokenHash: "new" });
    expect(requests[2].DeleteRequest.Key).toEqual({ hashedSub: "feed#old", sk: "feed" });
    expect(requests).toHaveLength(3);
  });

  test("putFeedToken during a rotation removes the earlier token and its pointer under the earlier salt version", async () => {
    saltRotationInProgress();
    storeHolds([{ hashedSub: "hashed-user-1", sk: "feed", tokenHash: "old" }]);

    await putFeedToken("user-1", "new");

    const requests = batchRequests();
    expect(requests[1].PutRequest.Item).toEqual({ hashedSub: "new-user-1", sk: "feed", tokenHash: "new" });
    expect(requests.slice(2).map((request) => request.DeleteRequest.Key)).toEqual([
      { hashedSub: "feed#old", sk: "feed" },
      { hashedSub: "hashed-user-1", sk: "feed" },
    ]);
  });

  test("findFeedByTokenHash answers the feed's sub, or null for an unknown token", async () => {
    mockSend.mockResolvedValueOnce({ Item: { hashedSub: "feed#abc", sk: "feed", sub: "user-1", createdAt: "2026-11-22T10:00:00.000Z" } });
    expect(await findFeedByTokenHash("abc")).toEqual({ sub: "user-1", createdAt: "2026-11-22T10:00:00.000Z" });
    expect(sent("Get")[0].params.Key).toEqual({ hashedSub: "feed#abc", sk: "feed" });

    mockSend.mockResolvedValueOnce({});
    expect(await findFeedByTokenHash("unknown")).toBeNull();
  });

  test("closeVatReturnRow closes the one open VAT return row with that period end", async () => {
    storeHolds([
      { ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), type: "vat-return", status: "open" },
      {
        ...VAT_ROW,
        hashedSub: "hashed-user-1",
        sk: "row#b1#vat-return#2026-06-30",
        type: "vat-return",
        periodEnd: "2026-06-30",
        status: "open",
      },
    ]);

    expect(await closeVatReturnRow("user-1", "2026-09-30")).toEqual({ matched: 1, closed: true });
    expect(sent("Update").map((command) => command.params.Key.sk)).toEqual(["row#b1#vat-return#2026-09-30"]);
  });

  test("closeVatReturnRow leaves two matching rows open for the next HMRC read", async () => {
    const other = { ...VAT_ROW, businessId: "b2", type: "vat-return", status: "open" };
    storeHolds([
      { ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), type: "vat-return", status: "open" },
      { ...other, hashedSub: "hashed-user-1", sk: rowSk(other) },
    ]);

    expect(await closeVatReturnRow("user-1", "2026-09-30")).toEqual({ matched: 2, closed: false });
    expect(sent("Update")).toHaveLength(0);
  });

  test("closeVatReturnRow closes nothing when no open row matches", async () => {
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), type: "vat-return", status: "closed" }]);

    expect(await closeVatReturnRow("user-1", "2026-09-30")).toEqual({ matched: 0, closed: false });
    expect(sent("Update")).toHaveLength(0);
  });
});

describe("data/dynamoDbDueListRepository limits", () => {
  const COUNT_KEY = { hashedSub: "hashed-user-1", sk: "count" };
  const countUpdates = () =>
    sent("Update")
      .map((command) => command.params)
      .filter((update) => update.Key.sk === "count");
  const rowsOf = (count) =>
    Array.from({ length: count }, (unused, index) => ({
      ...VAT_ROW,
      periodEnd: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    }));

  // A store whose count item refuses a reservation; the count read and the items are as given.
  function countRefuses({ count, items = [] }) {
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") return { Items: items };
      if (command.name === "Get") return { Item: count };
      if (
        command.name === "Update" &&
        command.params.UpdateExpression.startsWith("ADD") &&
        command.params.ConditionExpression.includes(":room")
      ) {
        throw new ConditionalCheckFailedException("no room");
      }
      return {};
    });
  }

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    mockSubHashCandidates.mockImplementation((sub) => [{ version: "v1", hashedSub: `hashed-${sub}` }]);
    process.env.DUE_LIST_DYNAMODB_TABLE_NAME = TABLE;
  });

  test("putRows reserves the rows a write adds beyond those it removes on the count, with room under the cap, before any write", async () => {
    storeHolds([{ ...VAT_ROW, hashedSub: "hashed-user-1", sk: "row#b1#vat-return#2025-12-31", periodEnd: "2025-12-31" }]);

    await putRows("user-1", rowsOf(3), (row) => row.businessId === "b1");

    const [reservation] = countUpdates();
    expect(reservation).toMatchObject({
      Key: COUNT_KEY,
      UpdateExpression: "ADD #counted :change SET countedAt = :now",
      ConditionExpression: "attribute_exists(#counted) AND #counted <= :room",
      ExpressionAttributeNames: { "#counted": "rows" },
      ExpressionAttributeValues: { ":change": 2, ":room": 498 },
    });
    const order = mockSend.mock.calls.map(([command]) => command.name);
    expect(order.indexOf("Update")).toBeLessThan(order.indexOf("BatchWrite"));
  });

  test("putRows refuses a write the count has no room for, when the count agrees, and writes nothing", async () => {
    countRefuses({
      count: { ...COUNT_KEY, businesses: 1, rows: 499, countedAt: 0 },
      items: rowsOf(499).map((row, index) => ({ ...row, hashedSub: "hashed-user-1", sk: `row#b2#x#${index}` })),
    });

    await expect(putRows("user-1", rowsOf(2))).rejects.toMatchObject({ name: "DueListFullError", counted: "rows" });
    expect(sent("BatchWrite")).toHaveLength(0);
  });

  test("a count moved within the settle window is kept by a recount, because another write's rows may be on their way", async () => {
    countRefuses({ count: { ...COUNT_KEY, businesses: 1, rows: 499, countedAt: Date.now() } });

    await expect(putRows("user-1", rowsOf(2))).rejects.toMatchObject({ name: "DueListFullError" });
    expect(sent("Query").filter((command) => command.params.ConsistentRead)).toHaveLength(1);
    expect(countUpdates().filter((update) => update.UpdateExpression.startsWith("SET"))).toHaveLength(0);
  });

  test("putRows gives back to the count the rows DynamoDB left unwritten", async () => {
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") return { Items: [] };
      if (command.name === "BatchWrite") return { UnprocessedItems: { [TABLE]: command.params.RequestItems[TABLE].slice(-1) } };
      return {};
    });

    vi.useFakeTimers();
    let result;
    try {
      const pending = putRows("user-1", rowsOf(3));
      await vi.runAllTimersAsync();
      result = await pending;
    } finally {
      vi.useRealTimers();
    }

    expect(result.unwritten).toHaveLength(1);
    expect(countUpdates().map((update) => update.ExpressionAttributeValues[":change"])).toEqual([3, -1]);
  });

  test("putRows for a business removed after the write began takes its new rows back out and throws", async () => {
    const business = { hashedSub: "hashed-user-1", sk: "business#b1", businessId: "b1", kind: "vat" };
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") return { Items: [business] };
      if (command.name === "Update" && command.params.Key.sk === "business#b1") throw new ConditionalCheckFailedException("removed");
      if (command.name === "Delete") return { Attributes: { sk: command.params.Key.sk } };
      return {};
    });

    await expect(
      putRows("user-1", rowsOf(2), () => false, { forBusiness: { id: "b1", set: { hmrcReadAt: VAT_ROW.readAt } } }),
    ).rejects.toMatchObject({ name: "DueListBusinessMissingError" });
    expect(sent("Delete").map((command) => command.params.Key.sk)).toEqual([
      "row#b1#vat-return#2026-01-01",
      "row#b1#vat-return#2026-01-02",
    ]);
    expect(countUpdates().map((update) => update.ExpressionAttributeValues[":change"])).toEqual([2, -2]);
  });

  test("putRows for a business removed after the write began takes back a row it replaced too, with no count for it", async () => {
    const business = { hashedSub: "hashed-user-1", sk: "business#b1", businessId: "b1", kind: "vat" };
    const replaced = { ...VAT_ROW, hashedSub: "hashed-user-1", sk: rowSk(VAT_ROW), dueDate: "2026-11-01" };
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") return { Items: [business, replaced] };
      if (command.name === "Update" && command.params.Key.sk === "business#b1") throw new ConditionalCheckFailedException("removed");
      if (command.name === "Delete") return { Attributes: { sk: command.params.Key.sk } };
      return {};
    });

    await expect(
      putRows("user-1", [VAT_ROW, { ...VAT_ROW, periodEnd: "2026-12-31" }], () => false, {
        forBusiness: { id: "b1", set: { hmrcReadAt: VAT_ROW.readAt } },
      }),
    ).rejects.toMatchObject({ name: "DueListBusinessMissingError" });
    expect(sent("Delete").map((command) => command.params.Key.sk)).toEqual([
      "row#b1#vat-return#2026-09-30",
      "row#b1#vat-return#2026-12-31",
    ]);
    expect(countUpdates().map((update) => update.ExpressionAttributeValues[":change"])).toEqual([1, -1]);
  });

  test("putBusiness reserves a new business before writing it, only where none is stored", async () => {
    storeHolds([]);

    const { created } = await putBusiness("user-1", { id: "b1", kind: "vat", label: "Shop" });

    expect(created).toBe(true);
    expect(countUpdates()[0].ExpressionAttributeValues).toMatchObject({ ":change": 1, ":room": 49 });
    expect(sent("Put")[0].params.ConditionExpression).toBe("attribute_not_exists(sk)");
  });

  test("putBusiness replaces a stored business where it is stored, keeps the time HMRC was read, and moves no count", async () => {
    storeHolds([
      {
        hashedSub: "hashed-user-1",
        sk: "business#b1",
        businessId: "b1",
        kind: "vat",
        label: "Shop",
        hmrcReadAt: "2026-11-01T10:00:00.000Z",
      },
    ]);

    const { item, created } = await putBusiness("user-1", { id: "b1", kind: "vat", label: "Renamed" });

    expect(created).toBe(false);
    expect(item).toMatchObject({ label: "Renamed", hmrcReadAt: "2026-11-01T10:00:00.000Z" });
    expect(sent("Put")[0].params.ConditionExpression).toBe("attribute_exists(sk)");
    expect(countUpdates()).toHaveLength(0);
  });

  test("putBusiness refuses a new business when the count is at the cap and a fresh count agrees", async () => {
    countRefuses({
      count: { ...COUNT_KEY, businesses: 50, rows: 0, countedAt: 0 },
      items: Array.from({ length: 50 }, (unused, index) => ({ hashedSub: "hashed-user-1", sk: `business#s${index}` })),
    });

    await expect(putBusiness("user-1", { id: "b1", kind: "vat", label: "Shop" })).rejects.toMatchObject({
      name: "DueListFullError",
      counted: "businesses",
    });
    expect(sent("Put")).toHaveLength(0);
  });

  test("a write that finds no count counts the account's items under every salt version, on the condition that none was written", async () => {
    mockSubHashCandidates.mockImplementation((sub) => [
      { version: "v2", hashedSub: `new-${sub}` },
      { version: "v1", hashedSub: `hashed-${sub}` },
    ]);
    let counted = false;
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") {
        const hashedSub = command.params.ExpressionAttributeValues[":hashedSub"];
        return { Items: hashedSub === "hashed-user-1" ? [{ hashedSub, sk: "business#old" }] : [] };
      }
      if (command.name === "Get") return {};
      if (command.name === "Update" && command.params.ConditionExpression === "attribute_not_exists(sk)") counted = true;
      if (command.name === "Update" && command.params.ConditionExpression?.includes(":room") && !counted)
        throw new ConditionalCheckFailedException("no count");
      return {};
    });

    await putBusiness("user-1", { id: "b1", kind: "vat", label: "Shop" });

    const correction = countUpdates().find((update) => update.ConditionExpression === "attribute_not_exists(sk)");
    expect(correction.Key).toEqual({ hashedSub: "new-user-1", sk: "count" });
    expect(correction.ExpressionAttributeValues).toMatchObject({ ":businesses": 1, ":rows": 0 });
  });

  test("no log line of a business write, a rows write or a removal holds the business id", async () => {
    const id = "kq7x2m9p-made-up";
    const row = { ...VAT_ROW, businessId: id };
    storeHolds([
      { hashedSub: "hashed-user-1", sk: `business#${id}`, businessId: id },
      { hashedSub: "hashed-user-1", sk: rowSk(row), ...row },
    ]);
    const lines = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
    try {
      await putBusiness("user-1", { id, kind: "vat", label: "Shop" });
      await putRows("user-1", [{ ...row, dueDate: "2026-11-08" }], () => true, { forBusiness: { id, set: { hmrcReadAt: row.readAt } } });
      await deleteBusiness("user-1", id);
    } finally {
      write.mockRestore();
    }

    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join("")).not.toContain(id);
  });

  test("a recount adds the reservations an earlier salt version's count still holds for rows being written there", async () => {
    mockSubHashCandidates.mockImplementation((sub) => [
      { version: "v2", hashedSub: `new-${sub}` },
      { version: "v1", hashedSub: `hashed-${sub}` },
    ]);
    const earlierRows = [1, 2].map((day) => ({ hashedSub: "hashed-user-1", sk: `row#b9#vat-return#2025-0${day}-01` }));
    let reserved = false;
    mockSend.mockImplementation(async (command) => {
      if (command.name === "Query") {
        const hashedSub = command.params.ExpressionAttributeValues[":hashedSub"];
        return { Items: hashedSub === "hashed-user-1" ? earlierRows : [] };
      }
      if (command.name === "Get") {
        return command.params.Key.hashedSub === "hashed-user-1"
          ? { Item: { hashedSub: "hashed-user-1", sk: "count", businesses: 0, rows: 5, countedAt: Date.now() } }
          : {};
      }
      if (command.name === "Update" && command.params.ConditionExpression?.includes(":room") && !reserved) {
        reserved = true;
        throw new ConditionalCheckFailedException("no count");
      }
      return {};
    });

    await putRows("user-1", rowsOf(1));

    const written = countUpdates().find((update) => update.ConditionExpression === "attribute_not_exists(sk)");
    expect(written.Key).toEqual({ hashedSub: "new-user-1", sk: "count" });
    // Two rows stored under the earlier hash, and three more its count still holds for a write there.
    expect(written.ExpressionAttributeValues).toMatchObject({ ":rows": 5 });
  });
});
