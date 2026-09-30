// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { TAX_YEARS, FINANCIAL_YEARS, SELF_EMPLOYED, LIMITED_COMPANY, SOURCED } from "./rates-data.js";
import { computeSelfEmployed, computeLimitedCompany } from "./rates-compute.js";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const byId = (id) => document.getElementById(id);
const numberValue = (id) => {
  const parsed = parseFloat(byId(id).value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatDate = (date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

const latestTaxYear = TAX_YEARS[TAX_YEARS.length - 1];
const latestFinancialYear = FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1];

let labourEditedByUser = false;

function readInputs() {
  return {
    income: numberValue("ratesIncome"),
    expenses: numberValue("ratesExpenses"),
    miles: numberValue("ratesMiles"),
    equipment: numberValue("ratesEquipment"),
    poolBroughtForward: numberValue("ratesPoolBroughtForward"),
    personalAllowance: numberValue("ratesPersonalAllowance"),
    associatedCompanies: Math.floor(numberValue("ratesAssociatedCompanies")),
    vatRegistered: byId("ratesVatRegistered").checked,
    vatScheme: document.querySelector('input[name="ratesVatScheme"]:checked').value,
    flatRatePercent: numberValue("ratesFlatRatePercent"),
    cis: byId("ratesCis").checked,
    cisStatus: byId("ratesCisStatus").value,
    cisLabour: numberValue("ratesCisLabour"),
    yearEnd: byId("ratesYearEnd").value,
  };
}

function applyVisibility(state) {
  for (const element of document.querySelectorAll("#ratesCalculator [data-show], #ratesResults [data-show]")) {
    element.hidden = !element.dataset.show.split(" ").every((token) => state[token]);
  }
}

function setText(id, text) {
  byId(id).textContent = text;
}

function showMessages(messages) {
  if (!window.StatusMessages) return;
  window.StatusMessages.clear();
  for (const message of messages) window.StatusMessages.show(message, "warning");
}

function renderCompanyRows(rows) {
  const body = byId("ratesOutCtRows").querySelector("tbody");
  body.replaceChildren();
  for (const row of rows.filter((entry) => entry.days > 0)) {
    const tr = document.createElement("tr");
    const cells = [
      `FY${row.year}`,
      String(row.days),
      money.format(row.profitShare),
      `${row.ratePercent}%`,
      money.format(row.taxBeforeRelief),
      money.format(row.marginalRelief),
      money.format(row.tax),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}

function showCommonResults(result) {
  setText("ratesOutVatDue", money.format(result.vat.vatDue));
  setText("ratesOutMileageAllowance", money.format(result.mileageAllowance));
  setText("ratesOutCapitalAllowances", money.format(result.capitalAllowances.total));
  setText("ratesOutTaxableProfit", money.format(result.taxableProfit));
  setText("ratesOutCisDeducted", money.format(result.cisDeducted));
  setText("ratesOutProfitAfterTax", money.format(result.profitAfterTax));
}

function recompute() {
  const limitedCompany = byId("ratesTypeLimitedCompany").checked;
  const inputs = readInputs();
  if (!labourEditedByUser) {
    byId("ratesCisLabour").value = byId("ratesIncome").value;
    inputs.cisLabour = numberValue("ratesCisLabour");
  }
  applyVisibility({
    "self-employed": !limitedCompany,
    "limited-company": limitedCompany,
    "vat": inputs.vatRegistered,
    "flat-rate": inputs.vatRegistered && inputs.vatScheme === "flat-rate",
    "cis": inputs.cis,
  });
  setText("ratesOutCisDeductedLabel", limitedCompany ? "CIS deducted, set against the company's PAYE bill" : "CIS deducted");

  try {
    if (limitedCompany) {
      const sourced = { ...SOURCED[latestTaxYear], ...SOURCED[`fy${latestFinancialYear}`] };
      const result = computeLimitedCompany(inputs, LIMITED_COMPANY, sourced);
      showCommonResults(result);
      setText("ratesOutPeriod", `${formatDate(result.periodStart)} to ${formatDate(result.periodEnd)}`);
      setText("ratesOutMarginalRelief", money.format(result.marginalRelief));
      setText("ratesOutCorporationTax", money.format(result.corporationTax));
      renderCompanyRows(result.rows);
      showMessages(result.messages);
    } else {
      const result = computeSelfEmployed(inputs, SELF_EMPLOYED[byId("ratesTaxYear").value], SOURCED[byId("ratesTaxYear").value]);
      showCommonResults(result);
      setText("ratesOutPersonalAllowance", money.format(result.personalAllowance));
      setText("ratesOutIncomeTax", money.format(result.incomeTax));
      setText("ratesOutClass4", money.format(result.class4));
      setText("ratesOutClass2Voluntary", money.format(result.class2Voluntary));
      setText("ratesOutTaxAndNi", money.format(result.taxAndNi));
      setText("ratesOutLeftToPay", money.format(result.leftToPay));
      showMessages(result.messages);
    }
  } catch (error) {
    showMessages([error.message]);
  }
}

function resetPersonalAllowance() {
  byId("ratesPersonalAllowance").value = SELF_EMPLOYED[byId("ratesTaxYear").value].income_tax.personal_allowance;
}

function init() {
  const form = byId("ratesCalculator");
  byId("ratesFlatRatePercent").value = Number((SOURCED[latestTaxYear].flatRateLimitedCostTrader * 100).toFixed(2));
  resetPersonalAllowance();
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target.id === "ratesCisLabour") labourEditedByUser = true;
    recompute();
  });
  form.addEventListener("change", (event) => {
    if (event.target.id === "ratesTaxYear") resetPersonalAllowance();
    recompute();
  });
  recompute();
}

init();
