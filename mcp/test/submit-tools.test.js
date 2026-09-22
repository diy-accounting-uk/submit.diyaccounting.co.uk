// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// submit-tools.test.js -- the Submit-facing tools over the deployed REST API, with fetch mocked
// to shapes recorded from a real simulator-backed lane (fixtures/submit/*.json; see submit-tools.js's
// pollUntilSettled for the 202-then-poll contract these fixtures exercise).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listVatObligations,
  submitVatReturn,
  getVatReceipt,
  previewMicroEntityAccounts,
  submitMicroEntityAccounts,
  pollAccountsSubmission,
} from "../lib/submit-tools.js";
import { TOOLS } from "../lib/server.js";

const VRN = "983238295";
const HMRC_ACCESS_TOKEN = "hmrc-access-token";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/submit");
function fixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const LIST_VAT_OBLIGATIONS_RESPONSE = fixture("list-vat-obligations.response.json");
const SUBMIT_VAT_RETURN_RESPONSE = fixture("submit-vat-return.response.json");
const GET_VAT_RECEIPT_RESPONSE = fixture("get-vat-receipt.response.json");
const PREVIEW_MICRO_ENTITY_ACCOUNTS_RESPONSE = fixture("preview-micro-entity-accounts.response.json");
const SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE = fixture("submit-micro-entity-accounts.response.json");
const POLL_ACCOUNTS_SUBMISSION_PENDING_RESPONSE = fixture("poll-accounts-submission.pending.response.json");
const POLL_ACCOUNTS_SUBMISSION_ACCEPTED_RESPONSE = fixture("poll-accounts-submission.accepted.response.json");
const ASYNC_ACCEPTED = fixture("async-accepted.response.json");

// Mimics the fetch Headers object (case-insensitive .get) that the real 202 responses carry.
function makeHeaders(headerObj = {}) {
  const map = new Map(Object.entries(headerObj).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name) => map.get(name.toLowerCase()) ?? null };
}

function jsonResponse(status, body, headers) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), headers: makeHeaders(headers) };
}

function acceptedResponse() {
  return jsonResponse(ASYNC_ACCEPTED.status, ASYNC_ACCEPTED.body, ASYNC_ACCEPTED.headers);
}

const BALANCE_SHEET_YEAR = {
  fixedAssets: 1000,
  currentAssets: 5000,
  creditorsWithinOneYear: 2000,
  creditorsAfterOneYear: 0,
  calledUpShareCapital: 100,
  profitAndLossAccount: 3900,
  capitalAndReserves: 4000,
};

const ACCOUNTS_PARAMS = {
  companyNumber: "12345678",
  companyName: "Brickwork Pro Ltd",
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  balanceSheet: { currentYear: BALANCE_SHEET_YEAR, priorYear: BALANCE_SHEET_YEAR },
  averageEmployees: 2,
  director: { name: "Jo Brick", dateApproved: "2026-03-01" },
  statementsAccepted: {
    section477Exemption: true,
    membersNotRequiredAudit: true,
    directorsResponsibilities: true,
    microEntityProvisions: true,
  },
};

describe("submit-tools", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
    process.env.DIYA_SUBMIT_ACCESS_TOKEN = "session-access-token";
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    delete process.env.DIYA_SUBMIT_ACCESS_TOKEN;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("list_vat_obligations", () => {
    it("gets obligations with the session bearer on X-Authorization and the HMRC token on Authorization", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await listVatObligations({}, { vrn: VRN, status: "O", hmrcAccessToken: HMRC_ACCESS_TOKEN });

      expect(result).toEqual(LIST_VAT_OBLIGATIONS_RESPONSE);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/obligation?vrn=${VRN}&status=O`);
      expect(init.headers["X-Authorization"]).toBe("Bearer session-access-token");
      expect(init.headers["Authorization"]).toBe(`Bearer ${HMRC_ACCESS_TOKEN}`);
      expect(init.headers["x-initial-request"]).toBe("true");
    });

    it("carries from, to, hmrcAccount and govTestScenario through", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { obligations: [] }));
      vi.stubGlobal("fetch", mockFetch);

      await listVatObligations(
        {},
        {
          vrn: VRN,
          from: "2025-01-01",
          to: "2025-12-31",
          hmrcAccessToken: HMRC_ACCESS_TOKEN,
          hmrcAccount: "synthetic",
          govTestScenario: "QUARTERLY_ONE_MET",
        },
      );

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        `https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/obligation?vrn=${VRN}&from=2025-01-01&to=2025-12-31&Gov-Test-Scenario=QUARTERLY_ONE_MET`,
      );
      expect(init.headers.hmrcAccount).toBe("synthetic");
    });

    it("requires vrn", async () => {
      await expect(listVatObligations({}, { hmrcAccessToken: HMRC_ACCESS_TOKEN })).rejects.toThrow("vrn");
    });

    it("requires hmrcAccessToken", async () => {
      await expect(listVatObligations({}, { vrn: VRN })).rejects.toThrow("hmrcAccessToken");
    });

    it("throws the API's own message on a non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(400, { message: "Invalid VAT registration number format" }));
      vi.stubGlobal("fetch", mockFetch);
      await expect(listVatObligations({}, { vrn: VRN, hmrcAccessToken: HMRC_ACCESS_TOKEN })).rejects.toThrow(
        "Invalid VAT registration number format",
      );
    });

    it("polls a 202 to completion, carrying x-request-id and dropping x-initial-request", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(acceptedResponse())
        .mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const promise = listVatObligations({}, { vrn: VRN, hmrcAccessToken: HMRC_ACCESS_TOKEN });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(LIST_VAT_OBLIGATIONS_RESPONSE);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, secondInit] = mockFetch.mock.calls[1];
      expect(secondInit.headers["x-request-id"]).toBe(ASYNC_ACCEPTED.headers["x-request-id"]);
      expect(secondInit.headers["x-initial-request"]).toBeUndefined();
    });

    it("throws with the poll URL after the poll never leaves 202", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
      vi.stubGlobal("fetch", mockFetch);

      const promise = listVatObligations({}, { vrn: VRN, hmrcAccessToken: HMRC_ACCESS_TOKEN });
      const assertion = expect(promise).rejects.toThrow(ASYNC_ACCEPTED.headers.Location);
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("submit_vat_return", () => {
    const NINE_BOX_FIELDS = {
      vatDueSales: 2400.5,
      vatDueAcquisitions: 0,
      vatReclaimedCurrPeriod: 100.25,
      totalValueSalesExVAT: 12000,
      totalValuePurchasesExVAT: 500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    };

    it("posts the seven filed boxes with the HMRC token in the body, not a header, and returns the receipt nested under receipt/periodKey/receiptId", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, SUBMIT_VAT_RETURN_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await submitVatReturn(
        {},
        { vatNumber: VRN, periodStart: "2025-01-01", periodEnd: "2025-03-31", hmrcAccessToken: HMRC_ACCESS_TOKEN, ...NINE_BOX_FIELDS },
      );

      expect(result).toEqual(SUBMIT_VAT_RETURN_RESPONSE);
      expect(result.receipt.formBundleNumber).toBe(SUBMIT_VAT_RETURN_RESPONSE.receipt.formBundleNumber);
      expect(result.receiptId).toBe(SUBMIT_VAT_RETURN_RESPONSE.receiptId);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/return");
      expect(init.method).toBe("POST");
      expect(init.headers["X-Authorization"]).toBe("Bearer session-access-token");
      expect(init.headers["Authorization"]).toBeUndefined();
      const body = JSON.parse(init.body);
      expect(body.accessToken).toBe(HMRC_ACCESS_TOKEN);
      expect(body.vatNumber).toBe(VRN);
      expect(body.periodStart).toBe("2025-01-01");
      expect(body.vatDueSales).toBe(2400.5);
      expect(body.totalAcquisitionsExVAT).toBe(0);
    });

    it("requires every one of the seven boxes", async () => {
      const rest = Object.fromEntries(Object.entries(NINE_BOX_FIELDS).filter(([key]) => key !== "vatDueSales"));
      await expect(
        submitVatReturn(
          {},
          { vatNumber: VRN, periodStart: "2025-01-01", periodEnd: "2025-03-31", hmrcAccessToken: HMRC_ACCESS_TOKEN, ...rest },
        ),
      ).rejects.toThrow("vatDueSales");
    });

    it("requires hmrcAccessToken", async () => {
      await expect(
        submitVatReturn({}, { vatNumber: VRN, periodStart: "2025-01-01", periodEnd: "2025-03-31", ...NINE_BOX_FIELDS }),
      ).rejects.toThrow("hmrcAccessToken");
    });

    it("polls a 202 to completion before returning the receipt", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(acceptedResponse())
        .mockResolvedValueOnce(jsonResponse(200, SUBMIT_VAT_RETURN_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const promise = submitVatReturn(
        {},
        { vatNumber: VRN, periodStart: "2025-01-01", periodEnd: "2025-03-31", hmrcAccessToken: HMRC_ACCESS_TOKEN, ...NINE_BOX_FIELDS },
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(SUBMIT_VAT_RETURN_RESPONSE);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws with the poll URL after the poll never leaves 202", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
      vi.stubGlobal("fetch", mockFetch);

      const promise = submitVatReturn(
        {},
        { vatNumber: VRN, periodStart: "2025-01-01", periodEnd: "2025-03-31", hmrcAccessToken: HMRC_ACCESS_TOKEN, ...NINE_BOX_FIELDS },
      );
      const assertion = expect(promise).rejects.toThrow(ASYNC_ACCEPTED.headers.Location);
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("get_vat_receipt", () => {
    it("gets a receipt by name with the session bearer on the plain Authorization header", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await getVatReceipt({}, { name: "2025-03-31-123456789012.json" });

      expect(result).toEqual(GET_VAT_RECEIPT_RESPONSE);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/2025-03-31-123456789012.json");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      expect(init.headers["X-Authorization"]).toBeUndefined();
    });

    it("requires name", async () => {
      await expect(getVatReceipt({}, {})).rejects.toThrow("name");
    });
  });

  describe("preview_micro_entity_accounts", () => {
    it("posts the balance sheet and returns the rendered iXBRL", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, PREVIEW_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await previewMicroEntityAccounts({}, ACCOUNTS_PARAMS);

      expect(result).toEqual(PREVIEW_MICRO_ENTITY_ACCOUNTS_RESPONSE);
      expect(result.ixbrl).toContain("<?xml");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/accounts/preview");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      const body = JSON.parse(init.body);
      expect(body.companyAuthCode).toBeUndefined();
      expect(body.balanceSheet.currentYear.capitalAndReserves).toBe(4000);
    });

    it("refuses when a statement is not accepted", async () => {
      const params = { ...ACCOUNTS_PARAMS, statementsAccepted: { ...ACCOUNTS_PARAMS.statementsAccepted, microEntityProvisions: false } };
      await expect(previewMicroEntityAccounts({}, params)).rejects.toThrow("microEntityProvisions");
    });
  });

  describe("submit_micro_entity_accounts", () => {
    it("posts the balance sheet with the company authentication code and returns the submission number", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await submitMicroEntityAccounts({}, { ...ACCOUNTS_PARAMS, companyAuthCode: "Sim0123" });

      expect(result).toEqual(SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE);
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.companyAuthCode).toBe("Sim0123");
    });

    it("requires companyAuthCode", async () => {
      await expect(submitMicroEntityAccounts({}, ACCOUNTS_PARAMS)).rejects.toThrow("companyAuthCode");
    });
  });

  describe("poll_accounts_submission", () => {
    it("gets the filing outcome by submission number, pending before Companies House answers", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, POLL_ACCOUNTS_SUBMISSION_PENDING_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pollAccountsSubmission({}, { submissionNumber: "000001" });

      expect(result).toEqual(POLL_ACCOUNTS_SUBMISSION_PENDING_RESPONSE);
      expect(result.statusCode).toBe("PENDING");
      expect(mockFetch.mock.calls[0][0]).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/accounts/000001");
    });

    it("carries a receiptId once the filing is accepted", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, POLL_ACCOUNTS_SUBMISSION_ACCEPTED_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pollAccountsSubmission({}, { submissionNumber: "000001" });

      expect(result.statusCode).toBe("ACCEPT");
      expect(result.receiptId).toBe(POLL_ACCOUNTS_SUBMISSION_ACCEPTED_RESPONSE.receiptId);
    });

    it("requires submissionNumber", async () => {
      await expect(pollAccountsSubmission({}, {})).rejects.toThrow("submissionNumber");
    });
  });

  describe("server registration", () => {
    it("registers all six tools with their handlers", () => {
      expect(TOOLS.list_vat_obligations.handler).toBe(listVatObligations);
      expect(TOOLS.submit_vat_return.handler).toBe(submitVatReturn);
      expect(TOOLS.get_vat_receipt.handler).toBe(getVatReceipt);
      expect(TOOLS.preview_micro_entity_accounts.handler).toBe(previewMicroEntityAccounts);
      expect(TOOLS.submit_micro_entity_accounts.handler).toBe(submitMicroEntityAccounts);
      expect(TOOLS.poll_accounts_submission.handler).toBe(pollAccountsSubmission);
    });
  });
});
