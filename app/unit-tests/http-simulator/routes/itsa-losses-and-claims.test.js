// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-losses-and-claims.test.js

import { describe, test, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { apiEndpoint as itsaLossesAndClaimsEndpoint } from "@app/http-simulator/routes/itsa-losses-and-claims.js";
import { reset as resetState } from "@app/http-simulator/state/store.js";

const NINO = "AA123456A";
const BUSINESS_ID = "XBIS00000000001";

function buildApp() {
  const app = express();
  app.use(express.json());
  itsaLossesAndClaimsEndpoint(app);
  return app;
}

function path(taxYear) {
  return `/individuals/losses/${NINO}/businesses/${BUSINESS_ID}/loss-claims/${taxYear}`;
}

describe("http-simulator/routes/itsa-losses-and-claims", () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  describe("GET", () => {
    test("answers 200 with losses and claims for a tax year Individual Losses v7.0 supports", async () => {
      const response = await request(app).get(path("2026-27"));

      expect(response.status).toBe(200);
      expect(response.body.claims).toBeDefined();
    });

    test("rejects a tax year below Individual Losses v7.0's minimum supported tax year, as HMRC does", async () => {
      const response = await request(app).get(path("2024-25"));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: "RULE_TAX_YEAR_NOT_SUPPORTED",
        message: "The tax year specified does not lie within the supported range",
      });
    });
  });

  describe("PUT", () => {
    test("rejects a tax year below the minimum supported tax year before the body is considered", async () => {
      const response = await request(app)
        .put(path("2023-24"))
        .send({ claims: { carryForward: { currentYearLosses: 200 } } });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
    });

    test("accepts a supported tax year with a non-empty body", async () => {
      const response = await request(app)
        .put(path("2026-27"))
        .send({ claims: { carryForward: { currentYearLosses: 200 } } });

      expect(response.status).toBe(204);
    });
  });

  describe("DELETE", () => {
    test("rejects a tax year below the minimum supported tax year", async () => {
      const response = await request(app).delete(path("2025-26"));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
    });

    test("accepts a supported tax year", async () => {
      const response = await request(app).delete(path("2026-27"));

      expect(response.status).toBe(204);
    });
  });
});
