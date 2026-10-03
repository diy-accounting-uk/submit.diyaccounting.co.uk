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
  periodKey: "TESTKEY",
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
    it("returns three ordered messages, a 64 hex correlation id and an X-CorrelationId header", async () => {
      const response = await postJson(`/organisations/vat/${vrn}/assist/reports`, vatBody);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-correlationid")).toBeTruthy();
      const report = await response.json();
      expect(report.reportId).toMatch(/^[0-9a-f-]{36}$/);
      expect(report.correlationId).toMatch(/^[0-9a-f]{64}$/);
      expect(report.vrn).toBe(vrn);
      expect(report.periodKey).toBe(vatBody.periodKey);
      expect(report.messages.map((message) => message.title)).toEqual([
        "Review the VAT on purchases (input tax)",
        "Review the VAT on sales (output tax)",
        "Review the online sales (outputs)",
      ]);
      expect(report.messages.map((message) => message.path)).toEqual([
        `/organisations/vat/${vrn}/returns#vatReclaimedCurrPeriod`,
        `/organisations/vat/${vrn}/returns#vatDueSales`,
        `/organisations/vat/${vrn}/returns#totalValueSalesExVAT`,
      ]);
      for (const message of report.messages) {
        expect(message.action).toBe("If the figures are correct, you do not need to change anything.");
        expect(message.links).toHaveLength(1);
      }
    });

    it("acknowledges an issued report with 204 and refuses a forged correlation id with 403", async () => {
      const report = await (await postJson(`/organisations/vat/${vrn}/assist/reports`, vatBody)).json();
      const ok = await postJson(`/organisations/vat/${vrn}/assist/reports/acknowledge/${report.reportId}/${report.correlationId}`);
      expect(ok.status).toBe(204);
      const forged = await postJson(`/organisations/vat/${vrn}/assist/reports/acknowledge/${report.reportId}/${"0".repeat(64)}`);
      expect(forged.status).toBe(403);
      expect((await forged.json()).code).toBe("CORRELATION_ID_NOT_AUTHORISED");
    });

    it("answers 404 for an unknown report id", async () => {
      const response = await postJson(
        `/organisations/vat/${vrn}/assist/reports/acknowledge/99999999-2222-4333-8444-555555555555/${"a".repeat(64)}`,
      );
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    it("answers 204 for the NO_MESSAGES scenario", async () => {
      const response = await postJson(`/organisations/vat/${vrn}/assist/reports`, vatBody, { "Gov-Test-Scenario": "NO_MESSAGES" });
      expect(response.status).toBe(204);
    });

    it("rejects a bad vrn and a missing box", async () => {
      const badVrn = await postJson(`/organisations/vat/12345/assist/reports`, vatBody);
      expect(badVrn.status).toBe(400);
      expect((await badVrn.json()).code).toBe("FORMAT_VRN");
      const missingBox = { ...vatBody };
      delete missingBox.netVatDue;
      const response = await postJson(`/organisations/vat/${vrn}/assist/reports`, missingBox);
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
