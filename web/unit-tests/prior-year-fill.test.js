// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/prior-year-fill.test.js
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fillPriorYear, isRevision } from "../public/lib/prior-year-fill.js";

const row = (id, name, extra = "") => `<tr ${extra}><th scope="row">${name}</th><td><input id="${id}" value="" /></td></tr>`;

const MICRO_FORM = `
  <div id="priorYearNote" hidden></div>
  <table>
    ${row("priorFixedAssets", "Fixed assets")}
    ${row("priorCurrentAssets", "Current assets")}
    ${row("priorCreditorsWithinOneYear", "Creditors: amounts falling due within one year")}
    ${row("priorProvisionsForLiabilities", "Provisions for liabilities")}
    ${row("priorCalledUpShareCapital", "Called up share capital")}
    ${row("priorProfitAndLossAccount", "Profit and loss account")}
    ${row("priorCapitalAndReserves", "Capital and reserves")}
  </table>`;

const SMALL_FORM = `
  <div id="priorYearNote" hidden></div>
  <input type="checkbox" id="includeComparatives" />
  <input type="radio" name="format" id="profitAndLossFormat1" checked />
  <input type="radio" name="format" id="profitAndLossFormat2" />
  <div id="comparativeFields" style="display: none">
    <table>
      ${row("priorStocks", "Stocks")}
      ${row("priorCashAtBank", "Cash at bank and in hand")}
      ${row("priorTurnover", "Turnover", 'data-profit-and-loss-format="1"')}
      ${row("priorStaffCosts", "Staff costs", 'data-profit-and-loss-format="2" hidden')}
    </table>
  </div>`;

const MICRO_ACCOUNTS = {
  regime: "micro",
  period: { start: "2097-05-01", end: "2098-04-30" },
  approvalDate: "2098-10-20",
  balanceSheet: {
    fixedAssets: 10000,
    currentAssets: 5000,
    creditorsWithinOneYear: 3000,
    netAssets: 10000,
    calledUpShareCapital: 100,
    profitAndLossAccount: 9900,
    capitalAndReserves: 10000,
  },
  profitAndLoss: null,
};

const SET = { transactionId: "TX1", madeUpDate: "2098-04-30", filedOn: "2098-11-02", paperFiled: false };

const answer = (body, status = 200) => ({ ok: status === 200, status, json: () => Promise.resolve(body) });

// The profile of a company whose next accounting period starts the day after SET's made-up date.
const NEXT_PERIOD_PROFILE = { companyNumber: "00000001", accountsNextPeriodStart: "2098-05-01" };

async function fill(
  form,
  body,
  { status = 200, search = "?companyNumber=00000001", form: formKind = "micro", typed = {}, profile = NEXT_PERIOD_PROFILE } = {},
) {
  document.body.innerHTML = form;
  Object.entries(typed).forEach(([id, text]) => {
    document.getElementById(id).value = text;
  });
  // The small company page shows its comparatives when the box is ticked.
  document.getElementById("includeComparatives")?.addEventListener("change", (event) => {
    document.getElementById("comparativeFields").style.display = event.target.checked ? "block" : "none";
  });
  const fetchLastAccounts = vi.fn().mockResolvedValue(answer(body, status));
  const readProfile = profile instanceof Error ? vi.fn().mockRejectedValue(profile) : vi.fn().mockResolvedValue(profile);
  await fillPriorYear({
    companyNumber: "00000001",
    form: formKind,
    note: document.getElementById("priorYearNote"),
    doc: document,
    search,
    welsh: false,
    fetchLastAccounts,
    readProfile,
  });
  return { fetchLastAccounts, note: document.getElementById("priorYearNote") };
}

const value = (id) => document.getElementById(id).value;

describe("prior-year fill", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("puts each figure of the last accounts into the prior-year field for its line and says what it placed and left empty", async () => {
    const { note } = await fill(MICRO_FORM, { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS });
    expect(value("priorFixedAssets")).toBe("10000");
    expect(value("priorCurrentAssets")).toBe("5000");
    expect(value("priorProfitAndLossAccount")).toBe("9900");
    expect(value("priorCapitalAndReserves")).toBe("10000");
    expect(value("priorProvisionsForLiabilities")).toBe("");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain(
      "6 prior-year figures are filled in from the company's last accounts, made up to 30 April 2098 and approved on 20 October 2098.",
    );
    expect(note.textContent).toContain("Left empty, with no figure in those accounts: Provisions for liabilities.");
  });

  it("fills nothing and names both dates, with the filing history, when the last accounts do not end the day before this period", async () => {
    const { note } = await fill(
      MICRO_FORM,
      { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS },
      { profile: { companyNumber: "00000001", accountsNextPeriodStart: "2099-05-01" } },
    );
    expect(value("priorFixedAssets")).toBe("");
    expect(note.textContent).toContain(
      "The last accounts filed were made up to 30 April 2098, and this period starts on 1 May 2099, so the year between is not on the register and the prior year is left empty. See the company's filing history.",
    );
    expect(note.querySelector("a").getAttribute("href")).toBe("/companies-house/company/00000001/filing-history");
  });

  it("fills nothing when Companies House states no next accounting period", async () => {
    const { note } = await fill(
      MICRO_FORM,
      { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS },
      { profile: { companyNumber: "00000001" } },
    );
    expect(value("priorFixedAssets")).toBe("");
    expect(note.textContent).toContain("Companies House states no next accounting period for this company");
  });

  it("says the last accounts could not be read when the profile cannot be read", async () => {
    const { note } = await fill(MICRO_FORM, { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS }, { profile: new Error("offline") });
    expect(value("priorFixedAssets")).toBe("");
    expect(note.textContent).toContain("could not be read from Companies House");
  });

  it("names each line left empty by its heading, without the (optional) after it or the Of which, before a part of a line", async () => {
    const form = MICRO_FORM.replace(">Provisions for liabilities<", ">Provisions for liabilities (optional)<").replace(
      "</table>",
      `${row("priorTradeDebtors", "Of which, trade debtors")}</table>`,
    );
    const { note } = await fill(form, { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS });
    expect(note.textContent).toContain("Left empty, with no figure in those accounts: Provisions for liabilities, Trade debtors.");
  });

  it("keeps a prior-year figure already entered", async () => {
    await fill(MICRO_FORM, { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS }, { typed: { priorFixedAssets: "1234" } });
    expect(value("priorFixedAssets")).toBe("1234");
    expect(value("priorCurrentAssets")).toBe("5000");
  });

  it("never runs on a revision, which fills from its receipt", async () => {
    const { fetchLastAccounts, note } = await fill(
      MICRO_FORM,
      { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS },
      { search: "?amend=receipt-1" },
    );
    expect(fetchLastAccounts).not.toHaveBeenCalled();
    expect(value("priorFixedAssets")).toBe("");
    expect(note.hidden).toBe(true);
    expect(isRevision("?amend=x")).toBe(true);
    expect(isRevision("?companyNumber=00000001")).toBe(false);
  });

  it("names the small company form, with the company, when the last accounts were small company accounts, and fills the lines the micro-entity form has", async () => {
    const small = {
      ...MICRO_ACCOUNTS,
      regime: "small",
      balanceSheet: { ...MICRO_ACCOUNTS.balanceSheet, stocks: 600 },
      profitAndLoss: { format: 1, figures: { turnover: 60000 } },
    };
    const { note } = await fill(MICRO_FORM, { outcome: "mapped", set: SET, accounts: small });
    const link = note.querySelector("a");
    expect(note.textContent).toContain(
      "The company's last accounts were small company accounts: file this year's on the small company accounts form.",
    );
    expect(link.getAttribute("href")).toBe("/companies-house/fileSmallCompanyAccounts.html?companyNumber=00000001");
    expect(value("priorFixedAssets")).toBe("10000");
  });

  it("fills a field that still holds the value the page starts it with", async () => {
    const withDefault = MICRO_FORM.replace('id="priorCurrentAssets" value=""', 'id="priorCurrentAssets" value="0"');
    await fill(withDefault, { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS });
    expect(value("priorCurrentAssets")).toBe("5000");
  });

  it("names the micro-entity form when the small company form opens for a company whose last accounts were micro-entity accounts", async () => {
    const { note } = await fill(SMALL_FORM, { outcome: "mapped", set: SET, accounts: MICRO_ACCOUNTS }, { form: "small" });
    expect(note.querySelector("a").getAttribute("href")).toBe("/companies-house/fileMicroEntityAccounts.html?companyNumber=00000001");
    expect(document.getElementById("includeComparatives").checked).toBe(false);
    expect(note.textContent).toContain("0 prior-year figures are filled in");
  });

  it("shows the small company form's comparatives in the last accounts' profit and loss format and fills only that format's lines", async () => {
    const small = {
      ...MICRO_ACCOUNTS,
      regime: "small",
      balanceSheet: { stocks: 600, cashAtBank: 9000, netAssets: 9600, capitalAndReserves: 9600 },
      profitAndLoss: { format: 1, figures: { turnover: 60000, staffCosts: 20000 } },
    };
    await fill(SMALL_FORM, { outcome: "mapped", set: SET, accounts: small }, { form: "small" });
    expect(document.getElementById("includeComparatives").checked).toBe(true);
    expect(value("priorStocks")).toBe("600");
    expect(value("priorTurnover")).toBe("60000");
    expect(value("priorStaffCosts")).toBe("");
  });

  it.each([
    [{ outcome: "none" }, "Companies House holds no accounts for this company, so the prior year is left empty."],
    [
      { outcome: "paper", set: { ...SET, paperFiled: true } },
      "The company's last accounts, made up to 30 April 2098, were filed on paper. Companies House holds them as a scanned document only, so the prior year is left empty: type it from those accounts.",
    ],
    [
      { outcome: "no-ixbrl", set: SET },
      "Companies House holds the company's last accounts, made up to 30 April 2098, without an iXBRL document, so the prior year is left empty: type it from those accounts.",
    ],
    [
      { outcome: "too-large", set: SET },
      "The company's last accounts, made up to 30 April 2098, are too large to read here, so the prior year is left empty: type it from those accounts.",
    ],
    [
      { outcome: "unreadable", set: SET, reason: "This file has no balance sheet for its own year." },
      "The company's last accounts, made up to 30 April 2098, do not read as accounts here, so the prior year is left empty: type it from those accounts.",
    ],
  ])("leaves the form empty and says why for %j", async (body, text) => {
    const { note } = await fill(MICRO_FORM, body);
    expect(note.textContent).toBe(text);
    expect(value("priorFixedAssets")).toBe("");
  });

  it("says nothing to an account without the filing activity, whose form shows the bundle to buy", async () => {
    const { note } = await fill(MICRO_FORM, { message: "Forbidden" }, { status: 403 });
    expect(note.hidden).toBe(true);
  });

  it("says the last accounts could not be read when the route fails", async () => {
    const { note } = await fill(MICRO_FORM, { message: "Too many requests" }, { status: 429 });
    expect(note.textContent).toBe("The company's last accounts could not be read from Companies House, so the prior year is left empty.");
  });

  it("names the profit and loss account to correct when the filled prior year holds reserves the micro-entity form has no line for", async () => {
    const withReserves = {
      ...MICRO_ACCOUNTS,
      balanceSheet: { ...MICRO_ACCOUNTS.balanceSheet, profitAndLossAccount: 7900 },
    };
    const { note } = await fill(MICRO_FORM, { outcome: "mapped", set: SET, accounts: withReserves });
    expect(note.textContent).toContain(
      "Those accounts hold capital and reserves of £10,000, but called up share capital and the profit and loss account add up to £8,000: the difference sits in reserves this form has no line for. Correct the prior year's profit and loss account so the two agree before you preview.",
    );
  });
});
