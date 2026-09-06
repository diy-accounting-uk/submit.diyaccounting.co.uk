// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/companies-house.js
// Companies House read API endpoints (API key) plus the OAuth-authorised filing endpoints
// (transactions, registered office address, registered email address). Both sides share this
// one route file, matching the single stack the CDK side wires them into.
// Handles: GET /search/companies, GET /company/{companyNumber}, GET
// /company/{companyNumber}/registered-office-address, GET
// /registered-email-address/company/{companyNumber}/eligibility, POST /transactions, GET/PUT
// /transactions/{id}, POST /transactions/{id}/registered-office-address, POST
// /transactions/{id}/registered-email-address

import { getCompany, searchCompanies } from "../scenarios/companies.js";
import {
  getRegisteredOfficeAddress,
  getEligibilityStatusCode,
  openTransaction,
  getTransaction,
  hasResource,
  putResource,
  closeTransaction,
  advanceProcessingFilings,
} from "../scenarios/filings.js";

function requireBearerAuthorization(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ errors: [{ error: "invalid-authorization-header", type: "ch:service" }] });
    return false;
  }
  return true;
}

export function apiEndpoint(app) {
  app.get("/search/companies", (req, res) => {
    const { q, items_per_page: itemsPerPageRaw, start_index: startIndexRaw } = req.query;

    console.log(`[http-simulator:companies-house] GET /search/companies?q=${q}`);

    if (!req.headers.authorization) {
      return res.status(401).json({ code: "UNAUTHORIZED" });
    }

    const itemsPerPage = parseInt(itemsPerPageRaw, 10) || 20;
    const startIndex = parseInt(startIndexRaw, 10) || 0;

    const result = searchCompanies(q, itemsPerPage, startIndex);

    if (result.status) {
      if (result.status === 429) res.setHeader("Retry-After", "300");
      return res.status(result.status).json({ error: "rate-limited" });
    }

    res.json(result);
  });

  app.get("/company/:companyNumber", (req, res) => {
    const { companyNumber } = req.params;

    console.log(`[http-simulator:companies-house] GET /company/${companyNumber}`);

    const result = getCompany(companyNumber);

    if (result && result.status === 429) {
      res.setHeader("Retry-After", "300");
      return res.status(429).json({ error: "rate-limited" });
    }

    if (!result) {
      return res.status(404).json({ errors: [{ error: "company-profile-not-found", type: "ch:service" }] });
    }

    res.json(result);
  });

  // GET /company/{companyNumber}/registered-office-address - public register read, API key
  // authenticated in the real service. The simulator only checks that some Authorization header
  // is present, matching the /company/{companyNumber} convention above.
  app.get("/company/:companyNumber/registered-office-address", (req, res) => {
    const { companyNumber } = req.params;

    console.log(`[http-simulator:companies-house] GET /company/${companyNumber}/registered-office-address`);

    if (!req.headers.authorization) {
      return res.status(401).json({ errors: [{ error: "invalid-authorization-header", type: "ch:service" }] });
    }

    const address = getRegisteredOfficeAddress(companyNumber);
    if (!address) {
      return res.status(404).json({ errors: [{ error: "registered-office-address-not-found", type: "ch:service" }] });
    }

    res.json(address);
  });

  // GET /registered-email-address/company/{companyNumber}/eligibility - OAuth authorised, needs
  // the user's Companies House access token.
  app.get("/registered-email-address/company/:companyNumber/eligibility", (req, res) => {
    const { companyNumber } = req.params;

    console.log(`[http-simulator:companies-house] GET /registered-email-address/company/${companyNumber}/eligibility`);

    if (!requireBearerAuthorization(req, res)) return;

    res.json({ eligibility_status_code: getEligibilityStatusCode(companyNumber) });
  });

  // POST /transactions - open a transaction against a company number.
  app.post("/transactions", (req, res) => {
    const { company_number: companyNumber, description, reference } = req.body || {};

    console.log(`[http-simulator:companies-house] POST /transactions company_number=${companyNumber}`);

    if (!requireBearerAuthorization(req, res)) return;

    const transaction = openTransaction({ companyNumber, description, reference });
    res.status(201).json(transaction);
  });

  // GET /transactions/{id} - a second GET after close flips a "processing" filing to "accepted"
  // so the polling path is exercised without a timer.
  app.get("/transactions/:id", (req, res) => {
    const { id } = req.params;

    console.log(`[http-simulator:companies-house] GET /transactions/${id}`);

    if (!requireBearerAuthorization(req, res)) return;

    const transaction = getTransaction(id);
    if (!transaction) {
      return res.status(404).json({ errors: [{ error: "transaction-not-found", type: "ch:service" }] });
    }

    res.json(transaction);
    advanceProcessingFilings(id);
  });

  // PUT /transactions/{id} - close a transaction. The reserved validation-error company number
  // always answers 422; an already-closed transaction answers 403.
  app.put("/transactions/:id", (req, res) => {
    const { id } = req.params;

    console.log(`[http-simulator:companies-house] PUT /transactions/${id} status=${req.body?.status}`);

    if (!requireBearerAuthorization(req, res)) return;

    const outcome = closeTransaction(id);
    if (!outcome) {
      return res.status(404).json({ errors: [{ error: "transaction-not-found", type: "ch:service" }] });
    }
    if (outcome.alreadyClosed) {
      return res.status(403).json({ errors: [{ error: "transaction-already-closed", type: "ch:service" }] });
    }
    if (outcome.validationErrors) {
      return res.status(422).json({ validationStatus: { is_valid: false, errors: outcome.validationErrors } });
    }

    res.status(204).send();
  });

  // POST /transactions/{id}/registered-office-address - add the AD01 resource to an open
  // transaction.
  app.post("/transactions/:id/registered-office-address", (req, res) => {
    const { id } = req.params;

    console.log(`[http-simulator:companies-house] POST /transactions/${id}/registered-office-address`);

    if (!requireBearerAuthorization(req, res)) return;

    const transaction = getTransaction(id);
    if (!transaction) {
      return res.status(404).json({ errors: [{ error: "transaction-not-found", type: "ch:service" }] });
    }
    if (transaction.status === "closed") {
      return res.status(403).json({ errors: [{ error: "transaction-closed", type: "ch:service" }] });
    }
    if (hasResource(id, "registered-office-address")) {
      return res.status(409).json({ errors: [{ error: "registered-office-address-already-exists", type: "ch:service" }] });
    }

    const body = req.body || {};
    const requiredFields = ["premises", "address_line_1", "locality", "country", "postal_code", "reference_etag"];
    const missingField = requiredFields.find((field) => !body[field]);
    if (missingField) {
      return res.status(400).json({ errors: [{ error: `${missingField}-blank`, type: "ch:validation" }] });
    }

    const resource = {
      premises: body.premises,
      address_line_1: body.address_line_1,
      address_line_2: body.address_line_2 || "",
      locality: body.locality,
      region: body.region || "",
      postal_code: body.postal_code,
      country: body.country,
      accept_appropriate_office_address_statement: body.accept_appropriate_office_address_statement,
      etag: `simulator-filing-etag-${Date.now()}`,
      kind: "registered-office-address",
      links: { self: `/transactions/${id}/registered-office-address` },
    };
    putResource(id, "registered-office-address", resource);

    res.status(201).json(resource);
  });

  // POST /transactions/{id}/registered-email-address - add the registered email address resource
  // to an open transaction.
  app.post("/transactions/:id/registered-email-address", (req, res) => {
    const { id } = req.params;

    console.log(`[http-simulator:companies-house] POST /transactions/${id}/registered-email-address`);

    if (!requireBearerAuthorization(req, res)) return;

    const transaction = getTransaction(id);
    if (!transaction) {
      return res.status(404).json({ errors: [{ error: "transaction-not-found", type: "ch:service" }] });
    }
    if (transaction.status === "closed") {
      return res.status(403).json({ errors: [{ error: "transaction-closed", type: "ch:service" }] });
    }
    if (transaction.company_number === "00000001") {
      return res.status(403).json({ errors: [{ error: "no-registered-email-address-exists", type: "ch:service" }] });
    }
    if (hasResource(id, "registered-email-address")) {
      return res.status(409).json({ errors: [{ error: "registered-email-address-already-exists", type: "ch:service" }] });
    }

    const body = req.body || {};
    const resource = {
      registered_email_address: body.registered_email_address,
      accept_appropriate_email_address_statement: body.accept_appropriate_email_address_statement,
      etag: `simulator-filing-etag-${Date.now()}`,
      kind: "registered-email-address",
      created_at: new Date().toISOString(),
    };
    putResource(id, "registered-email-address", resource);

    res.status(201).json({ data: resource, links: { self: `/transactions/${id}/registered-email-address` } });
  });
}
