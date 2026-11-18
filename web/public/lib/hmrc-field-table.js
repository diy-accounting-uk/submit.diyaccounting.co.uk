// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-field-table.js
// Renders HMRC figures as a two-column table: one row per field, a plain-English name, the
// definition HMRC publishes for it, and the amount right-aligned. API field names travel only
// in data-hmrc-field attributes. Needs money-format.js loaded first for formatGbp.

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  const RETRIEVED = "2026-10-01";

  const SOURCES = {
    individualCalculations: {
      title: siteText("widget.source-individual-calculations", "HMRC Individual Calculations (MTD) API 8.0"),
      url: "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0",
      retrieved: RETRIEVED,
    },
    adjustableSummary: {
      title: siteText("widget.source-adjustable-summary", "HMRC Business Source Adjustable Summary (MTD) API 7.0"),
      url: "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-bsas-api/7.0",
      retrieved: RETRIEVED,
    },
    blindPersonsAllowance: {
      title: siteText("widget.source-blind-persons-allowance", "gov.uk: Blind Person's Allowance"),
      url: "https://www.gov.uk/blind-persons-allowance",
      retrieved: RETRIEVED,
    },
    marriageAllowance: {
      title: siteText("widget.source-marriage-allowance", "gov.uk: Marriage Allowance"),
      url: "https://www.gov.uk/marriage-allowance",
      welshUrl: "https://www.gov.uk/lwfans-priodasol",
      retrieved: RETRIEVED,
    },
    giftAid: {
      title: siteText("widget.source-gift-aid", "gov.uk: Tax relief when you donate to a charity"),
      url: "https://www.gov.uk/donating-to-charity/gift-aid",
      retrieved: RETRIEVED,
    },
    dividends: {
      title: siteText("widget.source-dividends", "gov.uk: Tax on dividends"),
      url: "https://www.gov.uk/tax-on-dividends",
      welshUrl: "https://www.gov.uk/treth-ar-ddifidendau",
      retrieved: RETRIEVED,
    },
    vatNotice70012: {
      title: siteText("widget.source-vat-notice-700-12", "VAT Notice 700/12: how to fill in and submit your VAT Return"),
      url: "https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012",
      retrieved: RETRIEVED,
    },
  };

  // Keyed by the path of the field in HMRC's calculation response under calculation.
  const TAX_CALCULATION_FIELDS = {
    "taxCalculation.incomeTax.totalIncomeTaxDue": {
      label: siteText("itsa.field-income-tax", "Income Tax"),
      definition: siteText("itsa.definition-income-tax", "Total income tax due."),
    },
    "taxCalculation.nics.totalNic": {
      label: siteText("itsa.field-national-insurance", "National Insurance"),
      definition: siteText("itsa.definition-national-insurance", "Total NIC deductions."),
    },
    "taxCalculation.totalTaxDeducted": {
      label: siteText("itsa.field-tax-already-deducted", "Tax already deducted"),
      definition: siteText("itsa.definition-tax-already-deducted", "Total tax deducted."),
    },
  };

  // Keyed by the field's path under calculation.allowancesAndDeductions.
  const ALLOWANCE_FIELDS = {
    "personalAllowance": {
      label: siteText("itsa.field-personal-allowance", "Personal Allowance"),
      definition: siteText("itsa.definition-personal-allowance", "The personal allowance available for the tax year."),
    },
    "reducedPersonalAllowance": {
      label: siteText("itsa.field-reduced-personal-allowance", "Reduced Personal Allowance"),
      definition: siteText("itsa.definition-reduced-personal-allowance", "The amount that the personal allowance has been reduced to."),
    },
    "marriageAllowanceTransferOut.personalAllowanceBeforeTransferOut": {
      label: siteText(
        "itsa.field-personal-allowance-before-marriage-allowance-transfer",
        "Personal Allowance before Marriage Allowance transfer",
      ),
      definition: siteText(
        "itsa.definition-personal-allowance-before-marriage-allowance-transfer",
        "The amount of the personal allowance before transferring out.",
      ),
    },
    "marriageAllowanceTransferOut.transferredOutAmount": {
      label: siteText("itsa.field-marriage-allowance-transferred-out", "Marriage Allowance transferred out"),
      definition: siteText(
        "itsa.definition-marriage-allowance-transferred-out",
        "Marriage Allowance lets you transfer £1,260 of your Personal Allowance to your husband, wife or civil partner.",
      ),
      source: "marriageAllowance",
    },
    "blindPersonsAllowance": {
      label: siteText("itsa.field-blind-person-s-allowance", "Blind Person's Allowance"),
      definition: siteText(
        "itsa.definition-blind-person-s-allowance",
        "Blind Person’s Allowance is an extra amount of tax-free allowance.",
      ),
      source: "blindPersonsAllowance",
    },
    "giftOfInvestmentsAndPropertyToCharity": {
      label: siteText("itsa.field-gifts-of-investments-and-property-to", "Gifts of investments and property to charity"),
      definition: siteText("itsa.definition-gifts-of-investments-and-property-to", "Investments or property gifts made to charity."),
    },
    "giftAidRelief": {
      label: siteText("itsa.field-gift-aid-relief", "Gift Aid relief"),
      definition: siteText(
        "itsa.definition-gift-aid-relief",
        "Donating through Gift Aid means charities and community amateur sports clubs (CASCs) can claim an extra 25p for every £1 you give.",
      ),
      source: "giftAid",
    },
    "dividendAllowance": {
      label: siteText("itsa.field-dividend-allowance", "Dividend allowance"),
      definition: siteText(
        "itsa.definition-dividend-allowance",
        "You also get a dividend allowance of £500 each year. You only pay tax on any dividend income above the dividend allowance.",
      ),
      source: "dividends",
    },
    "lossesAppliedToGeneralIncome": {
      label: siteText("itsa.field-losses-set-against-general-income", "Losses set against general income"),
      definition: siteText("itsa.definition-losses-set-against-general-income", "Losses that have been applied to general income."),
    },
    "cgtLossSetAgainstInYearGeneralIncome": {
      label: siteText("itsa.field-capital-gains-tax-losses-set-against", "Capital Gains Tax losses set against general income"),
      definition: siteText("itsa.definition-capital-gains-tax-losses-set-against", "CGT losses that have been applied to general income."),
    },
    "qualifyingLoanInterestFromInvestments": {
      label: siteText("itsa.field-qualifying-loan-interest", "Qualifying loan interest"),
      definition: siteText("itsa.definition-qualifying-loan-interest", "Qualifying loan interest payments made."),
    },
    "postCessationTradeReceipts": {
      label: siteText("itsa.field-post-cessation-trade-relief", "Post-cessation trade relief"),
      definition: siteText("itsa.definition-post-cessation-trade-relief", "Trade reliefs and other losses post cessation of a business."),
    },
    "paymentsToTradeUnionsForDeathBenefits": {
      label: siteText("itsa.field-payments-to-trade-unions-for-death", "Payments to trade unions for death benefits"),
      definition: siteText(
        "itsa.definition-payments-to-trade-unions-for-death",
        "Payments made to a trade union or friendly society for death benefits.",
      ),
    },
    "grossAnnuityPayments": {
      label: siteText("itsa.field-gross-annuity-payments", "Gross annuity payments"),
      definition: siteText("itsa.definition-gross-annuity-payments", "The gross value of annuity payments made."),
    },
    "annuityPayments.reliefClaimed": {
      label: siteText("itsa.field-annual-payments-relief-claimed", "Annual payments relief claimed"),
      definition: siteText("itsa.definition-annual-payments-relief-claimed", "The value of annual payments made."),
    },
    "annuityPayments.rate": {
      label: siteText("itsa.field-annual-payments-tax-rate", "Annual payments tax rate"),
      definition: siteText("itsa.definition-annual-payments-tax-rate", "The tax rate used in the calculation."),
      kind: "percent",
    },
    "pensionContributions": {
      label: siteText("itsa.field-pension-contributions", "Pension contributions"),
      definition: siteText(
        "itsa.definition-pension-contributions",
        "Total of 'Retirement Annuity Payments', 'Payment To Employers Scheme No Tax Relief' and 'Overseas Pension Scheme Contributions'.",
      ),
    },
    "pensionContributionsDetail.retirementAnnuityPayments": {
      label: siteText("itsa.field-retirement-annuity-payments", "Retirement annuity payments"),
      definition: siteText("itsa.definition-retirement-annuity-payments", "The value of retirement annuity payments."),
    },
    "pensionContributionsDetail.paymentToEmployersSchemeNoTaxRelief": {
      label: siteText("itsa.field-payments-to-an-employer-s-scheme", "Payments to an employer's scheme with no tax relief"),
      definition: siteText("itsa.definition-payments-to-an-employer-s-scheme", "Payments to employer's pension scheme with no tax relief."),
    },
    "pensionContributionsDetail.overseasPensionSchemeContributions": {
      label: siteText("itsa.field-overseas-pension-scheme-contributions", "Overseas pension scheme contributions"),
      definition: siteText(
        "itsa.definition-overseas-pension-scheme-contributions",
        "The value of contributions to an overseas pension scheme.",
      ),
    },
  };

  const SUMMARY_TOTALS = {
    totalIncome: {
      label: siteText("itsa.field-total-income", "Total income"),
      definition: siteText("itsa.definition-total-income", "The total income for the income source."),
    },
    totalExpenses: {
      label: siteText("itsa.field-total-expenses", "Total expenses"),
      definition: siteText("itsa.definition-total-expenses", "The total expenses for the income source."),
    },
    totalAdditions: {
      label: siteText("itsa.field-total-additions", "Total additions"),
      definition: siteText("itsa.definition-total-additions", "The total additions to net profit (or deduction to net loss)."),
    },
    totalDeductions: {
      label: siteText("itsa.field-total-deductions", "Total deductions"),
      definition: siteText("itsa.definition-total-deductions", "The total deductions to net loss (or addition to net profit)."),
    },
    netProfit: {
      label: siteText("itsa.field-net-profit", "Net profit"),
      definition: siteText("itsa.definition-net-profit", "The net profit of income source."),
      total: true,
    },
    netLoss: {
      label: siteText("itsa.field-net-loss", "Net loss"),
      definition: siteText("itsa.definition-net-loss", "The net loss of income source."),
      total: true,
    },
  };

  // Keyed by the field's path under the adjustable summary's adjustableSummaryCalculation.
  const SELF_EMPLOYMENT_SUMMARY_FIELDS = {
    "totalIncome": SUMMARY_TOTALS.totalIncome,
    "income.turnover": {
      label: siteText("itsa.field-turnover", "Turnover"),
      definition: siteText(
        "itsa.definition-turnover",
        "The takings, fees, sales or money earned by your business Income associated with the running of the business.",
      ),
    },
    "totalExpenses": SUMMARY_TOTALS.totalExpenses,
    "expenses.costOfGoods": {
      label: siteText("itsa.field-cost-of-goods", "Cost of goods"),
      definition: siteText(
        "itsa.definition-cost-of-goods",
        "Cost of goods bought for resale or goods used. Expenses associated with the running of the business.",
      ),
    },
    "totalAdditions": SUMMARY_TOTALS.totalAdditions,
    "netProfit": SUMMARY_TOTALS.netProfit,
    "netLoss": SUMMARY_TOTALS.netLoss,
  };

  const UK_PROPERTY_SUMMARY_FIELDS = {
    "totalIncome": SUMMARY_TOTALS.totalIncome,
    "income.totalRentsReceived": {
      label: siteText("itsa.field-total-rents-received", "Total rents received"),
      definition: siteText("itsa.definition-total-rents-received", "The total amount of property rental income."),
    },
    "income.otherPropertyIncome": {
      label: siteText("itsa.field-other-property-income", "Other property income"),
      definition: siteText(
        "itsa.definition-other-property-income",
        "Other income from property, such as rent charges and ground rents, income from letting others tip waste on your land, and income for the use of a caravan or houseboat at a fixed location.",
      ),
    },
    "totalDeductions": SUMMARY_TOTALS.totalDeductions,
    "deductions.costOfReplacingDomesticItems": {
      label: siteText("itsa.field-cost-of-replacing-domestic-items", "Cost of replacing domestic items"),
      definition: siteText(
        "itsa.definition-cost-of-replacing-domestic-items",
        "Cost of Replacing Domestic Items - formerly Wear and Tear allowance.",
      ),
    },
    "netProfit": SUMMARY_TOTALS.netProfit,
    "netLoss": SUMMARY_TOTALS.netLoss,
  };

  // Keyed by the field's path under one entry of the adjustable summary (a country, or a property
  // from 2026-27) and under the summary as a whole. An optional field shows only when HMRC returned
  // it, so an entry lists the figures it holds, not every figure the summary could hold.
  const FOREIGN_PROPERTY_SUMMARY_FIELDS = {
    "totalIncome": SUMMARY_TOTALS.totalIncome,
    "income.totalRentsReceived": UK_PROPERTY_SUMMARY_FIELDS["income.totalRentsReceived"],
    "income.premiumsOfLeaseGrant": {
      label: siteText("itsa.field-premiums-for-the-grant-of-a", "Premiums for the grant of a lease"),
      optional: true,
    },
    "income.otherPropertyIncome": { ...UK_PROPERTY_SUMMARY_FIELDS["income.otherPropertyIncome"], optional: true },
    "totalExpenses": { ...SUMMARY_TOTALS.totalExpenses, optional: true },
    "expenses.consolidatedExpenses": {
      label: siteText("itsa.field-expenses-entered-as-one-total", "Expenses entered as one total"),
      optional: true,
    },
    "expenses.premisesRunningCosts": {
      label: siteText("itsa.field-rent-rates-insurance-and-ground-rents", "Rent, rates, insurance and ground rents"),
      optional: true,
    },
    "expenses.repairsAndMaintenance": { label: siteText("itsa.field-repairs-and-maintenance", "Repairs and maintenance"), optional: true },
    "expenses.financialCosts": {
      label: siteText("itsa.field-loan-interest-and-other-financial-costs", "Loan interest and other financial costs"),
      optional: true,
    },
    "expenses.professionalFees": {
      label: siteText("itsa.field-legal-management-and-other-professional-fees", "Legal, management and other professional fees"),
      optional: true,
    },
    "expenses.costOfServices": {
      label: siteText("itsa.field-costs-of-services-provided-including-wages", "Costs of services provided, including wages"),
      optional: true,
    },
    "expenses.travelCosts": { label: siteText("itsa.field-travel-costs", "Travel costs"), optional: true },
    "expenses.other": { label: siteText("itsa.field-other-property-expenses", "Other property expenses"), optional: true },
    "expenses.residentialFinancialCost": {
      label: siteText("itsa.field-residential-property-finance-costs", "Residential property finance costs"),
      optional: true,
    },
    "totalDeductions": { ...SUMMARY_TOTALS.totalDeductions, optional: true },
    "deductions.costOfReplacingDomesticItems": { ...UK_PROPERTY_SUMMARY_FIELDS["deductions.costOfReplacingDomesticItems"], optional: true },
    "deductions.otherCapitalAllowance": {
      label: siteText("itsa.field-other-capital-allowance", "Other capital allowance"),
      optional: true,
    },
    "deductions.zeroEmissionsCarAllowance": {
      label: siteText("itsa.field-zero-emissions-car-allowance", "Zero emissions car allowance"),
      optional: true,
    },
    "deductions.propertyAllowance": {
      label: siteText("itsa.field-property-income-allowance", "Property income allowance"),
      optional: true,
    },
    "netProfit": SUMMARY_TOTALS.netProfit,
    "netLoss": SUMMARY_TOTALS.netLoss,
    "taxableProfit": { label: siteText("itsa.field-taxable-profit", "Taxable profit"), optional: true },
  };

  // The nine boxes of a VAT Return, keyed by HMRC's VAT API field name. Each definition quotes
  // the box's own section of VAT Notice 700/12.
  const VAT_RETURN_BOXES = [
    {
      box: 1,
      field: "vatDueSales",
      label: siteText("vat.box-1", "VAT due in the period on sales and other outputs"),
      definition: siteText(
        "vat.box-1-definition",
        "Include the VAT due on all goods and services you supplied in the period covered by the return.",
      ),
    },
    {
      box: 2,
      field: "vatDueAcquisitions",
      label: siteText("vat.box-2", "VAT due in the period on acquisitions of goods made in Northern Ireland from EU member states"),
      definition: siteText(
        "vat.box-2-definition",
        "Box 2 VAT due in the period on acquisitions of goods made in Northern Ireland from EU member states",
      ),
    },
    {
      box: 3,
      field: "totalVatDue",
      label: siteText("vat.box-3", "Total VAT due"),
      definition: siteText("vat.box-3-definition", "Show the total VAT due, that is, boxes 1 and 2 added together."),
    },
    {
      box: 4,
      field: "vatReclaimedCurrPeriod",
      label: siteText("vat.box-4", "VAT reclaimed in the period on purchases and other inputs (including acquisitions from the EU)"),
      definition: siteText("vat.box-4-definition", "Show the total amount of deductible VAT charged on your business purchases."),
    },
    {
      box: 5,
      field: "netVatDue",
      label: siteText("vat.box-5", "Net VAT to pay to HMRC or reclaim"),
      definition: siteText("vat.box-5-definition", "deduct the number in box 4 from the number in box 3"),
    },
    {
      box: 6,
      field: "totalValueSalesExVAT",
      label: siteText("vat.box-6", "Total value of sales and all other outputs excluding any VAT"),
      definition: siteText(
        "vat.box-6-definition",
        "Show the total value of all your business sales and other specific outputs but leave out any VAT.",
      ),
    },
    {
      box: 7,
      field: "totalValuePurchasesExVAT",
      label: siteText("vat.box-7", "Total value of purchases and all other inputs excluding any VAT"),
      definition: siteText("vat.box-7-definition", "Show the total value of your purchases and expenses but leave out any VAT."),
    },
    {
      box: 8,
      field: "totalValueGoodsSuppliedExVAT",
      label: siteText("vat.box-8", "Total value of all supplies of goods and related costs, excluding any VAT, to EU member states"),
      definition: siteText(
        "vat.box-8-definition",
        "Show the total value of all supplies of goods to EU member states and directly related costs, such as freight and insurance, where these form part of the invoice or contract price.",
      ),
    },
    {
      box: 9,
      field: "totalAcquisitionsExVAT",
      label: siteText("vat.box-9", "Total value of all acquisitions of goods and related costs, excluding any VAT, from EU member states"),
      definition: siteText(
        "vat.box-9-definition",
        "Box 9 total value of all acquisitions goods and related costs, excluding any VAT, from EU member states.",
      ),
    },
  ].map((entry) => ({ ...entry, source: "vatNotice70012", anchor: `filling-in-box-${entry.box}` }));

  const ABSENT = "—";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // HMRC's Welsh month names; dates follow the language of the site's text.
  const WELSH_MONTHS = [
    "Ionawr",
    "Chwefror",
    "Mawrth",
    "Ebrill",
    "Mai",
    "Mehefin",
    "Gorffennaf",
    "Awst",
    "Medi",
    "Hydref",
    "Tachwedd",
    "Rhagfyr",
  ];

  function inWelsh() {
    return window.siteLanguage?.chrome?.() === "cy";
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // A date HMRC returned as a customer reads it; anything that is not a calendar date shows as a dash.
  function formatIsoDate(iso) {
    const match = typeof iso === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
    if (!match) return ABSENT;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return ABSENT;
    return `${day} ${(inWelsh() ? WELSH_MONTHS : MONTHS)[month - 1]} ${year}`;
  }

  function isAmount(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function formatMoney(value) {
    return isAmount(value) ? window.formatGbp(value) : ABSENT;
  }

  function formatTextValue(value) {
    if (value === null || value === undefined) return ABSENT;
    if (typeof value === "boolean") return value ? siteText("widget.yes", "Yes") : siteText("widget.no", "No");
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatIsoDate(value);
    if (typeof value === "string") return value.trim() === "" ? ABSENT : value;
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : ABSENT;
    return ABSENT;
  }

  function formatValue(value, kind) {
    if (kind === "text") return formatTextValue(value);
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
        rows.push({ field: key, label: humanise(key), fromHmrcKey: true, kind: "money", value });
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const child of Object.keys(value)) {
          const path = `${key}.${child}`;
          if (isAmount(value[child]) && !seen.has(path)) {
            rows.push({
              field: path,
              label: `${humanise(key)}: ${humanise(child).toLowerCase()}`,
              fromHmrcKey: true,
              kind: "money",
              value: value[child],
            });
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

  // One entry of a foreign property summary (or the summary as a whole): the catalogued figures
  // HMRC returned, with the totals and the profit or loss always shown.
  function foreignPropertySummaryRows(summaryCalculation) {
    const data = summaryCalculation || {};
    return summaryRows(summaryCalculation, FOREIGN_PROPERTY_SUMMARY_FIELDS).filter(
      (row) => !FOREIGN_PROPERTY_SUMMARY_FIELDS[row.field].optional || isAmount(valueAt(data, row.field)),
    );
  }

  // A row named from HMRC's own field key shows that name as HMRC sent it, so on a Welsh page it is
  // marked as English.
  function labelLang(row) {
    return row.fromHmrcKey && inWelsh() ? ' lang="en-GB"' : "";
  }

  function sourceLink(sourceKey, { anchor, text } = {}) {
    const source = SOURCES[sourceKey];
    const url = inWelsh() && source.welshUrl ? source.welshUrl : source.url;
    const href = anchor ? `${url}#${anchor}` : url;
    return `<a href="${escapeHtml(href)}" rel="noopener" target="_blank">${escapeHtml(text || source.title)}</a>`;
  }

  function sourcesFooter(rows) {
    const keys = [...new Set(rows.map((row) => row.source).filter(Boolean))];
    if (keys.length === 0) return "";
    const cited = keys
      .map((key) => {
        const values = { link: sourceLink(key), date: formatIsoDate(SOURCES[key].retrieved) };
        // A source that GOV.UK publishes in Welsh links to its Welsh page; the others are in English only.
        return SOURCES[key].welshUrl
          ? siteText("widget.field-source-welsh-copy", "{link}, retrieved {date}", values)
          : siteText("widget.field-source", "{link}, retrieved {date}", values);
      })
      .join("; ");
    return `<p class="field-table-source">${siteText("widget.field-sources", "Definitions quoted from {cited}.", { cited })}</p>`;
  }

  // The definitions behind a set of rows, quoted from the sources that publish them, as a closed
  // key under the table that holds the figures. Rows without a definition are left out.
  function mountFieldKey(container, rows, { summary = siteText("widget.field-key", "What each line means") } = {}) {
    const defined = (rows || []).filter((row) => row.definition);
    if (defined.length === 0) {
      container.replaceChildren();
      return;
    }
    const items = defined
      .map((row) => `<dt${labelLang(row)}>${escapeHtml(row.label)}</dt><dd>“${escapeHtml(row.definition)}”</dd>`)
      .join("");
    const markup = `<details class="field-key"><summary>${escapeHtml(summary)}</summary><dl>${items}</dl>${sourcesFooter(defined)}</details>`;
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    container.replaceChildren(...parsed.body.childNodes);
  }

  // rows: [{ field, label, value, kind? (money, percent or text), definition?, source?, total?, valueId? }]
  function renderFieldTable(rows, { caption, emptyText } = {}) {
    if (!rows || rows.length === 0) {
      return `<p class="no-data">${escapeHtml(emptyText || siteText("widget.field-none", "HMRC returned no figures here."))}</p>`;
    }
    const body = rows
      .map((row) => {
        const definition = row.definition ? `<span class="field-definition">“${escapeHtml(row.definition)}”</span>` : "";
        const valueId = row.valueId ? ` id="${escapeHtml(row.valueId)}"` : "";
        return (
          `<tr class="field-row${row.total ? " field-row-total" : ""}" data-hmrc-field="${escapeHtml(row.field)}">` +
          `<th scope="row"><span class="field-name"${labelLang(row)}>${escapeHtml(row.label)}</span>${definition}</th>` +
          `<td class="field-amount"${valueId}>${escapeHtml(formatValue(row.value, row.kind))}</td></tr>`
        );
      })
      .join("");
    // "Amount" heads a column of money; a column that holds any text value is headed "Value".
    const valueHeading = rows.every((row) => row.kind !== "text")
      ? siteText("widget.field-amount", "Amount")
      : siteText("widget.field-value", "Value");
    const captionHtml = caption ? `<caption class="visually-hidden">${escapeHtml(caption)}</caption>` : "";
    return (
      `<table class="field-table">${captionHtml}<thead><tr><th scope="col">${siteText("widget.field-item", "Item")}</th><th scope="col" class="field-amount">${valueHeading}</th></tr></thead>` +
      `<tbody>${body}</tbody></table>${sourcesFooter(rows)}`
    );
  }

  // Parses the escaped markup of renderFieldTable into nodes, so the page never assigns a string to innerHTML.
  function mountFieldTable(container, rows, options) {
    const parsed = new DOMParser().parseFromString(renderFieldTable(rows, options), "text/html");
    container.replaceChildren(...parsed.body.childNodes);
  }

  // columns: [{ label, kind? ("money" or "text") }], rows: arrays of values in column order.
  // Money columns are right-aligned tabular figures; absent values show a dash. An "action" column
  // takes { label, onClick } and shows a button. Built with DOM calls only.
  function mountResultsTable(container, columns, rows) {
    const table = document.createElement("table");
    table.className = "results-table";
    const headRow = table.createTHead().insertRow();
    for (const column of columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column.label;
      if (column.kind === "money") th.className = "money-column";
      headRow.appendChild(th);
    }
    const body = table.createTBody();
    for (const values of rows) {
      const tr = body.insertRow();
      columns.forEach((column, index) => {
        const td = tr.insertCell();
        td.setAttribute("data-label", column.label);
        if (column.kind === "action") {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "secondary-button";
          button.textContent = values[index].label;
          button.addEventListener("click", values[index].onClick);
          td.appendChild(button);
          return;
        }
        td.textContent = formatValue(values[index], column.kind === "money" ? "money" : "text");
        if (column.kind === "money") td.className = "money-column";
      });
    }
    container.replaceChildren(table);
  }

  window.HmrcFieldTable = {
    SOURCES,
    VAT_RETURN_BOXES,
    ALLOWANCE_FIELDS,
    SELF_EMPLOYMENT_SUMMARY_FIELDS,
    UK_PROPERTY_SUMMARY_FIELDS,
    FOREIGN_PROPERTY_SUMMARY_FIELDS,
    TAX_CALCULATION_FIELDS,
    escapeHtml,
    formatIsoDate,
    formatMoney,
    allowanceRows,
    taxCalculationRows,
    selfEmploymentSummaryRows,
    ukPropertySummaryRows,
    foreignPropertySummaryRows,
    sourceLink,
    renderFieldTable,
    mountFieldTable,
    mountFieldKey,
    mountResultsTable,
  };
})();
