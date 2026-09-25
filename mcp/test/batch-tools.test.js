// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// batch-tools.test.js -- run_for_clients over a recorded three-client list (fixtures/practice/
// run-for-clients-*.json), with fetch mocked so one client's tool call fails while the other two
// succeed, and the allow-list itself.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth.js", () => ({
  accessToken: vi.fn().mockResolvedValue("practice-access-token"),
  idToken: vi.fn().mockResolvedValue("practice-id-token"),
}));

import { runForClients, RUN_FOR_CLIENTS_TOOLS } from "../lib/batch-tools.js";
import { TOOLS } from "../lib/server.js";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/practice");
function fixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const LIST_CLIENTS_RESPONSE = fixture("run-for-clients-list-clients.response.json");
const GET_VAT_RECEIPT_RESPONSE = fixture("run-for-clients-get-vat-receipt.response.json");
const [CLIENT_A, CLIENT_B, CLIENT_C] = LIST_CLIENTS_RESPONSE.clients;

describe("run_for_clients", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("runs the chosen tool once per client, carrying one client's failure in its own row", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, LIST_CLIENTS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(403, { message: "Client not found" }))
      .mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE));
    vi.stubGlobal("fetch", mockFetch);

    const result = await runForClients({}, { tool: "get_vat_receipt", args: { name: "receipt.json" } });

    expect(result.tool).toBe("get_vat_receipt");
    expect(result.rows).toEqual([
      { clientId: CLIENT_A.clientId, displayName: CLIENT_A.displayName, ok: true, result: GET_VAT_RECEIPT_RESPONSE },
      { clientId: CLIENT_B.clientId, displayName: CLIENT_B.displayName, ok: false, error: "Client not found" },
      { clientId: CLIENT_C.clientId, displayName: CLIENT_C.displayName, ok: true, result: GET_VAT_RECEIPT_RESPONSE },
    ]);
    expect(result.summary).toEqual({ total: 3, ok: 2, failed: 1 });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[0][0]).toBe("https://submit.diyaccounting.co.uk/api/v1/practice/clients");
    expect(mockFetch.mock.calls[1][0]).toBe(
      `https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/receipt.json?clientId=${CLIENT_A.clientId}`,
    );
    expect(mockFetch.mock.calls[2][0]).toBe(
      `https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/receipt.json?clientId=${CLIENT_B.clientId}`,
    );
    expect(mockFetch.mock.calls[3][0]).toBe(
      `https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/receipt.json?clientId=${CLIENT_C.clientId}`,
    );
  });

  it("overrides a clientId given in args with each client's own", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, LIST_CLIENTS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE));
    vi.stubGlobal("fetch", mockFetch);

    await runForClients({}, { tool: "get_vat_receipt", args: { name: "receipt.json", clientId: "some-other-client" } });

    expect(mockFetch.mock.calls[1][0]).toBe(
      `https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/receipt.json?clientId=${CLIENT_A.clientId}`,
    );
  });

  it("throws for a tool outside the allow-list, without reading the client list", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await expect(runForClients({}, { tool: "add_client", args: {} })).rejects.toThrow("add_client");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws the API's own message when the client list itself cannot be read", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(500, { message: "Internal server error" }));
    vi.stubGlobal("fetch", mockFetch);

    await expect(runForClients({}, { tool: "get_vat_receipt", args: { name: "receipt.json" } })).rejects.toThrow("Internal server error");
  });

  it("lists exactly the client-scoped tools", () => {
    expect(RUN_FOR_CLIENTS_TOOLS.sort()).toEqual(
      ["list_vat_obligations", "submit_vat_return", "get_vat_receipt", "submit_micro_entity_accounts", "open_book", "save_book"].sort(),
    );
  });

  it("is registered on the server as run_for_clients", () => {
    expect(TOOLS.run_for_clients.handler).toBe(runForClients);
    expect(TOOLS.run_for_clients.inputSchema.tool).toBeDefined();
  });
});
