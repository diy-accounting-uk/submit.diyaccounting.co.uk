// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/companies-house.js
// Companies House read API endpoints
// Handles: GET /search/companies, GET /company/{companyNumber}

import { getCompany, searchCompanies } from "../scenarios/companies.js";

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
}
