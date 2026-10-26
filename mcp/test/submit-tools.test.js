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
  listVatLiabilities,
  listVatPayments,
  listVatPenalties,
  getVatReturn,
  submitVatReturn,
  getVatReceipt,
  listVatReceipts,
  renderMicroEntityAccounts,
  submitMicroEntityAccounts,
  renderSmallCompanyAccounts,
  submitSmallCompanyAccounts,
  pollSubmission,
  getConfirmationStatementData,
  renderConfirmationStatement,
  submitConfirmationStatement,
  requestCompaniesHouseCodes,
} from "../lib/submit-tools.js";
import { createSession } from "../lib/book-tools.js";
import { TOOLS } from "../lib/server.js";

const GRANT_ID = "11111111-2222-4333-8444-555555555555";
const session = createSession({
  credentials: { accessToken: async () => "session-access-token", idToken: async () => "session-id-token" },
});
session.hmrcGrant = { grantId: GRANT_ID, hmrcAccount: "live" };

const VRN = "983238295";
const HMRC_ACCESS_TOKEN = "hmrc-access-token";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/submit");
function fixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const LIST_VAT_OBLIGATIONS_RESPONSE = fixture("list-vat-obligations.response.json");
const SUBMIT_VAT_RETURN_RESPONSE = fixture("submit-vat-return.response.json");
const GET_VAT_RECEIPT_RESPONSE = fixture("get-vat-receipt.response.json");
const RENDER_MICRO_ENTITY_ACCOUNTS_RESPONSE = fixture("render-micro-entity-accounts.response.json");
const SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE = fixture("submit-micro-entity-accounts.response.json");
const POLL_ACCOUNTS_SUBMISSION_PENDING_RESPONSE = fixture("poll-accounts-submission.pending.response.json");
const POLL_ACCOUNTS_SUBMISSION_ACCEPTED_RESPONSE = fixture("poll-accounts-submission.accepted.response.json");
const CONFIRMATION_STATEMENT_DATA_RESPONSE = fixture("confirmation-statement-data.response.json");
const RENDER_CONFIRMATION_STATEMENT_RESPONSE = fixture("render-confirmation-statement.response.json");
const SUBMIT_CONFIRMATION_STATEMENT_RESPONSE = fixture("submit-confirmation-statement.response.json");
const POLL_CONFIRMATION_STATEMENT_PENDING_RESPONSE = fixture("poll-confirmation-statement.pending.response.json");
const POLL_CONFIRMATION_STATEMENT_ACCEPTED_RESPONSE = fixture("poll-confirmation-statement.accepted.response.json");
const ASYNC_ACCEPTED = fixture("async-accepted.response.json");

// Mimics the fetch Headers object (case-insensitive .get) that the real 202 responses carry.
function makeHeaders(headerObj = {}) {
  const map = new Map(Object.entries(headerObj).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name) => map.get(name.toLowerCase()) ?? null };
}

function jsonResponse(status, body, headers) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), headers: makeHeaders(headers) };
}

// Answers the session's HMRC grant read itself, granted for hmrcAccount, and hands every other
// request to apiFetch, so apiFetch's calls hold only the API routes under test.
function withGrant(apiFetch, hmrcAccount = "live") {
  return (url, init) =>
    String(url).includes(`/api/v1/mcp/hmrc-grants/${GRANT_ID}`)
      ? Promise.resolve(jsonResponse(200, { status: "granted", accessToken: HMRC_ACCESS_TOKEN, hmrcAccount }))
      : apiFetch(url, init);
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

const CONFIRMATION_STATEMENT_PARAMS = {
  companyNumber: "12345678",
  companyName: "Brickwork Pro Ltd",
  dateSigned: "2026-03-01",
  reviewDate: "2026-03-01",
  lawfulPurposeStatementAccepted: true,
  stateConfirmationAccepted: true,
  directors: [{ forename: "Jo", surname: "Brick", dob: "1980-04-12" }],
};

describe("submit-tools", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("VAT enquiries", () => {
    const cases = [
      ["list_vat_liabilities", listVatLiabilities, "/api/v1/hmrc/vat/liability"],
      ["list_vat_payments", listVatPayments, "/api/v1/hmrc/vat/payment"],
      ["list_vat_penalties", listVatPenalties, "/api/v1/hmrc/vat/penalty"],
    ];

    for (const [name, call, route] of cases) {
      it(`${name} gets ${route} with the grant's HMRC token and the date range`, async () => {
        const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { items: [] }));
        vi.stubGlobal("fetch", withGrant(mockFetch));

        const result = await call(session, { vrn: VRN, from: "2025-01-01", to: "2025-12-31" });

        expect(result).toEqual({ items: [] });
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`https://submit.diyaccounting.co.uk${route}?vrn=${VRN}&from=2025-01-01&to=2025-12-31`);
        expect(init.headers["X-Authorization"]).toBe("Bearer session-access-token");
        expect(init.headers["Authorization"]).toBe(`Bearer ${HMRC_ACCESS_TOKEN}`);
        expect(init.headers.hmrcAccount).toBe("live");
      });

      it(`${name} requires vrn`, async () => {
        await expect(call(session, {})).rejects.toThrow(`${name} requires vrn`);
      });
    }

    it("get_vat_return gets one return by period key", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { periodKey: "18A1" }));
      vi.stubGlobal("fetch", withGrant(mockFetch));

      await getVatReturn(session, { vrn: VRN, periodKey: "18A1" });

      expect(mockFetch.mock.calls[0][0]).toBe(`https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/return?vrn=${VRN}&periodKey=18A1`);
    });

    it("get_vat_return requires periodKey", async () => {
      await expect(getVatReturn(session, { vrn: VRN })).rejects.toThrow("get_vat_return requires periodKey");
    });
  });

  describe("list_vat_obligations", () => {
    it("gets obligations with the session bearer on X-Authorization and the HMRC token on Authorization", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const result = await listVatObligations(session, { vrn: VRN, status: "O" });

      expect(result).toEqual(LIST_VAT_OBLIGATIONS_RESPONSE);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/obligation?vrn=${VRN}&status=O`);
      expect(init.headers["X-Authorization"]).toBe("Bearer session-access-token");
      expect(init.headers["Authorization"]).toBe(`Bearer ${HMRC_ACCESS_TOKEN}`);
      expect(init.headers["X-Id-Token"]).toBe("session-id-token");
      expect(init.headers["x-initial-request"]).toBe("true");
    });

    it("carries from, to, hmrcAccount and govTestScenario through", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { obligations: [] }));
      vi.stubGlobal("fetch", withGrant(mockFetch, "synthetic"));

      await listVatObligations(session, {
        vrn: VRN,
        from: "2025-01-01",
        to: "2025-12-31",
        hmrcAccount: "synthetic",
        govTestScenario: "QUARTERLY_ONE_MET",
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        `https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/obligation?vrn=${VRN}&from=2025-01-01&to=2025-12-31&Gov-Test-Scenario=QUARTERLY_ONE_MET`,
      );
      expect(init.headers.hmrcAccount).toBe("synthetic");
    });

    it("requires vrn, or clientId", async () => {
      await expect(listVatObligations(session, {})).rejects.toThrow("vrn");
    });

    it("names request_hmrc_authorisation when the session holds no HMRC grant", async () => {
      const ungranted = createSession({ credentials: session.credentials });
      await expect(listVatObligations(ungranted, { vrn: VRN })).rejects.toThrow("request_hmrc_authorisation");
    });

    it("says the user has not finished when the grant is still pending", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { status: "pending", hmrcAccount: "live" }));
      vi.stubGlobal("fetch", mockFetch);
      await expect(listVatObligations(session, { vrn: VRN })).rejects.toThrow("not finished granting HMRC access");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("refuses a call for the other HMRC account than the grant's", async () => {
      vi.stubGlobal("fetch", withGrant(vi.fn()));
      await expect(listVatObligations(session, { vrn: VRN, hmrcAccount: "synthetic" })).rejects.toThrow(
        "request_hmrc_authorisation with hmrcAccount synthetic",
      );
    });

    it("reads the grant with the session bearer and sends the grant's account on the obligations call", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      const grantRead = vi.fn().mockImplementation(withGrant(mockFetch));
      vi.stubGlobal("fetch", grantRead);

      await listVatObligations(session, { vrn: VRN });

      const [grantUrl, grantInit] = grantRead.mock.calls[0];
      expect(grantUrl).toBe(`https://submit.diyaccounting.co.uk/api/v1/mcp/hmrc-grants/${GRANT_ID}`);
      expect(grantInit.headers.Authorization).toBe("Bearer session-access-token");
      expect(mockFetch.mock.calls[0][1].headers.hmrcAccount).toBe("live");
    });

    it("resolves the VRN from a practice client's row instead of vrn, when clientId is given", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const result = await listVatObligations(session, { clientId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });

      expect(result).toEqual(LIST_VAT_OBLIGATIONS_RESPONSE);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/obligation?clientId=01ARZ3NDEKTSV4RRFFQ69G5FAV");
    });

    it("throws the API's own message on a non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(400, { message: "Invalid VAT registration number format" }));
      vi.stubGlobal("fetch", withGrant(mockFetch));
      await expect(listVatObligations(session, { vrn: VRN })).rejects.toThrow("Invalid VAT registration number format");
    });

    it("polls a 202 to completion, carrying x-request-id and dropping x-initial-request", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(acceptedResponse())
        .mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const promise = listVatObligations(session, { vrn: VRN });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(LIST_VAT_OBLIGATIONS_RESPONSE);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, secondInit] = mockFetch.mock.calls[1];
      expect(secondInit.headers["x-request-id"]).toBe(ASYNC_ACCEPTED.headers["x-request-id"]);
      expect(secondInit.headers["x-initial-request"]).toBeUndefined();
    });

    it("omits X-Id-Token when the session credentials answer no id token", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, LIST_VAT_OBLIGATIONS_RESPONSE));
      vi.stubGlobal("fetch", withGrant(mockFetch));
      const hostedSession = createSession({
        credentials: { accessToken: async () => "request-bearer", idToken: async () => null },
      });
      hostedSession.hmrcGrant = session.hmrcGrant;

      await listVatObligations(hostedSession, { vrn: VRN });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["X-Authorization"]).toBe("Bearer request-bearer");
      expect(init.headers["X-Id-Token"]).toBeUndefined();
    });

    it("stops polling inside the session's pollBudgetMs, naming the poll URL", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
      vi.stubGlobal("fetch", withGrant(mockFetch));
      const budgeted = createSession({ credentials: session.credentials, pollBudgetMs: 20_000 });
      budgeted.hmrcGrant = session.hmrcGrant;

      const promise = listVatObligations(budgeted, { vrn: VRN });
      const assertion = expect(promise).rejects.toThrow(`Timed out after 20000 ms waiting for ${ASYNC_ACCEPTED.headers.Location}`);
      await vi.runAllTimersAsync();
      await assertion;

      expect(mockFetch.mock.calls.length).toBeLessThan(10);
    });

    it("throws with the poll URL after the poll never leaves 202", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const promise = listVatObligations(session, { vrn: VRN });
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
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const result = await submitVatReturn(session, {
        vatNumber: VRN,
        periodStart: "2025-01-01",
        periodEnd: "2025-03-31",
        ...NINE_BOX_FIELDS,
      });

      expect(result).toEqual(SUBMIT_VAT_RETURN_RESPONSE);
      expect(result.receipt.formBundleNumber).toBe(SUBMIT_VAT_RETURN_RESPONSE.receipt.formBundleNumber);
      expect(result.receiptId).toBe(SUBMIT_VAT_RETURN_RESPONSE.receiptId);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/return");
      expect(init.method).toBe("POST");
      expect(init.headers["X-Authorization"]).toBe("Bearer session-access-token");
      expect(init.headers["Authorization"]).toBeUndefined();
      expect(init.headers["X-Id-Token"]).toBe("session-id-token");
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
        submitVatReturn(session, {
          vatNumber: VRN,
          periodStart: "2025-01-01",
          periodEnd: "2025-03-31",
          ...rest,
        }),
      ).rejects.toThrow("vatDueSales");
    });

    it("names request_hmrc_authorisation when the session holds no HMRC grant", async () => {
      const ungranted = createSession({ credentials: session.credentials });
      await expect(
        submitVatReturn(ungranted, { vatNumber: VRN, periodStart: "2025-01-01", periodEnd: "2025-03-31", ...NINE_BOX_FIELDS }),
      ).rejects.toThrow("request_hmrc_authorisation");
    });

    it("requires vatNumber, or clientId", async () => {
      await expect(
        submitVatReturn(session, {
          periodStart: "2025-01-01",
          periodEnd: "2025-03-31",
          ...NINE_BOX_FIELDS,
        }),
      ).rejects.toThrow("vatNumber");
    });

    it("sends clientId instead of vatNumber when given, resolved by the route from the client row", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, SUBMIT_VAT_RETURN_RESPONSE));
      vi.stubGlobal("fetch", withGrant(mockFetch));

      await submitVatReturn(session, {
        clientId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        periodStart: "2025-01-01",
        periodEnd: "2025-03-31",
        ...NINE_BOX_FIELDS,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.clientId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
      expect(body.vatNumber).toBeUndefined();
    });

    it("polls a 202 to completion before returning the receipt", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(acceptedResponse())
        .mockResolvedValueOnce(jsonResponse(200, SUBMIT_VAT_RETURN_RESPONSE));
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const promise = submitVatReturn(session, {
        vatNumber: VRN,
        periodStart: "2025-01-01",
        periodEnd: "2025-03-31",
        ...NINE_BOX_FIELDS,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(SUBMIT_VAT_RETURN_RESPONSE);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws with the poll URL after the poll never leaves 202", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
      vi.stubGlobal("fetch", withGrant(mockFetch));

      const promise = submitVatReturn(session, {
        vatNumber: VRN,
        periodStart: "2025-01-01",
        periodEnd: "2025-03-31",
        ...NINE_BOX_FIELDS,
      });
      const assertion = expect(promise).rejects.toThrow(ASYNC_ACCEPTED.headers.Location);
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("get_vat_receipt", () => {
    it("gets a receipt by name with the session bearer on the plain Authorization header", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await getVatReceipt(session, { name: "2025-03-31-123456789012.json" });

      expect(result).toEqual(GET_VAT_RECEIPT_RESPONSE);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/2025-03-31-123456789012.json");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      expect(init.headers["X-Authorization"]).toBeUndefined();
    });

    it("requires name", async () => {
      await expect(getVatReceipt(session, {})).rejects.toThrow("name");
    });

    it("carries clientId as a query parameter when given", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, GET_VAT_RECEIPT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      await getVatReceipt(session, { name: "2025-03-31-123456789012.json", clientId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt/2025-03-31-123456789012.json?clientId=01ARZ3NDEKTSV4RRFFQ69G5FAV",
      );
    });

    it("throws the API's own client-not-found message for a client that is not the caller's", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(403, { message: "client-not-found" }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(getVatReceipt(session, { name: "2025-03-31-123456789012.json", clientId: "not-my-client" })).rejects.toThrow(
        "client-not-found",
      );
    });
  });

  describe("list_vat_receipts", () => {
    it("lists the stored receipts with the session bearer on the plain Authorization header", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { receipts: [{ name: "2025-03-31-123456789012.json" }] }));
      vi.stubGlobal("fetch", mockFetch);

      const result = await listVatReceipts(session, {});

      expect(result).toEqual({ receipts: [{ name: "2025-03-31-123456789012.json" }] });
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
    });

    it("carries clientId as a query parameter when given", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { receipts: [] }));
      vi.stubGlobal("fetch", mockFetch);

      await listVatReceipts(session, { clientId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });

      expect(mockFetch.mock.calls[0][0]).toBe("https://submit.diyaccounting.co.uk/api/v1/hmrc/receipt?clientId=01ARZ3NDEKTSV4RRFFQ69G5FAV");
    });
  });

  describe("render_micro_entity_accounts_sandbox", () => {
    it("posts the balance sheet and returns the rendered iXBRL", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, RENDER_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await renderMicroEntityAccounts(session, ACCOUNTS_PARAMS);

      expect(result).toEqual(RENDER_MICRO_ENTITY_ACCOUNTS_RESPONSE);
      expect(result.ixbrl).toContain("<?xml");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/accounts/render");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      const body = JSON.parse(init.body);
      expect(body.companyAuthCode).toBeUndefined();
      expect(body.balanceSheet.currentYear.capitalAndReserves).toBe(4000);
    });

    it("refuses when a statement is not accepted", async () => {
      const params = { ...ACCOUNTS_PARAMS, statementsAccepted: { ...ACCOUNTS_PARAMS.statementsAccepted, microEntityProvisions: false } };
      await expect(renderMicroEntityAccounts(session, params)).rejects.toThrow("microEntityProvisions");
    });

    it("still requires companyNumber when clientId is given, since the preview route never reads it", async () => {
      const withoutCompanyNumber = { ...ACCOUNTS_PARAMS };
      delete withoutCompanyNumber.companyNumber;
      await expect(renderMicroEntityAccounts(session, { ...withoutCompanyNumber, clientId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).rejects.toThrow(
        "companyNumber",
      );
    });
  });

  describe("submit_micro_entity_accounts_sandbox", () => {
    it("posts the balance sheet with the codes entry id and returns the submission number", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await submitMicroEntityAccounts(session, { ...ACCOUNTS_PARAMS, codesEntryId: "entry-1" });

      expect(result).toEqual(SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE);
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.codesEntryId).toBe("entry-1");
      expect(body.companyAuthCode).toBeUndefined();
    });

    it("requires codesEntryId", async () => {
      await expect(submitMicroEntityAccounts(session, ACCOUNTS_PARAMS)).rejects.toThrow("codesEntryId");
    });

    it("requires companyNumber, or clientId", async () => {
      const withoutCompanyNumber = { ...ACCOUNTS_PARAMS };
      delete withoutCompanyNumber.companyNumber;
      await expect(submitMicroEntityAccounts(session, { ...withoutCompanyNumber, codesEntryId: "entry-1" })).rejects.toThrow(
        "companyNumber",
      );
    });

    it("sends clientId instead of companyNumber when given, resolved by the route from the client row", async () => {
      const withoutCompanyNumber = { ...ACCOUNTS_PARAMS };
      delete withoutCompanyNumber.companyNumber;
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      await submitMicroEntityAccounts(session, {
        ...withoutCompanyNumber,
        clientId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        codesEntryId: "entry-1",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.clientId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
      expect(body.companyNumber).toBeUndefined();
    });
  });

  describe("poll_submission for accounts", () => {
    it("gets the filing outcome by submission number, pending before Companies House answers", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, POLL_ACCOUNTS_SUBMISSION_PENDING_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pollSubmission(session, { kind: "accounts", submissionNumber: "000001" });

      expect(result).toEqual(POLL_ACCOUNTS_SUBMISSION_PENDING_RESPONSE);
      expect(result.statusCode).toBe("PENDING");
      expect(mockFetch.mock.calls[0][0]).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/accounts/000001");
    });

    it("carries a receiptId once the filing is accepted", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, POLL_ACCOUNTS_SUBMISSION_ACCEPTED_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pollSubmission(session, { kind: "accounts", submissionNumber: "000001" });

      expect(result.statusCode).toBe("ACCEPT");
      expect(result.receiptId).toBe(POLL_ACCOUNTS_SUBMISSION_ACCEPTED_RESPONSE.receiptId);
    });

    it("requires submissionNumber", async () => {
      await expect(pollSubmission(session, { kind: "accounts" })).rejects.toThrow("submissionNumber");
    });

    it("requires a known kind", async () => {
      await expect(pollSubmission(session, { submissionNumber: "000001" })).rejects.toThrow("kind");
      await expect(pollSubmission(session, { kind: "vat", submissionNumber: "000001" })).rejects.toThrow(/kind must be one of/);
    });
  });

  describe("get_confirmation_statement_data_sandbox", () => {
    it("posts the codes entry id and made-up date and returns the register data", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, CONFIRMATION_STATEMENT_DATA_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await getConfirmationStatementData(session, {
        companyNumber: "12345678",
        codesEntryId: "entry-1",
        madeUpDate: "2026-03-01",
      });

      expect(result).toEqual(CONFIRMATION_STATEMENT_DATA_RESPONSE);
      expect(result.paymentPeriodPaid).toBe(false);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/company/12345678/filing-data");
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      const body = JSON.parse(init.body);
      expect(body.codesEntryId).toBe("entry-1");
      expect(body.companyAuthCode).toBeUndefined();
      expect(body.madeUpDate).toBe("2026-03-01");
    });

    it("requires companyNumber", async () => {
      await expect(getConfirmationStatementData(session, { codesEntryId: "entry-1", madeUpDate: "2026-03-01" })).rejects.toThrow(
        "companyNumber",
      );
    });

    it("requires codesEntryId", async () => {
      await expect(getConfirmationStatementData(session, { companyNumber: "12345678", madeUpDate: "2026-03-01" })).rejects.toThrow(
        "codesEntryId",
      );
    });

    it("requires madeUpDate", async () => {
      await expect(getConfirmationStatementData(session, { companyNumber: "12345678", codesEntryId: "entry-1" })).rejects.toThrow(
        "madeUpDate",
      );
    });

    it("carries companyType through when given", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, CONFIRMATION_STATEMENT_DATA_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      await getConfirmationStatementData(session, {
        companyNumber: "12345678",
        codesEntryId: "entry-1",
        madeUpDate: "2026-03-01",
        companyType: "plc",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.companyType).toBe("plc");
    });
  });

  describe("render_confirmation_statement_sandbox", () => {
    it("posts the form body and returns the rendered statement", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, RENDER_CONFIRMATION_STATEMENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await renderConfirmationStatement(session, CONFIRMATION_STATEMENT_PARAMS);

      expect(result).toEqual(RENDER_CONFIRMATION_STATEMENT_RESPONSE);
      expect(result.confirmationStatementXml).toContain("ConfirmationAndVerificationStatement");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/confirmation-statement/render");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      const body = JSON.parse(init.body);
      expect(body.companyAuthCode).toBeUndefined();
      expect(body.directors[0].personalCode).toBe("AAAAAA00000");
    });

    it("requires at least one director", async () => {
      await expect(renderConfirmationStatement(session, { ...CONFIRMATION_STATEMENT_PARAMS, directors: [] })).rejects.toThrow("director");
    });

    it("requires lawfulPurposeStatementAccepted to be accepted", async () => {
      await expect(
        renderConfirmationStatement(session, { ...CONFIRMATION_STATEMENT_PARAMS, lawfulPurposeStatementAccepted: false }),
      ).rejects.toThrow("lawfulPurposeStatementAccepted");
    });

    it("requires stateConfirmationAccepted to be accepted", async () => {
      await expect(
        renderConfirmationStatement(session, { ...CONFIRMATION_STATEMENT_PARAMS, stateConfirmationAccepted: false }),
      ).rejects.toThrow("stateConfirmationAccepted");
    });

    it("requires companyNumber", async () => {
      const withoutCompanyNumber = { ...CONFIRMATION_STATEMENT_PARAMS };
      delete withoutCompanyNumber.companyNumber;
      await expect(renderConfirmationStatement(session, withoutCompanyNumber)).rejects.toThrow("companyNumber");
    });

    it("carries sicCodes, statementOfCapital, shareholdings and registeredEmailAddress through when given", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, RENDER_CONFIRMATION_STATEMENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      await renderConfirmationStatement(session, {
        ...CONFIRMATION_STATEMENT_PARAMS,
        sicCodes: ["43390"],
        statementOfCapital: {
          totalAmountUnpaid: 0,
          totalNumberOfIssuedShares: 100,
          shareCurrency: "GBP",
          totalAggregateNominalValue: 100,
          shares: [{ shareClass: "Ordinary", prescribedParticulars: "", numShares: 100, aggregateNominalValue: 100 }],
        },
        shareholdings: [{ shareClass: "Ordinary", numberHeld: 100 }],
        registeredEmailAddress: "director@brickworkpro.example",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sicCodes).toEqual(["43390"]);
      expect(body.statementOfCapital.totalNumberOfIssuedShares).toBe(100);
      expect(body.shareholdings[0].shareClass).toBe("Ordinary");
      expect(body.registeredEmailAddress).toBe("director@brickworkpro.example");
    });
  });

  describe("submit_confirmation_statement_sandbox", () => {
    it("posts the form body with the codes entry id and returns the submission number", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, SUBMIT_CONFIRMATION_STATEMENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await submitConfirmationStatement(session, { ...CONFIRMATION_STATEMENT_PARAMS, codesEntryId: "entry-1" });

      expect(result).toEqual(SUBMIT_CONFIRMATION_STATEMENT_RESPONSE);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/confirmation-statement");
      const body = JSON.parse(init.body);
      expect(body.codesEntryId).toBe("entry-1");
      expect(body.companyAuthCode).toBeUndefined();
      expect(body.directors[0].personalCode).toBeUndefined();
    });

    it("requires codesEntryId", async () => {
      await expect(submitConfirmationStatement(session, CONFIRMATION_STATEMENT_PARAMS)).rejects.toThrow("codesEntryId");
    });

    it("requires at least one director", async () => {
      await expect(
        submitConfirmationStatement(session, { ...CONFIRMATION_STATEMENT_PARAMS, directors: [], codesEntryId: "entry-1" }),
      ).rejects.toThrow("director");
    });

    it("polls a 202 to completion before returning the submission number", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(acceptedResponse())
        .mockResolvedValueOnce(jsonResponse(201, SUBMIT_CONFIRMATION_STATEMENT_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const promise = submitConfirmationStatement(session, { ...CONFIRMATION_STATEMENT_PARAMS, codesEntryId: "entry-1" });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(SUBMIT_CONFIRMATION_STATEMENT_RESPONSE);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("poll_submission for a confirmation statement", () => {
    it("gets the filing outcome by submission number, pending before Companies House answers", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, POLL_CONFIRMATION_STATEMENT_PENDING_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pollSubmission(session, { kind: "confirmation-statement", submissionNumber: "000002" });

      expect(result).toEqual(POLL_CONFIRMATION_STATEMENT_PENDING_RESPONSE);
      expect(result.statusCode).toBe("PENDING");
      expect(mockFetch.mock.calls[0][0]).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/confirmation-statement/000002");
    });

    it("carries a receiptId once the filing is accepted", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, POLL_CONFIRMATION_STATEMENT_ACCEPTED_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pollSubmission(session, { kind: "confirmation-statement", submissionNumber: "000002" });

      expect(result.statusCode).toBe("ACCEPT");
      expect(result.receiptId).toBe(POLL_CONFIRMATION_STATEMENT_ACCEPTED_RESPONSE.receiptId);
    });

    it("requires submissionNumber", async () => {
      await expect(pollSubmission(session, { kind: "confirmation-statement" })).rejects.toThrow("submissionNumber");
    });
  });

  describe("small company accounts", () => {
    const SMALL_PARAMS = {
      companyNumber: "12345678",
      companyName: "Brick Ltd",
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      averageEmployees: 3,
      director: { name: "A Director", dateApproved: "2026-06-01" },
      statementsAccepted: {
        section477Exemption: true,
        membersNotRequiredAudit: true,
        directorsResponsibilities: true,
        smallCompaniesRegime: true,
      },
      smallCompany: {
        principalActivity: "Building",
        accountingPolicies: "Cost",
        directors: ["A Director"],
        balanceSheet: { currentYear: { fixedAssets: 1 } },
        profitAndLoss: { currentYear: { turnover: 1 } },
      },
    };

    it("renders over the micro-entity render route with the smallCompany section", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, RENDER_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);

      await renderSmallCompanyAccounts(session, SMALL_PARAMS);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/accounts/render");
      const body = JSON.parse(init.body);
      expect(body.smallCompany.principalActivity).toBe("Building");
      expect(body.balanceSheet).toBeUndefined();
      expect(body.companyAuthCode).toBeUndefined();
    });

    it("refuses a render without a small-company statement accepted", async () => {
      const params = { ...SMALL_PARAMS, statementsAccepted: { ...SMALL_PARAMS.statementsAccepted, smallCompaniesRegime: false } };
      await expect(renderSmallCompanyAccounts(session, params)).rejects.toThrow("smallCompaniesRegime");
    });

    it("submits with the codes entry id and a clientId in place of companyNumber", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE));
      vi.stubGlobal("fetch", mockFetch);
      const withoutCompanyNumber = { ...SMALL_PARAMS, companyNumber: undefined };

      const result = await submitSmallCompanyAccounts(session, { ...withoutCompanyNumber, clientId: "client-1", codesEntryId: "entry-1" });

      expect(result).toEqual(SUBMIT_MICRO_ENTITY_ACCOUNTS_RESPONSE);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/companies-house/accounts");
      const body = JSON.parse(init.body);
      expect(body.codesEntryId).toBe("entry-1");
      expect(body.clientId).toBe("client-1");
      expect(body.companyNumber).toBeUndefined();
    });

    it("requires codesEntryId, and companyNumber or clientId", async () => {
      await expect(submitSmallCompanyAccounts(session, SMALL_PARAMS)).rejects.toThrow("codesEntryId");
      const withoutCompanyNumber = { ...SMALL_PARAMS, companyNumber: undefined };
      await expect(submitSmallCompanyAccounts(session, { ...withoutCompanyNumber, codesEntryId: "entry-1" })).rejects.toThrow(
        "companyNumber",
      );
    });
  });

  describe("server registration", () => {
    it("registers the nine Submit tools with their handlers", () => {
      expect(TOOLS.list_vat_obligations.handler).toBe(listVatObligations);
      expect(TOOLS.submit_vat_return.handler).toBe(submitVatReturn);
      expect(TOOLS.get_vat_receipt.handler).toBe(getVatReceipt);
      expect(TOOLS.render_micro_entity_accounts_sandbox.handler).toBe(renderMicroEntityAccounts);
      expect(TOOLS.submit_micro_entity_accounts_sandbox.handler).toBe(submitMicroEntityAccounts);
      expect(TOOLS.render_small_company_accounts_sandbox.handler).toBe(renderSmallCompanyAccounts);
      expect(TOOLS.submit_small_company_accounts_sandbox.handler).toBe(submitSmallCompanyAccounts);
      expect(TOOLS.poll_submission.handler).toBe(pollSubmission);
      expect(TOOLS.get_confirmation_statement_data_sandbox.handler).toBe(getConfirmationStatementData);
      expect(TOOLS.render_confirmation_statement_sandbox.handler).toBe(renderConfirmationStatement);
      expect(TOOLS.submit_confirmation_statement_sandbox.handler).toBe(submitConfirmationStatement);
    });
  });

  describe("request_companies_house_codes", () => {
    it("posts the kind and company number and answers the link", async () => {
      const answer = {
        entryId: "11111111-2222-4333-8444-555555555555",
        url: "https://submit.diyaccounting.co.uk/companies-house/mcpCodes.html?entry=x",
      };
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, answer));
      vi.stubGlobal("fetch", mockFetch);

      const result = await requestCompaniesHouseCodes(session, { kind: "accounts", companyNumber: "12345678" });

      expect(result).toEqual(answer);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/mcp/codes-entries");
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer session-access-token");
      expect(JSON.parse(init.body)).toEqual({ kind: "accounts", companyNumber: "12345678" });
    });

    it("sends the directors for a confirmation statement and requires them", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, { entryId: "x", url: "y" }));
      vi.stubGlobal("fetch", mockFetch);
      const directors = [{ forename: "Jo", surname: "Brick" }];

      await requestCompaniesHouseCodes(session, { kind: "confirmation-statement", companyNumber: "12345678", directors });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body).directors).toEqual(directors);
      await expect(requestCompaniesHouseCodes(session, { kind: "confirmation-statement", companyNumber: "12345678" })).rejects.toThrow(
        "directors",
      );
    });

    it("names the practice clients for a batch entry and needs no company number", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            clients: [
              { clientId: "c1", displayName: "Alpha Ltd" },
              { clientId: "c2", displayName: "Beta Ltd" },
              { clientId: "c3", displayName: "Gamma" },
            ],
          }),
        )
        .mockResolvedValueOnce(jsonResponse(201, { entryId: "x", url: "y" }));
      vi.stubGlobal("fetch", mockFetch);

      await requestCompaniesHouseCodes(session, { kind: "accounts", clientIds: ["c2", "c1"] });

      expect(mockFetch.mock.calls[0][0]).toBe("https://submit.diyaccounting.co.uk/api/v1/practice/clients");
      expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
        kind: "accounts",
        clients: [
          { clientId: "c2", displayName: "Beta Ltd" },
          { clientId: "c1", displayName: "Alpha Ltd" },
        ],
      });
    });

    it("refuses a client id that is not in the practice's list and an empty list", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { clients: [] })));
      await expect(requestCompaniesHouseCodes(session, { kind: "accounts", clientIds: ["nope"] })).rejects.toThrow("nope");
      await expect(requestCompaniesHouseCodes(session, { kind: "accounts", clientIds: [] })).rejects.toThrow("clientIds");
    });

    it("refuses a kind it does not know", async () => {
      await expect(requestCompaniesHouseCodes(session, { kind: "vat", companyNumber: "12345678" })).rejects.toThrow("kind");
    });
  });

  describe("the tool schemas", () => {
    it("carry no argument that holds a Companies House code", () => {
      const holdsCode = (name) => /authcode|personalcode/i.test(name);
      for (const [toolName, tool] of Object.entries(TOOLS)) {
        const argumentNames = JSON.stringify(Object.keys(tool.inputSchema));
        expect(holdsCode(argumentNames), toolName).toBe(false);
      }
      const directorsSchema = TOOLS.submit_confirmation_statement_sandbox.inputSchema.directors;
      expect(JSON.stringify(directorsSchema.element.shape)).not.toMatch(/personalCode/i);
    });

    it("name the entry on each tool that files or reads with the codes", () => {
      for (const name of [
        "submit_micro_entity_accounts_sandbox",
        "submit_small_company_accounts_sandbox",
        "submit_confirmation_statement_sandbox",
        "get_confirmation_statement_data_sandbox",
      ]) {
        expect(Object.keys(TOOLS[name].inputSchema), name).toContain("codesEntryId");
      }
    });
  });
});
