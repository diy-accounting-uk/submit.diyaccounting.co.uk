// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-field-table.js
// Renders HMRC figures as a two-column table: one row per field, a plain-English name, the
// definition HMRC publishes for it, and the amount right-aligned. API field names travel only
// in data-hmrc-field attributes. Needs money-format.js loaded first for formatGbp.

(function () {
  "use strict";

  const RETRIEVED = "2026-10-01";

  const SOURCES = {
    individualCalculations: {
      title: "HMRC Individual Calculations (MTD) API 8.0",
      url: "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0",
      retrieved: RETRIEVED,
    },
    adjustableSummary: {
      title: "HMRC Business Source Adjustable Summary (MTD) API 7.0",
      url: "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-bsas-api/7.0",
      retrieved: RETRIEVED,
    },
    blindPersonsAllowance: {
      title: "gov.uk: Blind Person's Allowance",
      url: "https://www.gov.uk/blind-persons-allowance",
      retrieved: RETRIEVED,
    },
    marriageAllowance: { title: "gov.uk: Marriage Allowance", url: "https://www.gov.uk/marriage-allowance", retrieved: RETRIEVED },
    giftAid: {
      title: "gov.uk: Tax relief when you donate to a charity",
      url: "https://www.gov.uk/donating-to-charity/gift-aid",
      retrieved: RETRIEVED,
    },
    dividends: { title: "gov.uk: Tax on dividends", url: "https://www.gov.uk/tax-on-dividends", retrieved: RETRIEVED },
    vatNotice70012: {
      title: "VAT Notice 700/12: how to fill in and submit your VAT Return",
      url: "https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012",
      retrieved: RETRIEVED,
    },
  };

  // Keyed by the path of the field in HMRC's calculation response under calculation.
  const TAX_CALCULATION_FIELDS = {
    "taxCalculation.incomeTax.totalIncomeTaxDue": { label: "Income Tax", definition: "Total income tax due." },
    "taxCalculation.nics.totalNic": { label: "National Insurance", definition: "Total NIC deductions." },
    "taxCalculation.totalTaxDeducted": { label: "Tax already deducted", definition: "Total tax deducted." },
  };

  // Keyed by the field's path under calculation.allowancesAndDeductions.
  const ALLOWANCE_FIELDS = {
    "personalAllowance": { label: "Personal Allowance", definition: "The personal allowance available for the tax year." },
    "reducedPersonalAllowance": {
      label: "Reduced Personal Allowance",
      definition: "The amount that the personal allowance has been reduced to.",
    },
    "marriageAllowanceTransferOut.personalAllowanceBeforeTransferOut": {
      label: "Personal Allowance before Marriage Allowance transfer",
      definition: "The amount of the personal allowance before transferring out.",
    },
    "marriageAllowanceTransferOut.transferredOutAmount": {
      label: "Marriage Allowance transferred out",
      definition: "Marriage Allowance lets you transfer £1,260 of your Personal Allowance to your husband, wife or civil partner.",
      source: "marriageAllowance",
    },
    "blindPersonsAllowance": {
      label: "Blind Person's Allowance",
      definition: "Blind Person’s Allowance is an extra amount of tax-free allowance.",
      source: "blindPersonsAllowance",
    },
    "giftOfInvestmentsAndPropertyToCharity": {
      label: "Gifts of investments and property to charity",
      definition: "Investments or property gifts made to charity.",
    },
    "giftAidRelief": {
      label: "Gift Aid relief",
      definition:
        "Donating through Gift Aid means charities and community amateur sports clubs (CASCs) can claim an extra 25p for every £1 you give.",
      source: "giftAid",
    },
    "dividendAllowance": {
      label: "Dividend allowance",
      definition:
        "You also get a dividend allowance of £500 each year. You only pay tax on any dividend income above the dividend allowance.",
      source: "dividends",
    },
    "lossesAppliedToGeneralIncome": {
      label: "Losses set against general income",
      definition: "Losses that have been applied to general income.",
    },
    "cgtLossSetAgainstInYearGeneralIncome": {
      label: "Capital Gains Tax losses set against general income",
      definition: "CGT losses that have been applied to general income.",
    },
    "qualifyingLoanInterestFromInvestments": {
      label: "Qualifying loan interest",
      definition: "Qualifying loan interest payments made.",
    },
    "postCessationTradeReceipts": {
      label: "Post-cessation trade relief",
      definition: "Trade reliefs and other losses post cessation of a business.",
    },
    "paymentsToTradeUnionsForDeathBenefits": {
      label: "Payments to trade unions for death benefits",
      definition: "Payments made to a trade union or friendly society for death benefits.",
    },
    "grossAnnuityPayments": { label: "Gross annuity payments", definition: "The gross value of annuity payments made." },
    "annuityPayments.reliefClaimed": { label: "Annual payments relief claimed", definition: "The value of annual payments made." },
    "annuityPayments.rate": { label: "Annual payments tax rate", definition: "The tax rate used in the calculation.", kind: "percent" },
    "pensionContributions": {
      label: "Pension contributions",
      definition:
        "Total of 'Retirement Annuity Payments', 'Payment To Employers Scheme No Tax Relief' and 'Overseas Pension Scheme Contributions'.",
    },
    "pensionContributionsDetail.retirementAnnuityPayments": {
      label: "Retirement annuity payments",
      definition: "The value of retirement annuity payments.",
    },
    "pensionContributionsDetail.paymentToEmployersSchemeNoTaxRelief": {
      label: "Payments to an employer's scheme with no tax relief",
      definition: "Payments to employer's pension scheme with no tax relief.",
    },
    "pensionContributionsDetail.overseasPensionSchemeContributions": {
      label: "Overseas pension scheme contributions",
      definition: "The value of contributions to an overseas pension scheme.",
    },
  };

  const SUMMARY_TOTALS = {
    totalIncome: { label: "Total income", definition: "The total income for the income source." },
    totalExpenses: { label: "Total expenses", definition: "The total expenses for the income source." },
    totalAdditions: { label: "Total additions", definition: "The total additions to net profit (or deduction to net loss)." },
    totalDeductions: { label: "Total deductions", definition: "The total deductions to net loss (or addition to net profit)." },
    netProfit: { label: "Net profit", definition: "The net profit of income source.", total: true },
    netLoss: { label: "Net loss", definition: "The net loss of income source.", total: true },
  };

  // Keyed by the field's path under the adjustable summary's adjustableSummaryCalculation.
  const SELF_EMPLOYMENT_SUMMARY_FIELDS = {
    "totalIncome": SUMMARY_TOTALS.totalIncome,
    "income.turnover": {
      label: "Turnover",
      definition: "The takings, fees, sales or money earned by your business Income associated with the running of the business.",
    },
    "totalExpenses": SUMMARY_TOTALS.totalExpenses,
    "expenses.costOfGoods": {
      label: "Cost of goods",
      definition: "Cost of goods bought for resale or goods used. Expenses associated with the running of the business.",
    },
    "totalAdditions": SUMMARY_TOTALS.totalAdditions,
    "netProfit": SUMMARY_TOTALS.netProfit,
    "netLoss": SUMMARY_TOTALS.netLoss,
  };

  const UK_PROPERTY_SUMMARY_FIELDS = {
    "totalIncome": SUMMARY_TOTALS.totalIncome,
    "income.totalRentsReceived": { label: "Total rents received", definition: "The total amount of property rental income." },
    "income.otherPropertyIncome": {
      label: "Other property income",
      definition:
        "Other income from property, such as rent charges and ground rents, income from letting others tip waste on your land, and income for the use of a caravan or houseboat at a fixed location.",
    },
    "totalDeductions": SUMMARY_TOTALS.totalDeductions,
    "deductions.costOfReplacingDomesticItems": {
      label: "Cost of replacing domestic items",
      definition: "Cost of Replacing Domestic Items - formerly Wear and Tear allowance.",
    },
    "netProfit": SUMMARY_TOTALS.netProfit,
    "netLoss": SUMMARY_TOTALS.netLoss,
  };

  // The nine boxes of a VAT Return, keyed by HMRC's VAT API field name. Each definition quotes
  // the box's own section of VAT Notice 700/12.
  const VAT_RETURN_BOXES = [
    {
      box: 1,
      field: "vatDueSales",
      label: "VAT due on sales and other outputs",
      definition: "Include the VAT due on all goods and services you supplied in the period covered by the return.",
    },
    {
      box: 2,
      field: "vatDueAcquisitions",
      label: "VAT due on acquisitions from EU",
      definition: "Box 2 VAT due in the period on acquisitions of goods made in Northern Ireland from EU member states",
    },
    {
      box: 3,
      field: "totalVatDue",
      label: "Total VAT due (Box 1 + Box 2)",
      definition: "Show the total VAT due, that is, boxes 1 and 2 added together.",
    },
    {
      box: 4,
      field: "vatReclaimedCurrPeriod",
      label: "VAT reclaimed on purchases and inputs",
      definition: "Show the total amount of deductible VAT charged on your business purchases.",
    },
    { box: 5, field: "netVatDue", label: "Net VAT to pay or reclaim", definition: "deduct the number in box 4 from the number in box 3" },
    {
      box: 6,
      field: "totalValueSalesExVAT",
      label: "Total value of sales (excl. VAT)",
      definition: "Show the total value of all your business sales and other specific outputs but leave out any VAT.",
    },
    {
      box: 7,
      field: "totalValuePurchasesExVAT",
      label: "Total value of purchases (excl. VAT)",
      definition: "Show the total value of your purchases and expenses but leave out any VAT.",
    },
    {
      box: 8,
      field: "totalValueGoodsSuppliedExVAT",
      label: "Total value of goods supplied to EU (excl. VAT)",
      definition:
        "Show the total value of all supplies of goods to EU member states and directly related costs, such as freight and insurance, where these form part of the invoice or contract price.",
    },
    {
      box: 9,
      field: "totalAcquisitionsExVAT",
      label: "Total acquisitions from EU (excl. VAT)",
      definition: "Box 9 total value of all acquisitions goods and related costs, excluding any VAT, from EU member states.",
    },
  ].map((entry) => ({ ...entry, source: "vatNotice70012", anchor: `filling-in-box-${entry.box}` }));

  const ABSENT = "—";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatIsoDate(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
  }

  function isAmount(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function formatMoney(value) {
    return isAmount(value) ? window.formatGbp(value) : ABSENT;
  }

  function formatValue(value, kind) {
    if (!isAmount(value)) return ABSENT;
    return kind === "percent" ? `${value}%` : window.formatGbp(value);
  }

  function valueAt(data, path) {
    return path.split(".").reduce((node, key) => (node && typeof node === "object" ? node[key] : undefined), data);
  }

  function humanise(key) {
    const words = key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function fieldRow(path, catalogueEntry, value, defaultSource) {
    return {
      field: path,
      label: catalogueEntry.label,
      definition: catalogueEntry.definition,
      source: catalogueEntry.source || defaultSource,
      kind: catalogueEntry.kind || "money",
      total: Boolean(catalogueEntry.total),
      value,
    };
  }

  // One row per numeric field HMRC returned under allowancesAndDeductions, catalogued fields
  // first in catalogue order, then any field the catalogue does not know, named from its key.
  function allowanceRows(allowances) {
    const data = allowances || {};
    const rows = [];
    const seen = new Set();
    for (const [path, entry] of Object.entries(ALLOWANCE_FIELDS)) {
      const value = valueAt(data, path);
      if (isAmount(value)) {
        rows.push(fieldRow(path, entry, value, "individualCalculations"));
        seen.add(path);
      }
    }
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (isAmount(value) && !seen.has(key)) {
        rows.push({ field: key, label: humanise(key), kind: "money", value });
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const child of Object.keys(value)) {
          const path = `${key}.${child}`;
          if (isAmount(value[child]) && !seen.has(path)) {
            rows.push({ field: path, label: `${humanise(key)}: ${humanise(child).toLowerCase()}`, kind: "money", value: value[child] });
          }
        }
      }
    }
    return rows;
  }

  function taxCalculationRows(calculation) {
    return Object.entries(TAX_CALCULATION_FIELDS).map(([path, entry]) =>
      fieldRow(path, entry, valueAt(calculation || {}, path), "individualCalculations"),
    );
  }

  // Every catalogued field shows, absent ones as a dash, except that only one of net profit and
  // net loss shows: the one HMRC returned, or net profit when it returned neither.
  function summaryRows(summaryCalculation, catalogue) {
    const data = summaryCalculation || {};
    const hasLoss = isAmount(data.netLoss) && !isAmount(data.netProfit);
    const shown = (path) => {
      if (path === "netLoss") return hasLoss;
      if (path === "netProfit") return !hasLoss;
      return true;
    };
    return Object.entries(catalogue)
      .filter(([path]) => shown(path))
      .map(([path, entry]) => fieldRow(path, entry, valueAt(data, path), "adjustableSummary"));
  }

  function selfEmploymentSummaryRows(summaryCalculation) {
    return summaryRows(summaryCalculation, SELF_EMPLOYMENT_SUMMARY_FIELDS);
  }

  function ukPropertySummaryRows(summaryCalculation) {
    return summaryRows(summaryCalculation, UK_PROPERTY_SUMMARY_FIELDS);
  }

  function sourceLink(sourceKey, { anchor, text } = {}) {
    const source = SOURCES[sourceKey];
    const href = anchor ? `${source.url}#${anchor}` : source.url;
    return `<a href="${escapeHtml(href)}" rel="noopener" target="_blank">${escapeHtml(text || source.title)}</a>`;
  }

  function sourcesFooter(rows) {
    const keys = [...new Set(rows.map((row) => row.source).filter(Boolean))];
    if (keys.length === 0) return "";
    const cited = keys.map((key) => `${sourceLink(key)}, retrieved ${formatIsoDate(SOURCES[key].retrieved)}`).join("; ");
    return `<p class="field-table-source">Definitions quoted from ${cited}.</p>`;
  }

  // rows: [{ field, label, value, kind?, definition?, source?, total?, valueId? }]
  function renderFieldTable(rows, { caption, emptyText } = {}) {
    if (!rows || rows.length === 0) {
      return `<p class="no-data">${escapeHtml(emptyText || "HMRC returned no figures here.")}</p>`;
    }
    const body = rows
      .map((row) => {
        const definition = row.definition ? `<span class="field-definition">“${escapeHtml(row.definition)}”</span>` : "";
        const valueId = row.valueId ? ` id="${escapeHtml(row.valueId)}"` : "";
        return (
          `<tr class="field-row${row.total ? " field-row-total" : ""}" data-hmrc-field="${escapeHtml(row.field)}">` +
          `<th scope="row"><span class="field-name">${escapeHtml(row.label)}</span>${definition}</th>` +
          `<td class="field-amount"${valueId}>${escapeHtml(formatValue(row.value, row.kind))}</td></tr>`
        );
      })
      .join("");
    const captionHtml = caption ? `<caption class="visually-hidden">${escapeHtml(caption)}</caption>` : "";
    return (
      `<table class="field-table">${captionHtml}<thead><tr><th scope="col">Item</th><th scope="col" class="field-amount">Amount</th></tr></thead>` +
      `<tbody>${body}</tbody></table>${sourcesFooter(rows)}`
    );
  }

  // Parses the escaped markup of renderFieldTable into nodes, so the page never assigns a string to innerHTML.
  function mountFieldTable(container, rows, options) {
    const parsed = new DOMParser().parseFromString(renderFieldTable(rows, options), "text/html");
    container.replaceChildren(...parsed.body.childNodes);
  }

  window.HmrcFieldTable = {
    SOURCES,
    VAT_RETURN_BOXES,
    ALLOWANCE_FIELDS,
    SELF_EMPLOYMENT_SUMMARY_FIELDS,
    UK_PROPERTY_SUMMARY_FIELDS,
    TAX_CALCULATION_FIELDS,
    escapeHtml,
    formatIsoDate,
    formatMoney,
    allowanceRows,
    taxCalculationRows,
    selfEmploymentSummaryRows,
    ukPropertySummaryRows,
    sourceLink,
    renderFieldTable,
    mountFieldTable,
  };
})();
