// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/companiesHouseFilingSimulator.system.test.js
// System tests driving the Companies House filing routes on the HTTP simulator directly over
// HTTP, independent of the Lambdas that call them in production. No network.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startSimulator } from "../http-simulator/index.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let simulator;

const AUTH_HEADERS = { Authorization: "Bearer simulator-access-token", "Content-Type": "application/json" };

describe("System: Companies House Filing Simulator", () => {
  beforeAll(async () => {
    simulator = await startSimulator({ port: 0 });
  });

  afterAll(async () => {
    if (simulator) await simulator.stop();
  });

  it("rejects every filing route with no Authorization header", async () => {
    const routes = [
      { method: "POST", path: "/transactions" },
      { method: "GET", path: "/transactions/does-not-matter" },
      { method: "PUT", path: "/transactions/does-not-matter" },
      { method: "POST", path: "/transactions/does-not-matter/registered-office-address" },
      { method: "POST", path: "/transactions/does-not-matter/registered-email-address" },
      { method: "GET", path: "/registered-email-address/company/06846849/eligibility" },
    ];

    for (const route of routes) {
      const response = await fetch(`${simulator.baseUrl}${route.path}`, {
        method: route.method,
        headers: { "Content-Type": "application/json" },
        body: route.method === "GET" ? undefined : JSON.stringify({}),
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.errors[0].error).toBe("invalid-authorization-header");
    }
  });

  it("reads the registered office address for the fixture company, matching the read-only lookup", async () => {
    const response = await fetch(`${simulator.baseUrl}/company/06846849/registered-office-address`, {
      headers: { Authorization: "Basic dGVzdDo=" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.locality).toBe("Pulham Market");
    expect(body.postal_code).toBe("IP21 4XW");
    expect(body.etag).toBeTruthy();
  });

  it("returns COMPANY_VALID_FOR_SERVICE eligibility by default", async () => {
    const response = await fetch(`${simulator.baseUrl}/registered-email-address/company/06846849/eligibility`, {
      headers: AUTH_HEADERS,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.eligibility_status_code).toBe("COMPANY_VALID_FOR_SERVICE");
  });

  it("returns INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS for the reserved company number", async () => {
    const response = await fetch(`${simulator.baseUrl}/registered-email-address/company/00000001/eligibility`, {
      headers: AUTH_HEADERS,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.eligibility_status_code).toBe("INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS");
  });

  it("opens a transaction, files a registered office address change, and closes it", async () => {
    const openResponse = await fetch(`${simulator.baseUrl}/transactions`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ company_number: "06846849", description: "Change of registered office address" }),
    });
    expect(openResponse.status).toBe(201);
    const transaction = await openResponse.json();
    expect(transaction.status).toBe("open");

    const resourceResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}/registered-office-address`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        premises: "13",
        address_line_1: "Bedford Road",
        locality: "Leeds",
        country: "England",
        postal_code: "LS12 3AB",
        accept_appropriate_office_address_statement: true,
        reference_etag: "diy-accounting-simulator-etag-1",
      }),
    });
    expect(resourceResponse.status).toBe(201);

    const duplicateResourceResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}/registered-office-address`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        premises: "13",
        address_line_1: "Bedford Road",
        locality: "Leeds",
        country: "England",
        postal_code: "LS12 3AB",
        accept_appropriate_office_address_statement: true,
        reference_etag: "diy-accounting-simulator-etag-1",
      }),
    });
    expect(duplicateResourceResponse.status).toBe(409);

    const unknownTransactionResponse = await fetch(
      `${simulator.baseUrl}/transactions/${transaction.id}-missing/registered-office-address`,
      { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify({}) },
    );
    expect(unknownTransactionResponse.status).toBe(404);

    const closeResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}`, {
      method: "PUT",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closeResponse.status).toBe(204);

    const alreadyClosedResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}`, {
      method: "PUT",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ status: "closed" }),
    });
    expect(alreadyClosedResponse.status).toBe(403);

    const firstGetResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}`, { headers: AUTH_HEADERS });
    expect(firstGetResponse.status).toBe(200);
    const firstGetBody = await firstGetResponse.json();
    const filingIds = Object.keys(firstGetBody.filings);
    expect(filingIds).toHaveLength(1);
    expect(firstGetBody.filings[filingIds[0]].status).toBe("processing");

    const secondGetResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}`, { headers: AUTH_HEADERS });
    const secondGetBody = await secondGetResponse.json();
    expect(secondGetBody.filings[filingIds[0]].status).toBe("accepted");
  });

  it("rejects a registered office address filing with 400 when a required field is missing", async () => {
    const openResponse = await fetch(`${simulator.baseUrl}/transactions`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ company_number: "06846849", description: "Change of registered office address" }),
    });
    const transaction = await openResponse.json();

    const response = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}/registered-office-address`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        premises: "13",
        address_line_1: "Bedford Road",
        locality: "Leeds",
        country: "England",
        // postal_code deliberately omitted
        accept_appropriate_office_address_statement: true,
        reference_etag: "diy-accounting-simulator-etag-1",
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors[0].error).toBe("postal_code-blank");
  });

  it("files a registered email address change", async () => {
    const openResponse = await fetch(`${simulator.baseUrl}/transactions`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ company_number: "06846849", description: "Change of registered email address" }),
    });
    const transaction = await openResponse.json();

    const resourceResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}/registered-email-address`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ registered_email_address: "filings@example.co.uk", accept_appropriate_email_address_statement: true }),
    });
    expect(resourceResponse.status).toBe(201);
    const resourceBody = await resourceResponse.json();
    expect(resourceBody.data.registered_email_address).toBe("filings@example.co.uk");

    const duplicateResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}/registered-email-address`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ registered_email_address: "filings@example.co.uk", accept_appropriate_email_address_statement: true }),
    });
    expect(duplicateResponse.status).toBe(409);
  });

  it("answers 422 naming the postcode when closing a transaction for the reserved validation-error company", async () => {
    const openResponse = await fetch(`${simulator.baseUrl}/transactions`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ company_number: "00000422", description: "Change of registered office address" }),
    });
    const transaction = await openResponse.json();

    await fetch(`${simulator.baseUrl}/transactions/${transaction.id}/registered-office-address`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        premises: "1",
        address_line_1: "1 Validation Street",
        locality: "London",
        country: "England",
        postal_code: "EC1A 1AA",
        accept_appropriate_office_address_statement: true,
        reference_etag: "simulator-etag-00000422",
      }),
    });

    const closeResponse = await fetch(`${simulator.baseUrl}/transactions/${transaction.id}`, {
      method: "PUT",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closeResponse.status).toBe(422);
    const closeBody = await closeResponse.json();
    expect(closeBody.validationStatus.is_valid).toBe(false);
    expect(closeBody.validationStatus.errors[0].location).toBe("$.postal_code");
  });
});
