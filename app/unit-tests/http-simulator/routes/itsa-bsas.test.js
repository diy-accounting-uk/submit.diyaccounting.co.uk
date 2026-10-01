// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-bsas.test.js

import { describe, test, expect } from "vitest";
import express from "express";
import request from "supertest";
import { apiEndpoint, findUnknownUkPropertyAdjustFields } from "@app/http-simulator/routes/itsa-bsas.js";

const ADJUST_URL =
  "/individuals/self-assessment/adjustable-summary/AB123456C/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2025-26";

function buildApp() {
  const app = express();
  app.use(express.json());
  apiEndpoint(app);
  return app;
}

describe("http-simulator/routes/itsa-bsas UK property adjust", () => {
  test("findUnknownUkPropertyAdjustFields returns no paths for fields the schema defines", () => {
    expect(
      findUnknownUkPropertyAdjustFields({
        income: { totalRentsReceived: 1, otherPropertyIncome: 2 },
        expenses: { repairsAndMaintenance: 3, residentialFinancialCost: 4 },
      }),
    ).toEqual([]);
  });

  test("findUnknownUkPropertyAdjustFields names each field the schema does not define", () => {
    expect(
      findUnknownUkPropertyAdjustFields({
        income: { totalRentsReceived: 1, bonus: 2 },
        expenses: { costOfReplacingDomesticItems: 3 },
      }),
    ).toEqual(["/ukProperty/income/bonus", "/ukProperty/expenses/costOfReplacingDomesticItems"]);
  });

  test("rejects an expenses field HMRC's request does not define with RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", async () => {
    const response = await request(buildApp())
      .post(ADJUST_URL)
      .send({ ukProperty: { expenses: { costOfReplacingDomesticItems: 100 } } });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    expect(response.body.paths).toEqual(["/ukProperty/expenses/costOfReplacingDomesticItems"]);
  });

  test("rejects an unknown field sent beside a valid one", async () => {
    const response = await request(buildApp())
      .post(ADJUST_URL)
      .send({ ukProperty: { income: { totalRentsReceived: 9000 }, expenses: { notAField: 1 } } });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
  });

  test("accepts income and expenses fields the schema defines", async () => {
    const response = await request(buildApp())
      .post(ADJUST_URL)
      .send({ ukProperty: { income: { totalRentsReceived: 9000 }, expenses: { repairsAndMaintenance: 250 } } });
    expect(response.status).toBe(200);
  });
});
