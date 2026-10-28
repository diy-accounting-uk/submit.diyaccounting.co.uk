// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-bsas.test.js

import { describe, test, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { apiEndpoint, findUnknownUkPropertyAdjustFields } from "@app/http-simulator/routes/itsa-bsas.js";
import { addForeignProperty, reset as resetState } from "@app/http-simulator/state/store.js";

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

const CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";
const FOREIGN_PREFIX = "/individuals/self-assessment/adjustable-summary/AB123456C/foreign-property";
const foreignAdjustUrl = (taxYear) => `${FOREIGN_PREFIX}/${CALCULATION_ID}/adjust/${taxYear}`;
const HELD_PROPERTY_ID = "8e8b8450-dc1b-4360-8109-7067337b42cb";
const figures = { income: { totalRentsReceived: 100 }, expenses: { repairsAndMaintenance: 10 } };

describe("http-simulator/routes/itsa-bsas foreign property", () => {
  beforeEach(() => {
    resetState();
    addForeignProperty("AB123456C", "XAIS12345678910", {
      propertyId: HELD_PROPERTY_ID,
      propertyName: "Villa Bleue",
      countryCode: "FRA",
      submittedOn: "2026-07-07T10:59:47.544Z",
    });
  });

  test("GET answers the scenario's summary on the HMRC path", async () => {
    const response = await request(buildApp())
      .get(`${FOREIGN_PREFIX}/${CALCULATION_ID}/2026-27`)
      .set("Gov-Test-Scenario", "FOREIGN_PROPERTY_PROFIT");
    expect(response.status).toBe(200);
    expect(response.body.adjustableSummaryCalculation.countryLevelDetail[0].propertyLevelDetail[0].propertyId).toBe(HELD_PROPERTY_ID);
  });

  test("GET answers not found without a scenario", async () => {
    const response = await request(buildApp()).get(`${FOREIGN_PREFIX}/${CALCULATION_ID}/2025-26`);
    expect(response.status).toBe(404);
  });

  test("GET refuses a bad calculation id", async () => {
    const response = await request(buildApp()).get(`${FOREIGN_PREFIX}/nope/2025-26`).set("Gov-Test-Scenario", "FOREIGN_PROPERTY_PROFIT");
    expect(response.body.code).toBe("FORMAT_CALCULATION_ID");
  });

  test.each([
    ["2023-24", { foreignProperty: [{ countryCode: "FRA", ...figures }] }],
    ["2024-25", { foreignProperty: { countryLevelDetail: [{ countryCode: "FRA", ...figures }] } }],
    ["2025-26", { foreignProperty: { countryLevelDetail: [{ countryCode: "FRA", ...figures }] } }],
    ["2026-27", { foreignProperty: { propertyLevelDetail: [{ propertyId: HELD_PROPERTY_ID, ...figures }] } }],
  ])("POST accepts the %s adjustment shape", async (taxYear, body) => {
    const response = await request(buildApp()).post(foreignAdjustUrl(taxYear)).send(body);
    expect(response.status).toBe(200);
  });

  test("POST accepts zeroAdjustments alone from 2024-25", async () => {
    const response = await request(buildApp())
      .post(foreignAdjustUrl("2025-26"))
      .send({ foreignProperty: { zeroAdjustments: true } });
    expect(response.status).toBe(200);
  });

  test("POST accepts the FHL in the EEA section alone in 2024-25", async () => {
    const response = await request(buildApp())
      .post(foreignAdjustUrl("2024-25"))
      .send({ foreignFhlEea: { income: { totalRentsReceived: 5 } } });
    expect(response.status).toBe(200);
  });

  test("POST refuses the FHL in the EEA section from 2025-26", async () => {
    const response = await request(buildApp())
      .post(foreignAdjustUrl("2025-26"))
      .send({ foreignFhlEea: { zeroAdjustments: true }, foreignProperty: { zeroAdjustments: true } });
    expect(response.body.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
  });

  test("POST refuses zeroAdjustments beside a country list", async () => {
    const response = await request(buildApp())
      .post(foreignAdjustUrl("2025-26"))
      .send({ foreignProperty: { zeroAdjustments: true, countryLevelDetail: [{ countryCode: "FRA", ...figures }] } });
    expect(response.body.code).toBe("RULE_BOTH_ADJUSTMENTS_SUPPLIED");
  });

  test.each([
    ["an empty body", "2025-26", {}, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
    [
      "the wrong list for the tax year",
      "2026-27",
      { foreignProperty: { countryLevelDetail: [{ countryCode: "FRA", ...figures }] } },
      "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
    ],
    [
      "a repeated country",
      "2025-26",
      { foreignProperty: { countryLevelDetail: [{ countryCode: "FRA" }, { countryCode: "FRA" }] } },
      "RULE_DUPLICATE_COUNTRY_CODE",
    ],
    ["a bad country code", "2025-26", { foreignProperty: { countryLevelDetail: [{ countryCode: "fr" }] } }, "FORMAT_COUNTRY_CODE"],
    [
      "a propertyId the store does not hold",
      "2026-27",
      { foreignProperty: { propertyLevelDetail: [{ propertyId: "11111111-1111-4111-8111-111111111111", ...figures }] } },
      "RULE_PROPERTY_ID_MISMATCH",
    ],
    [
      "itemised and consolidated expenses",
      "2025-26",
      { foreignProperty: { countryLevelDetail: [{ countryCode: "FRA", expenses: { consolidatedExpenses: 1, other: 1 } }] } },
      "RULE_BOTH_EXPENSES_SUPPLIED",
    ],
  ])("POST refuses %s", async (_name, taxYear, body, code) => {
    const response = await request(buildApp()).post(foreignAdjustUrl(taxYear)).send(body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe(code);
  });

  test("POST with a scenario answers that scenario's error", async () => {
    const response = await request(buildApp())
      .post(foreignAdjustUrl("2025-26"))
      .set("Gov-Test-Scenario", "FOREIGN_PROPERTY_INCOME_ALLOWANCE_CLAIMED")
      .send({ foreignProperty: { zeroAdjustments: true } });
    expect(response.body.code).toBe("RULE_PROPERTY_INCOME_ALLOWANCE_CLAIMED");
  });

  test("the trigger accepts foreign-property as the type of business", async () => {
    const response = await request(buildApp())
      .post("/individuals/self-assessment/adjustable-summary/AB123456C/trigger")
      .send({
        accountingPeriod: { startDate: "2025-04-06", endDate: "2026-04-05" },
        typeOfBusiness: "foreign-property",
        businessId: "XAIS12345678910",
      });
    expect(response.status).toBe(200);
    expect(response.body.calculationId).toBeTruthy();
  });
});
