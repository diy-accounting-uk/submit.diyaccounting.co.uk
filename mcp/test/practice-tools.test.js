// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// practice-tools.test.js -- move_book_to_client, the one tool here that calls DIY Accounting
// Submit's own API rather than the local filesystem.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moveBookToClient } from "../lib/practice-tools.js";
import { TOOLS } from "../lib/server.js";

const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

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
