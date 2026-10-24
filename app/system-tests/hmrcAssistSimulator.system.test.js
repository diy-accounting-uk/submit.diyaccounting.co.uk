// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/hmrcAssistSimulator.system.test.js
// System tests for the HTTP simulator's HMRC Assist endpoints

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startSimulator } from "../http-simulator/index.js";

const vrn = "123456789";
const nino = "AA123456A";
const taxYear = "2025-26";
const anyCalculationId = "11111111-2222-4333-8444-555555555555";
const noMessagesCalculationId = "620490b4-06e3-4fef-a555-6fd0877dc7ca";
const notFoundCalculationId = "640490b4-06e3-4fef-a555-6fd0877dc7ca";

const vatBody = {
  periodKey: "18AD",
  vatDueSales: 1000,
  vatDueAcquisitions: 0,
  totalVatDue: 1000,
  vatReclaimedCurrPeriod: 400,
  netVatDue: 600,
  totalValueSalesExVAT: 5000,
  totalValuePurchasesExVAT: 500,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
};

describe("HTTP Simulator HMRC Assist", () => {
  let simulator;
  let baseUrl;

  beforeAll(async () => {
    simulator = await startSimulator({ port: 0 });
    baseUrl = simulator.baseUrl;
  });

  afterAll(async () => {
    if (simulator) await simulator.stop();
  });

  function postJson(path, body, headers = {}) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  describe("VAT", () => {
    const feedbackPath = `/organisations/vat-assist/feedback/${vrn}`;
    const acknowledgePath = (reportId, correlationId, presentedDateTime = "2026-06-09T10:30:00Z") =>
      `/organisations/vat-assist/acknowledge/${vrn}/${reportId}/${correlationId}?presentedDateTime=${encodeURIComponent(presentedDateTime)}`;

    it("returns one English and one Welsh message by default, a correlation id and an X-CorrelationId header", async () => {
      const response = await postJson(feedbackPath, vatBody);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-correlationid")).toBeTruthy();
      const report = await response.json();
      expect(report.reportId).toMatch(/^[0-9a-f-]{36}$/);
      expect(report.correlationId).toMatch(/^[0-9A-F]{64}$/);
      expect(report.englishFeedback.map((message) => message.itemNumber)).toEqual(["1"]);
      expect(report.welshFeedback.map((message) => message.itemNumber)).toEqual(["1"]);
      expect(report.englishFeedback[0].path).toBe("vatDueSales");
    });

    it("returns two ordered messages for MULTIPLE_FEEDBACK", async () => {
      const response = await postJson(feedbackPath, vatBody, { "Gov-Test-Scenario": "MULTIPLE_FEEDBACK" });
      expect(response.status).toBe(200);
      const report = await response.json();
      expect(report.englishFeedback.map((message) => message.path)).toEqual(["vatDueSales", "totalValuePurchasesExVAT"]);
      expect(report.welshFeedback).toHaveLength(2);
    });

    it("returns the item 0 message without a correlation id for NO_FEEDBACK", async () => {
      const response = await postJson(feedbackPath, vatBody, { "Gov-Test-Scenario": "NO_FEEDBACK" });
      expect(response.status).toBe(200);
      const report = await response.json();
      expect(report.correlationId).toBeUndefined();
      expect(report.englishFeedback.map((message) => message.itemNumber)).toEqual(["0"]);
      expect(report.englishFeedback[0].path).toBeUndefined();
    });

    it("acknowledges an issued report with 204 and refuses a forged correlation id with 403", async () => {
      const report = await (await postJson(feedbackPath, vatBody)).json();
      const ok = await postJson(acknowledgePath(report.reportId, report.correlationId));
      expect(ok.status).toBe(204);
      const forged = await postJson(acknowledgePath(report.reportId, "0".repeat(64)));
      expect(forged.status).toBe(403);
      expect((await forged.json()).code).toBe("CORRELATION_ID");
    });

    it("rejects an acknowledgement without a valid presentedDateTime", async () => {
      const report = await (await postJson(feedbackPath, vatBody)).json();
      const missing = await postJson(`/organisations/vat-assist/acknowledge/${vrn}/${report.reportId}/${report.correlationId}`);
      expect(missing.status).toBe(400);
      expect((await missing.json()).code).toBe("FORMAT_DATETIME");
      const bad = await postJson(acknowledgePath(report.reportId, report.correlationId, "yesterday"));
      expect((await bad.json()).code).toBe("FORMAT_DATETIME");
    });

    it("answers 404 for an unknown report id", async () => {
      const response = await postJson(acknowledgePath("99999999-2222-4333-8444-555555555555", "a".repeat(64)));
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it.each([
      ["INVALID_VRN", 400, "VRN_INVALID"],
      ["INVALID_PERIODKEY", 400, "PERIOD_KEY_INVALID"],
      ["INVALID_REQUEST", 400, "INVALID_REQUEST"],
      ["TAX_PERIOD_NOT_ENDED", 403, "TAX_PERIOD_NOT_ENDED"],
      ["INSOLVENT_TRADER", 403, "RULE_INSOLVENT_TRADER"],
    ])("answers the %s feedback scenario with %i %s", async (scenario, status, code) => {
      const response = await postJson(feedbackPath, vatBody, { "Gov-Test-Scenario": scenario });
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    });

    it.each([
      ["INVALID_VRN", 400, "VRN_INVALID"],
      ["INVALID_REPORTID", 400, "FORMAT_REPORT_ID"],
      ["INVALID_DATETIME", 400, "FORMAT_DATETIME"],
      ["INVALID_CREDENTIALS", 401, "INVALID_CREDENTIALS"],
      ["NOT_AUTHORISED", 403, "CLIENT_OR_AGENT_NOT_AUTHORISED"],
      ["CORRELATION_ID", 403, "CORRELATION_ID"],
      ["NOT_FOUND", 404, "MATCHING_RESOURCE_NOT_FOUND"],
    ])("answers the %s acknowledge scenario with %i %s", async (scenario, status, code) => {
      const response = await postJson(acknowledgePath("99999999-2222-4333-8444-555555555555", "a".repeat(64)), undefined, {
        "Gov-Test-Scenario": scenario,
      });
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    });

    it("rejects a bad vrn, a bad period key and a missing box", async () => {
      const badVrn = await postJson(`/organisations/vat-assist/feedback/12345`, vatBody);
      expect(badVrn.status).toBe(400);
      expect((await badVrn.json()).code).toBe("VRN_INVALID");
      const badKey = await postJson(feedbackPath, { ...vatBody, periodKey: "TESTKEY" });
      expect((await badKey.json()).code).toBe("PERIOD_KEY_INVALID");
      const missingBox = { ...vatBody };
      delete missingBox.netVatDue;
      const response = await postJson(feedbackPath, missingBox);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("INVALID_REQUEST");
    });
  });

  describe("Income Tax", () => {
    const reportPath = (calculationId) => `/individuals/self-assessment/assist/reports/${nino}/${taxYear}/${calculationId}`;

    it("returns a report with messages for any valid calculation id", async () => {
      const response = await postJson(reportPath(anyCalculationId));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-correlationid")).toBeTruthy();
      const report = await response.json();
      expect(report.nino).toBe(nino);
      expect(report.taxYear).toBe(taxYear);
      expect(report.calculationId).toBe(anyCalculationId);
      expect(report.correlationId).toMatch(/^[0-9a-f]{64}$/);
      expect(report.messages.length).toBeGreaterThan(0);

      const ack = await postJson(
        `/individuals/self-assessment/assist/reports/acknowledge/${nino}/${report.reportId}/${report.correlationId}`,
      );
      expect(ack.status).toBe(204);
      const forged = await postJson(`/individuals/self-assessment/assist/reports/acknowledge/${nino}/${report.reportId}/${"0".repeat(64)}`);
      expect(forged.status).toBe(403);
    });

    it("answers 204 for the no-messages calculation id", async () => {
      expect((await postJson(reportPath(noMessagesCalculationId))).status).toBe(204);
    });

    it("answers 404 for the not-found calculation id", async () => {
      const response = await postJson(reportPath(notFoundCalculationId));
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("MATCHING_CALCULATION_ID_NOT_FOUND");
    });

    it("rejects malformed identifiers", async () => {
      expect((await (await postJson(`/individuals/self-assessment/assist/reports/BAD/${taxYear}/${anyCalculationId}`)).json()).code).toBe(
        "FORMAT_NINO",
      );
      expect((await (await postJson(reportPath("not-a-uuid"))).json()).code).toBe("FORMAT_CALC_ID");
      expect((await (await postJson(`/individuals/self-assessment/assist/reports/${nino}/2025/${anyCalculationId}`)).json()).code).toBe(
        "FORMAT_TAX_YEAR",
      );
    });
  });
});
