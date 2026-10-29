// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/mcpCodesEntry.test.js
// The codes entry from a tool call's mint to a filing route's one use, over an in-memory table.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import { FakeCodesEntryTable } from "@app/test-helpers/fakeCodesEntryTable.js";
import { _setTestSalt } from "@app/services/subHasher.js";
import { resetBlobKeyCache } from "@app/lib/mcpBlobKey.js";

const table = new FakeCodesEntryTable();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (builder) => table.execute(builder),
  getResourceName: () => "test-mcp-sessions",
}));
const practiceClients = new Map();
vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: async (sub, clientId) => practiceClients.get(`${sub}/${clientId}`) ?? null,
}));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/mcp/mcpCodesEntry.js");
const { applyCodesEntry } = await import("@app/services/companiesHouseCodesEntry.js");

const ROUTE = "/api/v1/mcp/codes-entries";
const DIRECTORS = [
  { forename: "Jo", surname: "Brick" },
  { forename: "Sam", surname: "Mortar" },
];
const PERSONAL_CODES = ["ABCDE123456", "FGHIJK67890"];

function authorizerFor(sub) {
  return { authorizer: { jwt: { claims: { sub } } } };
}

function mintEvent(body, sub = "user-sub-1") {
  return buildLambdaEvent({ method: "POST", path: ROUTE, body, authorizer: authorizerFor(sub) });
}

function itemEvent(method, entryId, body) {
  return buildLambdaEvent({ method, path: `${ROUTE}/${entryId}`, pathParameters: { entryId }, body, authorizer: {} });
}

async function mint(body, sub) {
  const response = await ingestHandler(mintEvent(body, sub));
  return { response, body: parseResponseBody(response) };
}

describe("mcpCodesEntry", () => {
  beforeEach(() => {
    table.items.clear();
    practiceClients.clear();
    practiceClients.set("user-sub-1/client-a", { clientId: "client-a", displayName: "Alpha Ltd", companyNumber: "01234567" });
    practiceClients.set("user-sub-1/client-b", { clientId: "client-b", displayName: "Beta Ltd" });
    practiceClients.set("other-sub/client-x", { clientId: "client-x", displayName: "Other Ltd" });
    process.env.MCP_SESSIONS_DYNAMODB_TABLE_NAME = "test-mcp-sessions";
    process.env.DIY_SUBMIT_BASE_URL = "https://submit.example/";
    process.env.MCP_OAUTH_BLOB_KEY = "test-mcp-oauth-blob-key-0123456789abcdef";
    resetBlobKeyCache();
    _setTestSalt("test-salt-for-unit-tests");
  });

  describe("minting", () => {
    test("answers the entry id and the link to the codes page", async () => {
      const { response, body } = await mint({ kind: "accounts", companyNumber: "12345678" });
      expect(response.statusCode).toBe(201);
      expect(body.url).toBe(`https://submit.example/companies-house/mcpCodes.html?entry=${body.entryId}`);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(table.items.get(`codes:${body.entryId}`)).toMatchObject({ kind: "accounts", companyNumber: "12345678", state: "pending" });
    });

    test("stores the owner as a hash, never the sub", async () => {
      const { body } = await mint({ kind: "accounts", companyNumber: "12345678" });
      const stored = table.items.get(`codes:${body.entryId}`);
      expect(stored.hashedSub).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain("user-sub-1");
    });

    test("needs a signed-in user", async () => {
      const response = await ingestHandler(
        buildLambdaEvent({ method: "POST", path: ROUTE, body: { kind: "accounts", companyNumber: "12345678" }, authorizer: {} }),
      );
      expect(response.statusCode).toBe(401);
    });

    test("refuses an unknown kind and a bad company number", async () => {
      expect((await mint({ kind: "vat", companyNumber: "12345678" })).response.statusCode).toBe(400);
      expect((await mint({ kind: "accounts", companyNumber: "1234567890" })).response.statusCode).toBe(400);
    });

    test("needs the directors for a confirmation statement", async () => {
      expect((await mint({ kind: "confirmation-statement", companyNumber: "12345678" })).response.statusCode).toBe(400);
      expect(
        (await mint({ kind: "confirmation-statement", companyNumber: "12345678", directors: [{ forename: "Jo" }] })).response.statusCode,
      ).toBe(400);
      expect((await mint({ kind: "confirmation-statement", companyNumber: "12345678", directors: DIRECTORS })).response.statusCode).toBe(
        201,
      );
    });
  });

  describe("the codes page", () => {
    test("reads what to ask for, with no code in the answer", async () => {
      const { body: minted } = await mint({ kind: "confirmation-statement", companyNumber: "12345678", directors: DIRECTORS });
      const response = await ingestHandler(itemEvent("GET", minted.entryId));
      expect(response.statusCode).toBe(200);
      expect(parseResponseBody(response)).toMatchObject({
        state: "pending",
        kind: "confirmation-statement",
        companyNumber: "12345678",
        directors: DIRECTORS,
      });
    });

    test("answers 404 for an unknown id and an id that is not an entry id", async () => {
      expect((await ingestHandler(itemEvent("GET", "11111111-2222-4333-8444-555555555555"))).statusCode).toBe(404);
      expect((await ingestHandler(itemEvent("GET", "codes:../x"))).statusCode).toBe(404);
    });

    test("stores the codes sealed and answers only that they are saved", async () => {
      const { body: minted } = await mint({ kind: "accounts", companyNumber: "12345678" });
      const response = await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Sim0123" }));
      expect(response.statusCode).toBe(200);
      expect(parseResponseBody(response)).toEqual({ state: "filled" });
      const stored = JSON.stringify(table.items.get(`codes:${minted.entryId}`));
      expect(stored).not.toContain("Sim0123");
      expect(stored).toContain("v1.");
    });

    test("takes the codes once", async () => {
      const { body: minted } = await mint({ kind: "accounts", companyNumber: "12345678" });
      await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Sim0123" }));
      expect((await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Other123" }))).statusCode).toBe(409);
    });

    test("refuses a company code of the wrong length", async () => {
      const { body: minted } = await mint({ kind: "accounts", companyNumber: "12345678" });
      expect((await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "12" }))).statusCode).toBe(400);
    });

    test("needs one well-formed personal code for each director, in order", async () => {
      const { body: minted } = await mint({ kind: "confirmation-statement", companyNumber: "12345678", directors: DIRECTORS });
      expect(
        (await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Sim0123", personalCodes: [PERSONAL_CODES[0]] })))
          .statusCode,
      ).toBe(400);
      expect(
        (await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Sim0123", personalCodes: [PERSONAL_CODES[0], "short"] })))
          .statusCode,
      ).toBe(400);
      expect(
        (await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Sim0123", personalCodes: PERSONAL_CODES }))).statusCode,
      ).toBe(200);
    });
  });

  describe("a filing route taking the entry", () => {
    async function filledEntry({ kind = "accounts", sub = "user-sub-1", directors, personalCodes } = {}) {
      const { body: minted } = await mint({ kind, companyNumber: "12345678", directors }, sub);
      await ingestHandler(itemEvent("PUT", minted.entryId, { companyAuthCode: "Sim0123", personalCodes }));
      return minted.entryId;
    }

    function filingEvent(body) {
      return buildLambdaEvent({ method: "POST", path: "/api/v1/companies-house/accounts", body });
    }

    test("puts the company code in the request body and spends the entry", async () => {
      const codesEntryId = await filledEntry();
      const result = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId }), {
        userSub: "user-sub-1",
        kind: "accounts",
      });
      expect(JSON.parse(result.event.body)).toEqual({ companyNumber: "12345678", companyAuthCode: "Sim0123" });
      const again = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId }), {
        userSub: "user-sub-1",
        kind: "accounts",
      });
      expect(again.failure).toContain("ask for a new codes link");
    });

    test("puts each personal code on its director", async () => {
      const codesEntryId = await filledEntry({ kind: "confirmation-statement", directors: DIRECTORS, personalCodes: PERSONAL_CODES });
      const body = {
        companyNumber: "12345678",
        codesEntryId,
        directors: DIRECTORS.map((director) => ({ ...director, dob: "1980-01-01" })),
      };
      const result = await applyCodesEntry(filingEvent(body), { userSub: "user-sub-1", kind: "confirmation-statement" });
      expect(JSON.parse(result.event.body).directors.map((director) => director.personalCode)).toEqual(PERSONAL_CODES);
    });

    test("refuses a directors list that is not the one the link was minted for", async () => {
      const codesEntryId = await filledEntry({ kind: "confirmation-statement", directors: DIRECTORS, personalCodes: PERSONAL_CODES });
      const result = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId, directors: [DIRECTORS[0]] }), {
        userSub: "user-sub-1",
        kind: "confirmation-statement",
      });
      expect(result.failure).toContain("2 directors");
    });

    test("refuses another user's entry and leaves it for its owner", async () => {
      const codesEntryId = await filledEntry();
      const refused = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId }), {
        userSub: "user-sub-2",
        kind: "accounts",
      });
      expect(refused.failure).toContain("ask for a new codes link");
      const owned = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId }), {
        userSub: "user-sub-1",
        kind: "accounts",
      });
      expect(owned.failure).toBeUndefined();
    });

    test("refuses an entry minted for another kind or another company", async () => {
      const codesEntryId = await filledEntry();
      const otherKind = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId }), {
        userSub: "user-sub-1",
        kind: "confirmation-statement-data",
      });
      expect(otherKind.failure).toContain("ask for a new codes link");
      const second = await filledEntry();
      const otherCompany = await applyCodesEntry(filingEvent({ companyNumber: "87654321", codesEntryId: second }), {
        userSub: "user-sub-1",
        kind: "accounts",
      });
      expect(otherCompany.failure).toContain("another company number");
    });

    test("refuses a request that sends both an entry and a code, and an entry still pending", async () => {
      const codesEntryId = await filledEntry();
      const both = await applyCodesEntry(filingEvent({ codesEntryId, companyAuthCode: "Sim0123" }), {
        userSub: "user-sub-1",
        kind: "accounts",
      });
      expect(both.failure).toContain("not both");
      const { body: pending } = await mint({ kind: "accounts", companyNumber: "12345678" });
      const notFilled = await applyCodesEntry(filingEvent({ companyNumber: "12345678", codesEntryId: pending.entryId }), {
        userSub: "user-sub-1",
        kind: "accounts",
      });
      expect(notFilled.failure).toContain("ask for a new codes link");
    });

    test("leaves a request that names no entry as it is", async () => {
      const event = filingEvent({ companyNumber: "12345678", companyAuthCode: "Sim0123" });
      expect((await applyCodesEntry(event, { userSub: "user-sub-1", kind: "accounts" })).event).toBe(event);
    });
  });

  describe("one entry for a batch of clients", () => {
    const CLIENTS = [
      { clientId: "client-a", displayName: "Alpha Ltd" },
      { clientId: "client-b", displayName: "Beta Ltd" },
    ];
    const FILL = {
      clients: [
        { clientId: "client-a", companyAuthCode: "AlphaC1" },
        { clientId: "client-b", companyAuthCode: "BetaC22" },
      ],
    };

    function filingEvent(body) {
      return buildLambdaEvent({ method: "POST", path: "/api/v1/companies-house/accounts", body });
    }

    async function filledBatch() {
      const { body: minted } = await mint({ kind: "accounts", clients: CLIENTS });
      await ingestHandler(itemEvent("PUT", minted.entryId, FILL));
      return minted.entryId;
    }

    test("mints without a company number and tells the page which clients to ask for", async () => {
      const { response, body } = await mint({ kind: "accounts", clients: CLIENTS });
      expect(response.statusCode).toBe(201);
      const read = parseResponseBody(await ingestHandler(itemEvent("GET", body.entryId)));
      expect(read).toMatchObject({ state: "pending", kind: "accounts", clients: CLIENTS });
    });

    test("mints for clients on the caller's practice list and stores the stored names", async () => {
      const { response, body } = await mint({ kind: "accounts", clients: [{ clientId: "client-a", displayName: "Forged" }] });
      expect(response.statusCode).toBe(201);
      expect(table.items.get(`codes:${body.entryId}`).clients).toEqual([
        { clientId: "client-a", displayName: "Alpha Ltd", companyNumber: "01234567" },
      ]);
    });

    test("refuses a client that is not on the caller's practice list, naming the id", async () => {
      const { response, body } = await mint({ kind: "accounts", clients: [{ clientId: "client-x" }] });
      expect(response.statusCode).toBe(400);
      expect(body.message).toContain("client-x");
      expect(table.items.size).toBe(0);
    });

    test("refuses a mixed list whole and names only the unlisted ids", async () => {
      const { response, body } = await mint({
        kind: "accounts",
        clients: [{ clientId: "client-a" }, { clientId: "client-x" }, { clientId: "nope" }],
      });
      expect(response.statusCode).toBe(400);
      expect(body.message).toContain("client-x, nope");
      expect(body.message).not.toContain("client-a");
      expect(table.items.size).toBe(0);
    });

    test("refuses a client list that is empty, repeats a client, or is for a confirmation statement", async () => {
      expect((await mint({ kind: "accounts", clients: [] })).response.statusCode).toBe(400);
      expect((await mint({ kind: "accounts", clients: [CLIENTS[0], CLIENTS[0]] })).response.statusCode).toBe(400);
      expect((await mint({ kind: "accounts", clients: [{}] })).response.statusCode).toBe(400);
      expect((await mint({ kind: "confirmation-statement", clients: CLIENTS, directors: DIRECTORS })).response.statusCode).toBe(400);
    });

    test("needs a valid code for every client", async () => {
      const { body: minted } = await mint({ kind: "accounts", clients: CLIENTS });
      const missing = await ingestHandler(itemEvent("PUT", minted.entryId, { clients: [FILL.clients[0]] }));
      expect(missing.statusCode).toBe(400);
      expect(parseResponseBody(missing).message).toContain("Beta Ltd");
      const short = await ingestHandler(
        itemEvent("PUT", minted.entryId, { clients: [FILL.clients[0], { clientId: "client-b", companyAuthCode: "x" }] }),
      );
      expect(short.statusCode).toBe(400);
    });

    test("stores every code sealed and takes it only once", async () => {
      const { body: minted } = await mint({ kind: "accounts", clients: CLIENTS });
      expect((await ingestHandler(itemEvent("PUT", minted.entryId, FILL))).statusCode).toBe(200);
      expect((await ingestHandler(itemEvent("PUT", minted.entryId, FILL))).statusCode).toBe(409);
      const stored = JSON.stringify([...table.items.values()]);
      expect(stored).toContain("v1.");
      expect(stored).not.toContain("AlphaC1");
      expect(stored).not.toContain("BetaC22");
    });

    test("gives each client's filing its own code and is spent after the last", async () => {
      const codesEntryId = await filledBatch();
      const options = { userSub: "user-sub-1", kind: "accounts" };
      const second = await applyCodesEntry(filingEvent({ clientId: "client-b", codesEntryId }), options);
      expect(JSON.parse(second.event.body)).toEqual({ clientId: "client-b", companyAuthCode: "BetaC22" });
      const first = await applyCodesEntry(filingEvent({ clientId: "client-a", codesEntryId }), options);
      expect(JSON.parse(first.event.body).companyAuthCode).toBe("AlphaC1");
      const again = await applyCodesEntry(filingEvent({ clientId: "client-a", codesEntryId }), options);
      expect(again.failure).toContain("ask for a new codes link");
      expect([...table.items.values()].some((item) => item.sealed !== undefined)).toBe(false);
    });

    test("refuses a filing with no client, a client it was not minted for, or another user", async () => {
      const codesEntryId = await filledBatch();
      const options = { userSub: "user-sub-1", kind: "accounts" };
      expect((await applyCodesEntry(filingEvent({ codesEntryId }), options)).failure).toContain("ask for a new codes link");
      expect((await applyCodesEntry(filingEvent({ clientId: "client-z", codesEntryId }), options)).failure).toContain(
        "ask for a new codes link",
      );
      expect(
        (await applyCodesEntry(filingEvent({ clientId: "client-a", codesEntryId }), { userSub: "user-sub-2", kind: "accounts" })).failure,
      ).toContain("ask for a new codes link");
      expect((await applyCodesEntry(filingEvent({ clientId: "client-a", codesEntryId }), options)).failure).toBeUndefined();
    });
  });
});
