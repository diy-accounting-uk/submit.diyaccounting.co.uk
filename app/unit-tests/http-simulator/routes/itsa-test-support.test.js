// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-test-support.test.js

import { describe, test, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { apiEndpoint as itsaTestSupportEndpoint } from "@app/http-simulator/routes/itsa-test-support.js";
import { apiEndpoint as itsaBusinessDetailsEndpoint } from "@app/http-simulator/routes/itsa-business-details.js";
import { reset as resetState } from "@app/http-simulator/state/store.js";

const NINO = "AA123456A";

function buildApp() {
  const app = express();
  app.use(express.json());
  itsaTestSupportEndpoint(app);
  itsaBusinessDetailsEndpoint(app);
  return app;
}

describe("http-simulator/routes/itsa-test-support", () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  describe("POST /individuals/self-assessment-test-support/business/{nino}", () => {
    test("creates a business and answers 201 with a businessId shaped like HMRC's", async () => {
      const response = await request(app)
        .post(`/individuals/self-assessment-test-support/business/${NINO}`)
        .send({ typeOfBusiness: "uk-property" });

      expect(response.status).toBe(201);
      expect(response.body.businessId).toMatch(/^X[A-Za-z0-9]IS\d{11}$/);
    });

    test("rejects an invalid NINO", async () => {
      const response = await request(app)
        .post("/individuals/self-assessment-test-support/business/not-a-nino")
        .send({ typeOfBusiness: "uk-property" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("FORMAT_NINO");
    });

    test("rejects a body with no typeOfBusiness", async () => {
      const response = await request(app).post(`/individuals/self-assessment-test-support/business/${NINO}`).send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    test("the created business is returned by the Business Details list for the same NINO", async () => {
      const created = await request(app)
        .post(`/individuals/self-assessment-test-support/business/${NINO}`)
        .send({ typeOfBusiness: "uk-property" });

      const listed = await request(app).get(`/individuals/business/details/${NINO}/list`);

      expect(listed.status).toBe(200);
      expect(listed.body.listOfBusinesses).toEqual([{ typeOfBusiness: "uk-property", businessId: created.body.businessId }]);
    });

    test("a Gov-Test-Scenario request still gets the scenario's own list, not a created business", async () => {
      await request(app).post(`/individuals/self-assessment-test-support/business/${NINO}`).send({ typeOfBusiness: "uk-property" });

      const listed = await request(app).get(`/individuals/business/details/${NINO}/list`).set("Gov-Test-Scenario", "PROPERTY");

      expect(listed.body.listOfBusinesses).toEqual([{ typeOfBusiness: "uk-property", businessId: "XPIS00000000001" }]);
    });

    test("a NINO with no created business still gets the default list", async () => {
      const listed = await request(app).get(`/individuals/business/details/${NINO}/list`);

      expect(listed.status).toBe(200);
      expect(listed.body.listOfBusinesses).toHaveLength(1);
      expect(listed.body.listOfBusinesses[0].typeOfBusiness).toBe("self-employment");
    });
  });

  describe("POST /individuals/self-assessment-test-support/itsa-status/{nino}/{taxYear}", () => {
    test("sets an ITSA status and answers 204", async () => {
      const response = await request(app)
        .post(`/individuals/self-assessment-test-support/itsa-status/${NINO}/2024-25`)
        .send({ itsaStatusDetails: [{ status: "MTD Mandated", statusReason: "Sign up - return available" }] });

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
    });

    test("rejects an invalid NINO", async () => {
      const response = await request(app).post("/individuals/self-assessment-test-support/itsa-status/not-a-nino/2024-25").send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("FORMAT_NINO");
    });

    test("rejects a malformed tax year", async () => {
      const response = await request(app).post(`/individuals/self-assessment-test-support/itsa-status/${NINO}/2024`).send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("FORMAT_TAX_YEAR");
    });
  });
});
