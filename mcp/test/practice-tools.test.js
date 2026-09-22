// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// practice-tools.test.js -- the practice's own client operations: move_book_to_client (its own
// small fetch), and list_clients/add_client/invite_client/client_authorisation_status (fetch
// mocked to shapes recorded from a real simulator-backed lane, fixtures/practice/*.json).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moveBookToClient, listClients, addClient, inviteClient, clientAuthorisationStatus } from "../lib/practice-tools.js";
import { TOOLS } from "../lib/server.js";

const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/practice");
function fixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const LIST_CLIENTS_RESPONSE = fixture("list-clients.response.json");
const ADD_CLIENT_RESPONSE = fixture("add-client.response.json");
const INVITE_CLIENT_RESPONSE = fixture("invite-client.response.json");
const CLIENT_AUTHORISATION_STATUS_RESPONSE = fixture("client-authorisation-status.response.json");

describe("practice-tools move_book_to_client", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
    process.env.DIYA_SUBMIT_ACCESS_TOKEN = "practice-access-token";
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    delete process.env.DIYA_SUBMIT_ACCESS_TOKEN;
    vi.unstubAllGlobals();
  });

  it("posts to the practice's move route with the practice's bearer token", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { bookId: BOOK_ID, clientId: CLIENT_ID, movedObjectCount: 3 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await moveBookToClient({}, { clientId: CLIENT_ID, bookId: BOOK_ID });

    expect(result).toEqual({ bookId: BOOK_ID, clientId: CLIENT_ID, movedObjectCount: 3 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://submit.diyaccounting.co.uk/api/v1/practice/clients/${CLIENT_ID}/books/${BOOK_ID}/move`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer practice-access-token");
  });

  it("strips a trailing slash from the configured base URL", async () => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk";
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal("fetch", mockFetch);

    await moveBookToClient({}, { clientId: CLIENT_ID, bookId: BOOK_ID });

    expect(mockFetch.mock.calls[0][0]).toBe(
      `https://submit.diyaccounting.co.uk/api/v1/practice/clients/${CLIENT_ID}/books/${BOOK_ID}/move`,
    );
  });

  it("throws the API's own message when the client already has this book", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(409, { message: "Client already has a book" }));
    vi.stubGlobal("fetch", mockFetch);

    await expect(moveBookToClient({}, { clientId: CLIENT_ID, bookId: BOOK_ID })).rejects.toThrow("Client already has a book");
  });

  it("throws a generic message when a failed response carries no message", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(500, {}));
    vi.stubGlobal("fetch", mockFetch);

    await expect(moveBookToClient({}, { clientId: CLIENT_ID, bookId: BOOK_ID })).rejects.toThrow("HTTP 500");
  });

  it("requires a clientId", async () => {
    await expect(moveBookToClient({}, { bookId: BOOK_ID })).rejects.toThrow("clientId");
  });

  it("requires a bookId", async () => {
    await expect(moveBookToClient({}, { clientId: CLIENT_ID })).rejects.toThrow("bookId");
  });

  it("requires DIYA_SUBMIT_BASE_URL to be configured", async () => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    await expect(moveBookToClient({}, { clientId: CLIENT_ID, bookId: BOOK_ID })).rejects.toThrow("DIYA_SUBMIT_BASE_URL");
  });

  it("requires DIYA_SUBMIT_ACCESS_TOKEN to be configured", async () => {
    delete process.env.DIYA_SUBMIT_ACCESS_TOKEN;
    await expect(moveBookToClient({}, { clientId: CLIENT_ID, bookId: BOOK_ID })).rejects.toThrow("DIYA_SUBMIT_ACCESS_TOKEN");
  });

  it("is registered on the server as move_book_to_client", () => {
    expect(TOOLS.move_book_to_client.handler).toBe(moveBookToClient);
    expect(TOOLS.move_book_to_client.inputSchema.clientId).toBeDefined();
    expect(TOOLS.move_book_to_client.inputSchema.bookId).toBeDefined();
  });
});

describe("practice-tools client tools", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
    process.env.DIYA_SUBMIT_ACCESS_TOKEN = "practice-access-token";
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    delete process.env.DIYA_SUBMIT_ACCESS_TOKEN;
    vi.unstubAllGlobals();
  });

  describe("list_clients", () => {
    it("gets the practice's client list with the session bearer on Authorization", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, LIST_CLIENTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await listClients({}, {});

      expect(result).toEqual(LIST_CLIENTS_RESPONSE);
      expect(result.clients).toHaveLength(2);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/practice/clients");
      expect(init.headers.Authorization).toBe("Bearer practice-access-token");
    });

    it("throws the API's own message on a non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(500, { message: "Internal server error" }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(listClients({}, {})).rejects.toThrow("Internal server error");
    });

    it("is registered on the server as list_clients", () => {
      expect(TOOLS.list_clients.handler).toBe(listClients);
    });
  });

  describe("add_client", () => {
    it("posts the new client's fields and returns the stored row", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, ADD_CLIENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await addClient({}, { displayName: "Brickwork Pro Ltd", vrn: "983238295", companyNumber: "12345678" });

      expect(result).toEqual(ADD_CLIENT_RESPONSE);
      expect(result.client.clientId).toBe(ADD_CLIENT_RESPONSE.client.clientId);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/practice/clients");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body);
      expect(body.displayName).toBe("Brickwork Pro Ltd");
      expect(body.vrn).toBe("983238295");
      expect(body.companyNumber).toBe("12345678");
    });

    it("requires displayName", async () => {
      await expect(addClient({}, { vrn: "983238295" })).rejects.toThrow("displayName");
    });

    it("throws the API's own message on a validation error", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(400, { message: "Invalid VAT registration number format - must be 9 digits" }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(addClient({}, { displayName: "Brickwork Pro Ltd", vrn: "not-a-vrn" })).rejects.toThrow(
        "Invalid VAT registration number format",
      );
    });

    it("is registered on the server as add_client", () => {
      expect(TOOLS.add_client.handler).toBe(addClient);
      expect(TOOLS.add_client.inputSchema.displayName).toBeDefined();
    });
  });

  describe("invite_client", () => {
    const PARAMS = {
      clientId: CLIENT_ID,
      service: "MTD-VAT",
      knownFact: "2015-03-01",
      hmrcAccessToken: "hmrc-access-token",
    };

    it("posts the invitation with the HMRC access token in the body, and returns the client, invitationId and status", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, INVITE_CLIENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await inviteClient({}, PARAMS);

      expect(result).toEqual(INVITE_CLIENT_RESPONSE);
      expect(result.status).toBe("pending");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://submit.diyaccounting.co.uk/api/v1/practice/clients/${CLIENT_ID}/authorisation/invitations`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer practice-access-token");
      const body = JSON.parse(init.body);
      expect(body.service).toBe("MTD-VAT");
      expect(body.knownFact).toBe("2015-03-01");
      expect(body.accessToken).toBe("hmrc-access-token");
      expect(body.arn).toBeUndefined();
    });

    it("carries arn through when given", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, INVITE_CLIENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      await inviteClient({}, { ...PARAMS, arn: "XARN1234567" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.arn).toBe("XARN1234567");
    });

    it("requires clientId, service, knownFact and hmrcAccessToken", async () => {
      await expect(inviteClient({}, { ...PARAMS, clientId: undefined })).rejects.toThrow("clientId");
      await expect(inviteClient({}, { ...PARAMS, service: undefined })).rejects.toThrow("service");
      await expect(inviteClient({}, { ...PARAMS, knownFact: undefined })).rejects.toThrow("knownFact");
      await expect(inviteClient({}, { ...PARAMS, hmrcAccessToken: undefined })).rejects.toThrow("hmrcAccessToken");
    });

    it("throws a 404 client-not-found style message for a client that is not the caller's", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(404, { message: "Client not found" }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(inviteClient({}, PARAMS)).rejects.toThrow("Client not found");
    });

    it("is registered on the server as invite_client", () => {
      expect(TOOLS.invite_client.handler).toBe(inviteClient);
    });
  });

  describe("client_authorisation_status", () => {
    const PARAMS = { clientId: CLIENT_ID, service: "MTD-VAT", hmrcAccessToken: "hmrc-access-token" };

    it("gets the status with the session bearer on X-Authorization and the HMRC token on Authorization, and returns the client, status and invitationId", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, CLIENT_AUTHORISATION_STATUS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await clientAuthorisationStatus({}, PARAMS);

      expect(result).toEqual(CLIENT_AUTHORISATION_STATUS_RESPONSE);
      expect(result.status).toBe("authorised");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://submit.diyaccounting.co.uk/api/v1/practice/clients/${CLIENT_ID}/authorisation?service=MTD-VAT`);
      expect(init.headers["X-Authorization"]).toBe("Bearer practice-access-token");
      expect(init.headers.Authorization).toBe("Bearer hmrc-access-token");
    });

    it("requires clientId, service and hmrcAccessToken", async () => {
      await expect(clientAuthorisationStatus({}, { ...PARAMS, clientId: undefined })).rejects.toThrow("clientId");
      await expect(clientAuthorisationStatus({}, { ...PARAMS, service: undefined })).rejects.toThrow("service");
      await expect(clientAuthorisationStatus({}, { ...PARAMS, hmrcAccessToken: undefined })).rejects.toThrow("hmrcAccessToken");
    });

    it("throws a 404 client-not-found style message for a client that is not the caller's", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(404, { message: "Client not found" }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(clientAuthorisationStatus({}, PARAMS)).rejects.toThrow("Client not found");
    });

    it("is registered on the server as client_authorisation_status", () => {
      expect(TOOLS.client_authorisation_status.handler).toBe(clientAuthorisationStatus);
    });
  });
});
