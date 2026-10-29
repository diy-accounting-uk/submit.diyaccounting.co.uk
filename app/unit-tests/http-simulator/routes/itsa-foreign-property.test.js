// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-foreign-property.test.js

import { describe, test, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { apiEndpoint as detailsEndpoint } from "@app/http-simulator/routes/itsa-foreign-property-details.js";
import { apiEndpoint as periodEndpoint } from "@app/http-simulator/routes/itsa-foreign-property-period.js";
import { apiEndpoint as periodDetailEndpoint } from "@app/http-simulator/routes/itsa-foreign-property-period-detail.js";
import { apiEndpoint as cumulativeEndpoint } from "@app/http-simulator/routes/itsa-foreign-property-cumulative.js";
import { apiEndpoint as annualEndpoint } from "@app/http-simulator/routes/itsa-foreign-property-annual.js";
import { getForeignAnnualCountries, reset as resetState } from "@app/http-simulator/state/store.js";

const NINO = "AB123456C";
const BUSINESS_ID = "XAIS12345678910";
const BASE = "/individuals/business/property/foreign";
const SUBMISSION_ID = "2025-04-06_2025-07-05";
const UNHELD_PROPERTY_ID = "11111111-1111-4111-8111-111111111111";

function buildApp() {
  const app = express();
  app.use(express.json());
  detailsEndpoint(app);
  periodEndpoint(app);
  periodDetailEndpoint(app);
  cumulativeEndpoint(app);
  annualEndpoint(app);
  return app;
}

const detailsUrl = (taxYear = "2026-27") => `${BASE}/${NINO}/${BUSINESS_ID}/details/${taxYear}`;
const detailsPutUrl = (propertyId, taxYear = "2026-27") => `${BASE}/${NINO}/details/${propertyId}/${taxYear}`;
const periodUrl = (taxYear) => `${BASE}/${NINO}/${BUSINESS_ID}/period/${taxYear}`;
const periodDetailUrl = (taxYear) => `${BASE}/${NINO}/${BUSINESS_ID}/period/${taxYear}/${SUBMISSION_ID}`;
const cumulativeUrl = (taxYear) => `${BASE}/${NINO}/${BUSINESS_ID}/cumulative/${taxYear}`;
const annualUrl = (taxYear) => `${BASE}/${NINO}/${BUSINESS_ID}/annual/${taxYear}`;

const datedIncome = { rentIncome: { rentAmount: 1000 }, foreignTaxCreditRelief: false };
const datedBody = (extra = {}) => ({
  fromDate: "2024-04-06",
  toDate: "2024-07-05",
  foreignNonFhlProperty: [{ countryCode: "FRA", income: datedIncome, expenses: { repairsAndMaintenance: 100 } }],
  ...extra,
});

describe("http-simulator/routes/itsa-foreign-property", () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  async function createProperty(propertyName, countryCode = "FRA", extra = {}) {
    const response = await request(app)
      .post(detailsUrl())
      .send({ propertyName, countryCode, ...extra });
    expect(response.status).toBe(200);
    return response.body.propertyId;
  }

  describe("path parameters", () => {
    test.each([
      ["NINO", `${BASE}/not-a-nino/${BUSINESS_ID}/cumulative/2025-26`, "FORMAT_NINO"],
      ["business ID", `${BASE}/${NINO}/bad/cumulative/2025-26`, "FORMAT_BUSINESS_ID"],
      ["tax year", `${BASE}/${NINO}/${BUSINESS_ID}/cumulative/2025`, "FORMAT_TAX_YEAR"],
      ["tax year range", `${BASE}/${NINO}/${BUSINESS_ID}/cumulative/2025-28`, "RULE_TAX_YEAR_RANGE_INVALID"],
    ])("rejects a bad %s", async (_name, url, code) => {
      const response = await request(app).get(url);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });
  });

  describe("details", () => {
    test("a propertyId from POST is listed by GET and taken by the cumulative PUT", async () => {
      const propertyId = await createProperty("Villa Bleue");

      const listed = await request(app).get(detailsUrl());
      expect(listed.status).toBe(200);
      expect(listed.body.foreignPropertyDetails).toEqual([
        expect.objectContaining({ propertyId, propertyName: "Villa Bleue", countryCode: "FRA" }),
      ]);

      const put = await request(app)
        .put(cumulativeUrl("2026-27"))
        .send({ foreignProperty: [{ propertyId, income: { rentIncome: { rentAmount: 500 } } }] });
      expect(put.status).toBe(204);
    });

    test("GET answers not found while no property exists", async () => {
      const response = await request(app).get(detailsUrl());
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    test("GET with the NOT_FOUND scenario answers not found even when a property exists", async () => {
      await createProperty("Villa Bleue");
      const response = await request(app).get(detailsUrl()).set("Gov-Test-Scenario", "NOT_FOUND");
      expect(response.status).toBe(404);
    });

    test.each(["GET", "POST"])("%s refuses a tax year before 2026-27", async (method) => {
      const response = await request(app)[method.toLowerCase()](detailsUrl("2025-26")).send({ propertyName: "A", countryCode: "FRA" });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
    });

    test("POST refuses a name already used in the same country, ignoring case and spaces", async () => {
      await createProperty("Villa Bleue");
      const response = await request(app).post(detailsUrl()).send({ propertyName: "  villa bleue ", countryCode: "FRA" });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_DUPLICATE_PROPERTY_NAME");
    });

    test("POST accepts the same name in another country", async () => {
      await createProperty("Casa", "FRA");
      await createProperty("Casa", "ESP");
      const listed = await request(app).get(detailsUrl());
      expect(listed.body.foreignPropertyDetails).toHaveLength(2);
    });

    test.each([
      ["a missing propertyName", { countryCode: "FRA" }, "FORMAT_PROPERTY_NAME"],
      ["a blank propertyName", { propertyName: "   ", countryCode: "FRA" }, "FORMAT_PROPERTY_NAME"],
      ["a propertyName over 105 characters", { propertyName: "x".repeat(106), countryCode: "FRA" }, "FORMAT_PROPERTY_NAME"],
      ["a lower case countryCode", { propertyName: "A", countryCode: "fra" }, "FORMAT_COUNTRY_CODE"],
      ["a two letter countryCode", { propertyName: "A", countryCode: "FR" }, "FORMAT_COUNTRY_CODE"],
      ["an endDate without endReason", { propertyName: "A", countryCode: "FRA", endDate: "2026-08-24" }, "RULE_MISSING_END_DETAILS"],
      ["an endReason without endDate", { propertyName: "A", countryCode: "FRA", endReason: "disposal" }, "RULE_MISSING_END_DETAILS"],
      [
        "an endReason added-in-error on create",
        { propertyName: "A", countryCode: "FRA", endDate: "2026-08-24", endReason: "added-in-error" },
        "FORMAT_END_REASON",
      ],
      [
        "an endDate that is not a date",
        { propertyName: "A", countryCode: "FRA", endDate: "2026-02-30", endReason: "disposal" },
        "FORMAT_END_DATE",
      ],
      [
        "an endDate before the tax year",
        { propertyName: "A", countryCode: "FRA", endDate: "2026-04-05", endReason: "disposal" },
        "RULE_END_DATE_BEFORE_TAX_YEAR_START",
      ],
      [
        "an endDate after the tax year",
        { propertyName: "A", countryCode: "FRA", endDate: "2027-04-06", endReason: "disposal" },
        "RULE_END_DATE_AFTER_TAX_YEAR_END",
      ],
      ["an empty body", {}, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
    ])("POST refuses %s", async (_name, body, code) => {
      const response = await request(app).post(detailsUrl()).send(body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test("an ended property is not listed for the next tax year", async () => {
      await createProperty("Old flat", "FRA", { endDate: "2026-08-24", endReason: "disposal" });
      await createProperty("New flat", "FRA");
      const next = await request(app).get(detailsUrl("2027-28"));
      expect(next.body.foreignPropertyDetails.map((property) => property.propertyName)).toEqual(["New flat"]);
    });

    test.each([
      ["DUPLICATE_PROPERTY_NAME", "RULE_DUPLICATE_PROPERTY_NAME"],
      ["PROPERTY_BUSINESS_CEASED", "RULE_PROPERTY_BUSINESS_CEASED"],
      ["OUTSIDE_AMENDMENT_WINDOW", "RULE_OUTSIDE_AMENDMENT_WINDOW"],
      ["TAX_YEAR_BEFORE_BUSINESS_START", "RULE_TAX_YEAR_BEFORE_BUSINESS_START"],
    ])("POST with the %s scenario answers %s", async (scenario, code) => {
      const response = await request(app)
        .post(detailsUrl())
        .set("Gov-Test-Scenario", scenario)
        .send({ propertyName: "A", countryCode: "FRA" });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test("POST with the NOT_FOUND scenario answers not found", async () => {
      const response = await request(app)
        .post(detailsUrl())
        .set("Gov-Test-Scenario", "NOT_FOUND")
        .send({ propertyName: "A", countryCode: "FRA" });
      expect(response.status).toBe(404);
    });

    test("PUT renames a property and ends it", async () => {
      const propertyId = await createProperty("Villa Bleue");
      const put = await request(app)
        .put(detailsPutUrl(propertyId))
        .send({ propertyName: "Villa Rouge", endDate: "2026-09-01", endReason: "added-in-error" });
      expect(put.status).toBe(204);

      const listed = await request(app).get(detailsUrl());
      expect(listed.body.foreignPropertyDetails[0]).toEqual(
        expect.objectContaining({ propertyId, propertyName: "Villa Rouge", endDate: "2026-09-01", endReason: "added-in-error" }),
      );
    });

    test("PUT refuses a rename to the name of another property in the country", async () => {
      await createProperty("Villa Bleue");
      const second = await createProperty("Villa Rouge");
      const response = await request(app).put(detailsPutUrl(second)).send({ propertyName: "VILLA BLEUE" });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_DUPLICATE_PROPERTY_NAME");
    });

    test("PUT accepts the property's own name", async () => {
      const propertyId = await createProperty("Villa Bleue");
      const response = await request(app).put(detailsPutUrl(propertyId)).send({ propertyName: "Villa Bleue" });
      expect(response.status).toBe(204);
    });

    test("PUT answers not found for a propertyId the store does not hold", async () => {
      const response = await request(app).put(detailsPutUrl(UNHELD_PROPERTY_ID)).send({ propertyName: "A" });
      expect(response.status).toBe(404);
    });

    test("PUT refuses a propertyId that is not a UUID", async () => {
      const response = await request(app).put(detailsPutUrl("nope")).send({ propertyName: "A" });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("FORMAT_PROPERTY_ID");
    });

    test("PUT with the OUTSIDE_AMENDMENT_WINDOW scenario answers that rule", async () => {
      const propertyId = await createProperty("Villa Bleue");
      const response = await request(app)
        .put(detailsPutUrl(propertyId))
        .set("Gov-Test-Scenario", "OUTSIDE_AMENDMENT_WINDOW")
        .send({ propertyName: "Villa Rouge" });
      expect(response.body.code).toBe("RULE_OUTSIDE_AMENDMENT_WINDOW");
    });
  });

  describe("dated period create", () => {
    test("answers 201 with a submissionId", async () => {
      const response = await request(app).post(periodUrl("2024-25")).send(datedBody());
      expect(response.status).toBe(201);
      expect(response.body.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test("accepts the FHL in the EEA section alone", async () => {
      const response = await request(app)
        .post(periodUrl("2024-25"))
        .send({ fromDate: "2024-04-06", toDate: "2024-07-05", foreignFhlEea: { income: { rentAmount: 500 } } });
      expect(response.status).toBe(201);
    });

    test("refuses a tax year the cumulative model serves", async () => {
      const response = await request(app).post(periodUrl("2025-26")).send(datedBody());
      expect(response.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
    });

    test.each([
      ["no dates", { fromDate: undefined, toDate: undefined }, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      ["neither section", { foreignNonFhlProperty: undefined }, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      ["an empty country list", { foreignNonFhlProperty: [] }, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      ["an empty FHL section", { foreignFhlEea: {}, foreignNonFhlProperty: undefined }, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      ["a bad country code", { foreignNonFhlProperty: [{ countryCode: "fr", income: datedIncome }] }, "FORMAT_COUNTRY_CODE"],
      [
        "a repeated country",
        {
          foreignNonFhlProperty: [
            { countryCode: "FRA", income: datedIncome },
            { countryCode: "FRA", income: datedIncome },
          ],
        },
        "RULE_DUPLICATE_COUNTRY_CODE",
      ],
      [
        "itemised and consolidated expenses",
        { foreignNonFhlProperty: [{ countryCode: "FRA", income: datedIncome, expenses: { consolidatedExpenses: 5, other: 5 } }] },
        "RULE_BOTH_EXPENSES_SUPPLIED",
      ],
      [
        "no foreignTaxCreditRelief",
        { foreignNonFhlProperty: [{ countryCode: "FRA", income: { rentIncome: { rentAmount: 1 } } }] },
        "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      ],
      [
        "no rentAmount",
        { foreignNonFhlProperty: [{ countryCode: "FRA", income: { foreignTaxCreditRelief: true } }] },
        "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      ],
    ])("refuses %s", async (_name, change, code) => {
      const response = await request(app).post(periodUrl("2024-25")).send(datedBody(change));
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test.each([
      ["DUPLICATE_SUBMISSION", 400, "RULE_DUPLICATE_SUBMISSION"],
      ["UK_PROPERTY", 400, "RULE_TYPE_OF_BUSINESS_INCORRECT"],
      ["NOT_FOUND", 404, "MATCHING_RESOURCE_NOT_FOUND"],
    ])("the %s scenario answers %s", async (scenario, status, code) => {
      const response = await request(app).post(periodUrl("2024-25")).set("Gov-Test-Scenario", scenario).send(datedBody());
      expect(response.status).toBe(status);
      expect(response.body.code).toBe(code);
    });

    test("the STATEFUL scenario creates", async () => {
      const response = await request(app).post(periodUrl("2024-25")).set("Gov-Test-Scenario", "STATEFUL").send(datedBody());
      expect(response.status).toBe(201);
    });
  });

  describe("dated period detail", () => {
    test("GET answers not found without a scenario", async () => {
      const response = await request(app).get(periodDetailUrl("2024-25"));
      expect(response.status).toBe(404);
    });

    test("GET with FOREIGN_PROPERTY answers both sections", async () => {
      const response = await request(app).get(periodDetailUrl("2024-25")).set("Gov-Test-Scenario", "FOREIGN_PROPERTY");
      expect(response.status).toBe(200);
      expect(response.body.foreignFhlEea.income.rentAmount).toBe(200.22);
      expect(response.body.foreignNonFhlProperty[0].countryCode).toBe("FRA");
    });

    test("GET with FOREIGN_NON_FHL_CONSOLIDATED answers consolidated expenses", async () => {
      const response = await request(app).get(periodDetailUrl("2024-25")).set("Gov-Test-Scenario", "FOREIGN_NON_FHL_CONSOLIDATED");
      expect(response.body.foreignNonFhlProperty[0].expenses).toEqual({ consolidatedExpenses: 800 });
      expect(response.body.foreignFhlEea).toBeUndefined();
    });

    test("GET with UK_PROPERTY answers the wrong business type", async () => {
      const response = await request(app).get(periodDetailUrl("2024-25")).set("Gov-Test-Scenario", "UK_PROPERTY");
      expect(response.body.code).toBe("RULE_TYPE_OF_BUSINESS_INCORRECT");
    });

    test("PUT answers 200 for a valid amendment", async () => {
      const response = await request(app)
        .put(periodDetailUrl("2024-25"))
        .send({ foreignNonFhlProperty: [{ countryCode: "FRA", income: { foreignTaxCreditRelief: true } }] });
      expect(response.status).toBe(200);
    });

    test("PUT refuses a body with neither section", async () => {
      const response = await request(app).put(periodDetailUrl("2024-25")).send({});
      expect(response.body.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
    });

    test("PUT refuses a repeated country", async () => {
      const entry = { countryCode: "FRA", income: { foreignTaxCreditRelief: true } };
      const response = await request(app)
        .put(periodDetailUrl("2024-25"))
        .send({ foreignNonFhlProperty: [entry, entry] });
      expect(response.body.code).toBe("RULE_DUPLICATE_COUNTRY_CODE");
    });

    test("GET and PUT refuse a cumulative tax year", async () => {
      const get = await request(app).get(periodDetailUrl("2025-26")).set("Gov-Test-Scenario", "FOREIGN_PROPERTY");
      const put = await request(app).put(periodDetailUrl("2025-26")).send(datedBody());
      expect(get.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
      expect(put.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
    });
  });

  describe("cumulative", () => {
    const entry2025 = (countryCode, extra = {}) => ({ countryCode, income: { rentIncome: { rentAmount: 100 } }, ...extra });

    test("PUT answers 204 for a country entry in 2025-26", async () => {
      const response = await request(app)
        .put(cumulativeUrl("2025-26"))
        .send({
          foreignProperty: [entry2025("FRA", { expenses: { other: 5 } }), entry2025("ESP", { expenses: { consolidatedExpenses: 5 } })],
        });
      expect(response.status).toBe(204);
    });

    test("PUT refuses a propertyId key in 2025-26 and a countryCode key in 2026-27", async () => {
      const byProperty = await request(app)
        .put(cumulativeUrl("2025-26"))
        .send({ foreignProperty: [{ propertyId: UNHELD_PROPERTY_ID }] });
      expect(byProperty.body.code).toBe("FORMAT_COUNTRY_CODE");
      const byCountry = await request(app)
        .put(cumulativeUrl("2026-27"))
        .send({ foreignProperty: [entry2025("FRA")] });
      expect(byCountry.body.code).toBe("FORMAT_PROPERTY_ID");
    });

    test("PUT refuses a propertyId the store does not hold", async () => {
      const response = await request(app)
        .put(cumulativeUrl("2026-27"))
        .send({ foreignProperty: [{ propertyId: UNHELD_PROPERTY_ID }] });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("RULE_PROPERTY_ID_MISMATCH");
    });

    test("PUT refuses a repeated propertyId", async () => {
      const propertyId = await createProperty("Villa Bleue");
      const response = await request(app)
        .put(cumulativeUrl("2026-27"))
        .send({ foreignProperty: [{ propertyId }, { propertyId }] });
      expect(response.body.code).toBe("RULE_DUPLICATE_PROPERTY_ID");
    });

    test("PUT takes two held properties in one body", async () => {
      const first = await createProperty("Villa Bleue");
      const second = await createProperty("Casa", "ESP");
      const response = await request(app)
        .put(cumulativeUrl("2026-27"))
        .send({ foreignProperty: [{ propertyId: first, income: { rentIncome: { rentAmount: 1 } } }, { propertyId: second }] });
      expect(response.status).toBe(204);
    });

    test.each([
      ["a missing list", {}, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      ["an empty list", { foreignProperty: [] }, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      ["a repeated country", { foreignProperty: [entry2025("FRA"), entry2025("FRA")] }, "RULE_DUPLICATE_COUNTRY_CODE"],
      [
        "itemised and consolidated expenses",
        { foreignProperty: [entry2025("FRA", { expenses: { consolidatedExpenses: 1, travelCosts: 1 } })] },
        "RULE_BOTH_EXPENSES_SUPPLIED",
      ],
    ])("PUT refuses %s", async (_name, body, code) => {
      const response = await request(app).put(cumulativeUrl("2025-26")).send(body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test("PUT and GET refuse a dated tax year", async () => {
      const put = await request(app)
        .put(cumulativeUrl("2024-25"))
        .send({ foreignProperty: [entry2025("FRA")] });
      const get = await request(app).get(cumulativeUrl("2024-25"));
      expect(put.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
      expect(get.body.code).toBe("RULE_TAX_YEAR_NOT_SUPPORTED");
    });

    test.each([
      ["PROPERTY_ID_MISMATCH", "RULE_PROPERTY_ID_MISMATCH"],
      ["TAX_YEAR_NOT_SUPPORTED", "RULE_TAX_YEAR_NOT_SUPPORTED"],
      ["UK_PROPERTY", "RULE_TYPE_OF_BUSINESS_INCORRECT"],
      ["OUTSIDE_AMENDMENT_WINDOW", "RULE_OUTSIDE_AMENDMENT_WINDOW"],
    ])("PUT with the %s scenario answers %s", async (scenario, code) => {
      const response = await request(app)
        .put(cumulativeUrl("2025-26"))
        .set("Gov-Test-Scenario", scenario)
        .send({ foreignProperty: [entry2025("FRA")] });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test.each([
      ["SUBMIT_API_HTTP_500", 500],
      ["SUBMIT_HMRC_API_HTTP_500", 500],
    ])("PUT with the %s scenario answers %s", async (scenario, status) => {
      const response = await request(app)
        .put(cumulativeUrl("2025-26"))
        .set("Gov-Test-Scenario", scenario)
        .send({ foreignProperty: [entry2025("FRA")] });
      expect(response.status).toBe(status);
    });

    test("PUT with the NOT_FOUND scenario answers not found", async () => {
      const response = await request(app)
        .put(cumulativeUrl("2025-26"))
        .set("Gov-Test-Scenario", "NOT_FOUND")
        .send({ foreignProperty: [entry2025("FRA")] });
      expect(response.status).toBe(404);
    });

    test("GET answers a country entry in 2025-26 and the held property in 2026-27", async () => {
      const early = await request(app).get(cumulativeUrl("2025-26"));
      expect(early.status).toBe(200);
      expect(early.body.foreignProperty[0].countryCode).toBe("AFG");

      const propertyId = await createProperty("Villa Bleue");
      const later = await request(app).get(cumulativeUrl("2026-27"));
      expect(later.body.foreignProperty[0].propertyId).toBe(propertyId);
      expect(later.body.foreignProperty[0].countryCode).toBeUndefined();
    });

    test("GET with FOREIGN_PROPERTY_CONSOLIDATED answers consolidated expenses", async () => {
      const response = await request(app).get(cumulativeUrl("2025-26")).set("Gov-Test-Scenario", "FOREIGN_PROPERTY_CONSOLIDATED");
      expect(response.body.foreignProperty[0].expenses).toEqual({ consolidatedExpenses: 800 });
    });

    test("GET with NOT_FOUND answers not found", async () => {
      const response = await request(app).get(cumulativeUrl("2025-26")).set("Gov-Test-Scenario", "NOT_FOUND");
      expect(response.status).toBe(404);
    });

    test("GET with UK_PROPERTY answers the wrong business type", async () => {
      const response = await request(app).get(cumulativeUrl("2025-26")).set("Gov-Test-Scenario", "UK_PROPERTY");
      expect(response.body.code).toBe("RULE_TYPE_OF_BUSINESS_INCORRECT");
    });
  });

  describe("annual", () => {
    const allowances = { annualInvestmentAllowance: 100 };

    test("PUT answers 200 for a country entry in 2025-26", async () => {
      const response = await request(app)
        .put(annualUrl("2025-26"))
        .send({
          foreignProperty: [
            { countryCode: "FRA", allowances },
            { countryCode: "ESP", allowances: { propertyIncomeAllowance: 500 } },
          ],
        });
      expect(response.status).toBe(200);
    });

    test("PUT keeps the saved countries for the year-end summary and a later PUT replaces them", async () => {
      const send = (countryCodes) =>
        request(app)
          .put(annualUrl("2025-26"))
          .send({ foreignProperty: countryCodes.map((countryCode) => ({ countryCode, allowances })) });
      await send(["FRA", "ESP"]);
      expect(getForeignAnnualCountries(NINO, "2025-26")).toEqual(["FRA", "ESP"]);
      await send(["DEU"]);
      expect(getForeignAnnualCountries(NINO, "2025-26")).toEqual(["DEU"]);
      expect(getForeignAnnualCountries(NINO, "2024-25")).toEqual([]);
    });

    test("PUT in 2024-25 takes the FHL in the EEA section alone", async () => {
      const response = await request(app)
        .put(annualUrl("2024-25"))
        .send({ foreignFhlEea: { adjustments: { periodOfGraceAdjustment: true }, allowances } });
      expect(response.status).toBe(200);
    });

    test("PUT from 2025-26 refuses the FHL in the EEA section", async () => {
      const response = await request(app)
        .put(annualUrl("2025-26"))
        .send({ foreignFhlEea: { allowances }, foreignProperty: [{ countryCode: "FRA", allowances }] });
      expect(response.body.code).toBe("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED");
      expect(response.body.paths).toEqual(["/foreignFhlEea"]);
    });

    test("PUT in 2026-27 takes a held propertyId and refuses an unheld one", async () => {
      const propertyId = await createProperty("Villa Bleue");
      const held = await request(app)
        .put(annualUrl("2026-27"))
        .send({ foreignProperty: [{ propertyId, allowances }] });
      expect(held.status).toBe(200);
      const unheld = await request(app)
        .put(annualUrl("2026-27"))
        .send({ foreignProperty: [{ propertyId: UNHELD_PROPERTY_ID, allowances }] });
      expect(unheld.body.code).toBe("RULE_PROPERTY_ID_MISMATCH");
    });

    test.each([
      ["an empty body", {}, "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED"],
      [
        "a repeated country",
        {
          foreignProperty: [
            { countryCode: "FRA", allowances },
            { countryCode: "FRA", allowances },
          ],
        },
        "RULE_DUPLICATE_COUNTRY_CODE",
      ],
      [
        "propertyIncomeAllowance with an itemised allowance",
        { foreignProperty: [{ countryCode: "FRA", allowances: { propertyIncomeAllowance: 1, otherCapitalAllowance: 1 } }] },
        "RULE_BOTH_ALLOWANCES_SUPPLIED",
      ],
      [
        "propertyIncomeAllowance with a private use adjustment",
        { foreignProperty: [{ countryCode: "FRA", adjustments: { privateUseAdjustment: 1 }, allowances: { propertyIncomeAllowance: 1 } }] },
        "RULE_PROPERTY_INCOME_ALLOWANCE",
      ],
    ])("PUT refuses %s", async (_name, body, code) => {
      const response = await request(app).put(annualUrl("2025-26")).send(body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test.each([
      ["PROPERTY_INCOME_ALLOWANCE", "RULE_PROPERTY_INCOME_ALLOWANCE"],
      ["TYPE_OF_BUSINESS_INCORRECT", "RULE_TYPE_OF_BUSINESS_INCORRECT"],
      ["UK_PROPERTY", "RULE_TYPE_OF_BUSINESS_INCORRECT"],
      ["OUTSIDE_AMENDMENT_WINDOW", "RULE_OUTSIDE_AMENDMENT_WINDOW"],
      ["PROPERTY_ID_MISMATCH", "RULE_PROPERTY_ID_MISMATCH"],
    ])("PUT with the %s scenario answers %s", async (scenario, code) => {
      const response = await request(app)
        .put(annualUrl("2025-26"))
        .set("Gov-Test-Scenario", scenario)
        .send({ foreignProperty: [{ countryCode: "FRA", allowances }] });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
    });

    test("PUT with the NOT_FOUND scenario answers not found", async () => {
      const response = await request(app)
        .put(annualUrl("2025-26"))
        .set("Gov-Test-Scenario", "NOT_FOUND")
        .send({ foreignProperty: [{ countryCode: "FRA", allowances }] });
      expect(response.status).toBe(404);
    });

    test("GET answers not found without a scenario", async () => {
      const response = await request(app).get(annualUrl("2025-26"));
      expect(response.status).toBe(404);
    });

    test("GET with FOREIGN_PROPERTY keys the entry by tax year", async () => {
      const early = await request(app).get(annualUrl("2025-26")).set("Gov-Test-Scenario", "FOREIGN_PROPERTY");
      expect(early.body.foreignProperty[0].countryCode).toBe("LBN");
      const propertyId = await createProperty("Villa Bleue");
      const later = await request(app).get(annualUrl("2026-27")).set("Gov-Test-Scenario", "FOREIGN_PROPERTY");
      expect(later.body.foreignProperty[0].propertyId).toBe(propertyId);
    });

    test("GET with FOREIGN_ALL_OTHER_ALLOWANCES answers a structures and buildings row", async () => {
      const response = await request(app).get(annualUrl("2025-26")).set("Gov-Test-Scenario", "FOREIGN_ALL_OTHER_ALLOWANCES");
      expect(response.body.foreignProperty[0].allowances.structuredBuildingAllowance).toHaveLength(1);
      expect(response.body.foreignProperty[0].allowances.electricChargePointAllowance).toBeUndefined();
    });

    test("GET with FOREIGN_FHL_PROPERTY_ALLOWANCE answers the FHL section before 2025-26 and not found after", async () => {
      const early = await request(app).get(annualUrl("2024-25")).set("Gov-Test-Scenario", "FOREIGN_FHL_PROPERTY_ALLOWANCE");
      expect(early.body.foreignFhlEea.allowances.propertyIncomeAllowance).toBe(100.25);
      const later = await request(app).get(annualUrl("2025-26")).set("Gov-Test-Scenario", "FOREIGN_FHL_PROPERTY_ALLOWANCE");
      expect(later.status).toBe(404);
    });

    test("GET with UK_PROPERTY answers the wrong business type", async () => {
      const response = await request(app).get(annualUrl("2025-26")).set("Gov-Test-Scenario", "UK_PROPERTY");
      expect(response.body.code).toBe("RULE_TYPE_OF_BUSINESS_INCORRECT");
    });
  });
});
