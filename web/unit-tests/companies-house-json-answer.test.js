// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companies-house-json-answer.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../public/lib/services/api-client.js", () => ({
  fetchWithIdToken: vi.fn(),
  authorizedFetch: vi.fn(),
}));

import { fetchWithIdToken, authorizedFetch } from "../public/lib/services/api-client.js";
import { readJsonAnswer } from "../public/lib/services/json-answer.js";
import { submitCompaniesHouseForm, pollCompaniesHouseForm } from "../public/lib/services/companies-house-form-service.js";
import { submitPscVerificationStatement } from "../public/lib/services/companies-house-psc-verification-service.js";
import { submitConfirmationStatement } from "../public/lib/services/companies-house-confirmation-service.js";
import { getPscs } from "../public/lib/services/companies-house-service.js";
import { submitMicroEntityAccounts, getRegisteredOfficeAddress } from "../public/lib/services/companies-house-filing-service.js";

const SENTENCE = "The service did not give an answer this page can read (status 504). Try again in a few minutes.";

// An answer whose body is a page of HTML, as a gateway that timed out sends.
function htmlAnswer(status = 504) {
  return { ok: false, status, json: () => Promise.reject(new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON")) };
}

describe("an answer from the API that is not JSON", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithIdToken.mockResolvedValue(htmlAnswer());
    authorizedFetch.mockResolvedValue(htmlAnswer());
  });

  afterEach(() => {
    delete globalThis.window;
  });

  test("reads as a sentence with the answer's status, not the parser's words", async () => {
    const error = await readJsonAnswer(htmlAnswer()).catch((caught) => caught);

    expect(error.message).toBe(SENTENCE);
    expect(error.status).toBe(504);
    expect(error.notJson).toBe(true);
  });

  test("reads in the reader's language where the page has its text", async () => {
    globalThis.window = { siteText: (id, english, values) => `${id}|${values.status}` };

    const error = await readJsonAnswer(htmlAnswer(502)).catch((caught) => caught);

    expect(error.message).toBe("widget.answer-not-json|502");
  });

  test("a JSON answer is returned as it is", async () => {
    await expect(readJsonAnswer({ ok: true, status: 200, json: () => Promise.resolve({ a: 1 }) })).resolves.toEqual({ a: 1 });
  });

  test.each([
    ["a form filed through the shared route", () => submitCompaniesHouseForm("psc-cessation", {})],
    ["a form's poll", () => pollCompaniesHouseForm("psc-cessation", "00001A")],
    ["a PSC verification statement", () => submitPscVerificationStatement({})],
    ["a confirmation statement", () => submitConfirmationStatement({})],
    ["a register lookup", () => getPscs("00000001")],
    ["a set of accounts", () => submitMicroEntityAccounts({})],
    ["a filing API read", () => getRegisteredOfficeAddress("00000001")],
  ])("%s tells the reader in that sentence", async (name, call) => {
    const error = await call().catch((caught) => caught);

    expect(error.message).toBe(SENTENCE);
  });
});
