// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbPracticeClientRepository.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSend = vi.fn();
const mockPutCommand = vi.fn();
const mockGetCommand = vi.fn();
const mockQueryCommand = vi.fn();
const mockUpdateCommand = vi.fn();

class ConditionalCheckFailedException extends Error {
  constructor(message) {
    super(message);
    this.name = "ConditionalCheckFailedException";
  }
}

const dynamoDbModule = {
  PutCommand: class PutCommand {
    constructor(params) {
      mockPutCommand(params);
      this.params = params;
    }
  },
  GetCommand: class GetCommand {
    constructor(params) {
      mockGetCommand(params);
      this.params = params;
    }
  },
  QueryCommand: class QueryCommand {
    constructor(params) {
      mockQueryCommand(params);
      this.params = params;
    }
  },
  UpdateCommand: class UpdateCommand {
    constructor(params) {
      mockUpdateCommand(params);
      this.params = params;
    }
  },
};

vi.mock("@app/lib/dynamoDbClient.js", () => ({
  getDynamoDbDocClient: vi.fn().mockResolvedValue({
    docClient: { send: (...args) => mockSend(...args) },
    module: dynamoDbModule,
  }),
  executeDynamoDbCommand: (commandBuilder) => mockSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName) => process.env[envVarName] || "",
}));

vi.mock("@app/services/subHasher.js", () => ({
  hashSub: vi.fn((sub) => `hashed-${sub}`),
}));

const {
  createClient,
  getClient,
  listClients,
  archiveClient,
  generateClientId,
  getPracticeArn,
  setPracticeArn,
  setClientAuthorisation,
} = await import("@app/data/dynamoDbPracticeClientRepository.js");

describe("data/dynamoDbPracticeClientRepository", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPutCommand.mockClear();
    mockGetCommand.mockClear();
    mockQueryCommand.mockClear();
    mockUpdateCommand.mockClear();
    mockSend.mockResolvedValue({});
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
  });

  test("generateClientId issues a 26-character Crockford base32 ULID", () => {
    const clientId = generateClientId();
    expect(clientId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("generateClientId never repeats across consecutive calls", () => {
    const first = generateClientId();
    const second = generateClientId();
    expect(first).not.toBe(second);
  });

  test("createClient writes a row keyed by the practice's hashed sub and a fresh client id", async () => {
    const client = await createClient("practice-sub", { displayName: "Acme Ltd", vrn: "123456789" });

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect(item.hashedSub).toBe("hashed-practice-sub");
    expect(item.clientId).toBe(client.clientId);
    expect(item.displayName).toBe("Acme Ltd");
    expect(item.identifiers).toEqual({ vrn: "123456789", nino: null, utr: null, companyNumber: null });
    expect(item.authorisations).toEqual({});
    expect(item.archivedAt).toBeNull();
    expect(mockPutCommand.mock.calls[0][0].ConditionExpression).toBe("attribute_not_exists(clientId)");
  });

  test("getClient reads by the caller's own hashed sub and the given client id", async () => {
    mockSend.mockResolvedValueOnce({ Item: { hashedSub: "hashed-practice-sub", clientId: "c1" } });

    const client = await getClient("practice-sub", "c1");

    expect(mockGetCommand.mock.calls[0][0].Key).toEqual({ hashedSub: "hashed-practice-sub", clientId: "c1" });
    expect(client).toEqual({ hashedSub: "hashed-practice-sub", clientId: "c1" });
  });

  test("getClient answers null for a client id that does not exist under this practice", async () => {
    mockSend.mockResolvedValueOnce({});

    const client = await getClient("practice-sub", "missing");

    expect(client).toBeNull();
  });

  test("listClients queries only the caller's own hashed sub", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ clientId: "c1", archivedAt: null }] });

    await listClients("practice-sub");

    expect(mockQueryCommand.mock.calls[0][0].KeyConditionExpression).toBe("hashedSub = :hashedSub");
    expect(mockQueryCommand.mock.calls[0][0].ExpressionAttributeValues).toEqual({
      ":hashedSub": "hashed-practice-sub",
    });
  });

  test("listClients excludes archived clients by default", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { clientId: "active", archivedAt: null },
        { clientId: "archived", archivedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const clients = await listClients("practice-sub");

    expect(clients.map((client) => client.clientId)).toEqual(["active"]);
  });

  test("listClients includes archived clients when asked", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { clientId: "active", archivedAt: null },
        { clientId: "archived", archivedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const clients = await listClients("practice-sub", { includeArchived: true });

    expect(clients.map((client) => client.clientId)).toEqual(["active", "archived"]);
  });

  test("archiveClient sets archivedAt and returns the updated row", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: { clientId: "c1", archivedAt: "2026-09-22T00:00:00.000Z" } });

    const updated = await archiveClient("practice-sub", "c1");

    expect(mockUpdateCommand.mock.calls[0][0].Key).toEqual({ hashedSub: "hashed-practice-sub", clientId: "c1" });
    expect(mockUpdateCommand.mock.calls[0][0].ConditionExpression).toBe("attribute_exists(clientId)");
    expect(updated.archivedAt).toBe("2026-09-22T00:00:00.000Z");
  });

  test("archiveClient throws when the client does not belong to this practice", async () => {
    mockSend.mockRejectedValueOnce(new ConditionalCheckFailedException("row not found"));

    await expect(archiveClient("practice-sub", "not-mine")).rejects.toThrow(ConditionalCheckFailedException);
  });

  test("listClients excludes the practice's own profile row from the client list", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { clientId: "practice#profile", arn: "TARN0000001" },
        { clientId: "c1", archivedAt: null },
      ],
    });

    const clients = await listClients("practice-sub");

    expect(clients.map((client) => client.clientId)).toEqual(["c1"]);
  });

  test("getPracticeArn reads the profile row's arn field", async () => {
    mockSend.mockResolvedValueOnce({ Item: { hashedSub: "hashed-practice-sub", clientId: "practice#profile", arn: "TARN0000001" } });

    const arn = await getPracticeArn("practice-sub");

    expect(mockGetCommand.mock.calls[0][0].Key).toEqual({ hashedSub: "hashed-practice-sub", clientId: "practice#profile" });
    expect(arn).toBe("TARN0000001");
  });

  test("getPracticeArn answers null when the practice has never set one", async () => {
    mockSend.mockResolvedValueOnce({});

    const arn = await getPracticeArn("practice-sub");

    expect(arn).toBeNull();
  });

  test("setPracticeArn writes the arn onto the profile row", async () => {
    const stored = await setPracticeArn("practice-sub", "TARN0000001");

    const item = mockPutCommand.mock.calls[0][0].Item;
    expect(item.hashedSub).toBe("hashed-practice-sub");
    expect(item.clientId).toBe("practice#profile");
    expect(item.arn).toBe("TARN0000001");
    expect(stored.arn).toBe("TARN0000001");
  });

  test("setClientAuthorisation writes one service's state onto the client row", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: { clientId: "c1", authorisations: { "MTD-VAT": { status: "pending", invitationId: "inv-1" } } },
    });

    const updated = await setClientAuthorisation("practice-sub", "c1", "MTD-VAT", { status: "pending", invitationId: "inv-1" });

    expect(mockUpdateCommand.mock.calls[0][0].Key).toEqual({ hashedSub: "hashed-practice-sub", clientId: "c1" });
    expect(mockUpdateCommand.mock.calls[0][0].UpdateExpression).toBe("SET authorisations.#service = :authorisation");
    expect(mockUpdateCommand.mock.calls[0][0].ExpressionAttributeNames).toEqual({ "#service": "MTD-VAT" });
    expect(mockUpdateCommand.mock.calls[0][0].ExpressionAttributeValues[":authorisation"]).toMatchObject({
      status: "pending",
      invitationId: "inv-1",
    });
    expect(updated.authorisations["MTD-VAT"].status).toBe("pending");
  });

  test("setClientAuthorisation throws when the client does not belong to this practice", async () => {
    mockSend.mockRejectedValueOnce(new ConditionalCheckFailedException("row not found"));

    await expect(setClientAuthorisation("practice-sub", "not-mine", "MTD-VAT", { status: "pending" })).rejects.toThrow(
      ConditionalCheckFailedException,
    );
  });
});
