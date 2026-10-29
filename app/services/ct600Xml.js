// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ct600Xml.js
// The CT600 (2026) Version 3 return as HMRC's IRenvelope XML (RIM artefacts V1.994, namespace
// http://www.govtalk.gov.uk/taxation/CT/5), with the accounts and computations iXBRL attached,
// for a small trading company. ct600Figures.js works the boxes from the figures; deriveCompanyTaxReturn
// gives it a diya-gl Company book's figures; buildCt600IrEnvelope writes the boxes in the schema's
// element order.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parse as parseToml } from "@iarna/toml";
import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { financialYearNumber } from "@diy-accounting-uk/diya-gl/dist/app/lib/tax/corporation-tax.js";
import { escapeXmlText } from "../lib/xmlDom.js";
import { deriveSmallCompanyAccounts } from "./smallCompanyAccounts.js";
import { ct600FiguresFromResults, deriveCt600FromFigures } from "./ct600Figures.js";

// eslint-disable-next-line sonarjs/no-clear-text-protocols -- XML namespace, compared byte for byte, not fetched
export const CT600_NAMESPACE = "http://www.govtalk.gov.uk/taxation/CT/5";
export const CT600_RIM_ARTEFACT_VERSION = "V1.994";

// Where each box the builder fills sits in the return, as HMRC's CT-specDoc names it. The unit
// tests read every box back from the built XML by these paths and check them against diya-gl's
// ct600-v3.toml.
export const CT600_BOX_PATHS = {
  1: "/IRenvelope/CompanyTaxReturn/CompanyInformation/CompanyName",
  2: "/IRenvelope/CompanyTaxReturn/CompanyInformation/RegistrationNumber",
  3: "/IRenvelope/CompanyTaxReturn/CompanyInformation/Reference",
  4: "/IRenvelope/CompanyTaxReturn/CompanyInformation/CompanyType",
  30: "/IRenvelope/CompanyTaxReturn/CompanyInformation/PeriodCovered/From",
  35: "/IRenvelope/CompanyTaxReturn/CompanyInformation/PeriodCovered/To",
  145: "/IRenvelope/CompanyTaxReturn/Turnover/Total",
  155: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/Income/Trading/Profits",
  160: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/Income/Trading/LossesBroughtForward",
  165: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/Income/Trading/NetProfits",
  170: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/Income/NonTradingLoanProfitsAndGains",
  235: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/ProfitsBeforeOtherDeductions",
  275: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/DeductionsAndReliefs/TradingLosses",
  285: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/DeductionsAndReliefs/TradingLossesCarriedForward",
  295: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/DeductionsAndReliefs/Total",
  300: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/ChargesAndReliefs/ProfitsBeforeDonationsAndGroupRelief",
  305: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/ChargesAndReliefs/QualifyingDonations",
  315: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/ChargeableProfits",
  326: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/AssociatedCompanies/ThisPeriod",
  327: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/AssociatedCompanies/AssociatedCompaniesFinancialYears/FirstYear",
  328: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/AssociatedCompanies/AssociatedCompaniesFinancialYears/SecondYear",
  329: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/AssociatedCompanies/StartingOrSmallCompaniesRate",
  330: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Year",
  335: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Details/Profit",
  340: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Details/TaxRate",
  345: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Details/Tax",
  380: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Year",
  385: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Details/Profit",
  390: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Details/TaxRate",
  395: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Details/Tax",
  430: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/CorporationTax",
  435: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/MarginalReliefForRingFenceTrades",
  440: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/NetCorporationTaxChargeable",
  475: "/IRenvelope/CompanyTaxReturn/CalculationOfTaxOutstandingOrOverpaid/NetCorporationTaxLiability",
  510: "/IRenvelope/CompanyTaxReturn/CalculationOfTaxOutstandingOrOverpaid/TaxChargeable",
  515: "/IRenvelope/CompanyTaxReturn/CalculationOfTaxOutstandingOrOverpaid/IncomeTax/DeductedIncomeTax",
  525: "/IRenvelope/CompanyTaxReturn/CalculationOfTaxOutstandingOrOverpaid/TaxPayable",
  528: "/IRenvelope/CompanyTaxReturn/CalculationOfTaxOutstandingOrOverpaid/TaxPayableIncludingRestitutionTax",
  595: "/IRenvelope/CompanyTaxReturn/TaxReconciliation/TaxAlreadyPaid",
  600: "/IRenvelope/CompanyTaxReturn/TaxReconciliation/TaxOutstandingOrOverpaid/TaxOutstanding",
  620: "/IRenvelope/CompanyTaxReturn/IndicatorsAndInformation/FrankedInvestmentIncome",
  688: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/FullExpensing/CapitalAllowances",
  689: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/FullExpensing/BalancingCharges",
  690: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/AIACapitalAllowancesInc",
  693: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantSpecialRateAllowance/CapitalAllowances",
  694: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantSpecialRateAllowance/BalancingCharges",
  695: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantSpecialRatePool/CapitalAllowances",
  700: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantSpecialRatePool/BalancingCharges",
  705: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantMainPool/CapitalAllowances",
  710: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantMainPool/BalancingCharges",
  735: "/IRenvelope/CompanyTaxReturn/NotIncluded/AIACapitalAllowancesNotInc",
  760: "/IRenvelope/CompanyTaxReturn/QualifyingExpenditure/MachineryAndPlantExpenditure",
  773: "/IRenvelope/CompanyTaxReturn/QualifyingExpenditure/MachineryAndPlantSpecialRateAllowance",
  775: "/IRenvelope/CompanyTaxReturn/QualifyingExpenditure/OtherMachineryAndPlant",
  780: "/IRenvelope/CompanyTaxReturn/LossesDeficitsAndExcess/AmountArising/LossesOfTradesUK/Arising",
  790: "/IRenvelope/CompanyTaxReturn/LossesDeficitsAndExcess/AmountArising/LossesOfTradesOutsideUK",
  975: "/IRenvelope/CompanyTaxReturn/Declaration/Name",
  985: "/IRenvelope/CompanyTaxReturn/Declaration/Status",
};

/**
 * The parsed ltd-<FY>.toml files a return's period needs, keyed by financial year: the one named
 * for the financial year the period ends in, which also states the year before.
 * @param {string} periodEnd - ISO date
 * @returns {Record<number, object>}
 */
export function ltdTaxDataForPeriodEnd(periodEnd) {
  const financialYear = financialYearNumber(new Date(`${periodEnd}T00:00:00Z`));
  const packageFile = createRequire(import.meta.url).resolve("@diy-accounting-uk/diya-gl/package.json");
  const dataFile = join(dirname(packageFile), "dist", "app", "data", `ltd-${financialYear}.toml`);
  if (!existsSync(dataFile)) return {};
  return { [financialYear]: parseToml(readFileSync(dataFile, "utf8")) };
}

function money(value) {
  return Number(value).toFixed(2);
}

function element(name, value) {
  return value === undefined ? "" : `<${name}>${value}</${name}>`;
}

function moneyElement(name, value) {
  return value === undefined ? "" : `<${name}>${money(value)}</${name}>`;
}

function wrap(name, inner) {
  return inner ? `<${name}>${inner}</${name}>` : "";
}

function financialYearXml(name, year, profit, rate, tax) {
  if (year === undefined) return "";
  return `<${name}><Year>${year}</Year><Details><Profit>${money(profit)}</Profit><TaxRate>${money(rate)}</TaxRate><Tax>${money(tax)}</Tax></Details></${name}>`;
}

/**
 * Write the IRenvelope for the boxes, with the accounts and computations attached as base64
 * iXBRL and an empty IRmark for hmrcTransactionEngine.js to fill.
 *
 * @param {object} input
 * @param {Record<number, string|number>} input.boxes - deriveCt600FromFigures output
 * @param {string} input.accountsIxbrl - the full FRS 102 accounts document
 * @param {string} input.computationsIxbrl - from ctComputationsIxbrl.js
 * @param {boolean} [input.amended] - true for a return that replaces one already filed for the period
 * @returns {string}
 */
export function buildCt600IrEnvelope({ boxes, accountsIxbrl, computationsIxbrl, amended = false }) {
  if (!accountsIxbrl || !computationsIxbrl) throw new Error("Both the accounts and the computations iXBRL are attached to the return");
  const b = boxes;
  const encoded = (document) => Buffer.from(document, "utf8").toString("base64");

  const trading = wrap(
    "Trading",
    moneyElement("Profits", b[155]) + moneyElement("LossesBroughtForward", b[160]) + moneyElement("NetProfits", b[165]),
  );
  const income = `<Income>${trading}${moneyElement("NonTradingLoanProfitsAndGains", b[170])}</Income>`;
  const associatedCompanies = wrap(
    "AssociatedCompanies",
    element("ThisPeriod", b[326]) +
      (b[327] === undefined
        ? ""
        : `<AssociatedCompaniesFinancialYears><FirstYear>${b[327]}</FirstYear><SecondYear>${b[328]}</SecondYear></AssociatedCompaniesFinancialYears>`) +
      element("StartingOrSmallCompaniesRate", b[329]),
  );
  const chargeable =
    b[330] === undefined
      ? ""
      : `<CorporationTaxChargeable>${associatedCompanies}${financialYearXml("FinancialYearOne", b[330], b[335], b[340], b[345])}${financialYearXml("FinancialYearTwo", b[380], b[385], b[390], b[395])}</CorporationTaxChargeable>`;
  const deductionsAndReliefs = wrap(
    "DeductionsAndReliefs",
    moneyElement("TradingLosses", b[275]) + moneyElement("TradingLossesCarriedForward", b[285]) + moneyElement("Total", b[295]),
  );
  const chargesAndReliefs = wrap(
    "ChargesAndReliefs",
    moneyElement("ProfitsBeforeDonationsAndGroupRelief", b[300]) + moneyElement("QualifyingDonations", b[305]),
  );
  const companyTaxCalculation = `<CompanyTaxCalculation>${income}${moneyElement("ProfitsBeforeOtherDeductions", b[235])}${deductionsAndReliefs}${chargesAndReliefs}${moneyElement("ChargeableProfits", b[315])}${chargeable}${moneyElement("CorporationTax", b[430])}${moneyElement("MarginalReliefForRingFenceTrades", b[435])}${moneyElement("NetCorporationTaxChargeable", b[440])}</CompanyTaxCalculation>`;
  const calculationOfTax = `<CalculationOfTaxOutstandingOrOverpaid>${moneyElement("NetCorporationTaxLiability", b[475])}${moneyElement("TaxChargeable", b[510])}${wrap("IncomeTax", moneyElement("DeductedIncomeTax", b[515]))}${moneyElement("TaxPayable", b[525])}${moneyElement("TaxPayableIncludingRestitutionTax", b[528])}</CalculationOfTaxOutstandingOrOverpaid>`;
  const reconciliation = wrap(
    "TaxReconciliation",
    moneyElement("TaxAlreadyPaid", b[595]) + wrap("TaxOutstandingOrOverpaid", moneyElement("TaxOutstanding", b[600])),
  );
  const indicators = wrap("IndicatorsAndInformation", moneyElement("FrankedInvestmentIncome", b[620]));
  const pool = (name, charges, allowances) =>
    wrap(name, moneyElement("BalancingCharges", charges) + moneyElement("CapitalAllowances", allowances));
  const allowances = wrap(
    "AllowancesAndCharges",
    pool("FullExpensing", b[689], b[688]) +
      moneyElement("AIACapitalAllowancesInc", b[690]) +
      pool("MachineryAndPlantSpecialRateAllowance", b[694], b[693]) +
      pool("MachineryAndPlantSpecialRatePool", b[700], b[695]) +
      pool("MachineryAndPlantMainPool", b[710], b[705]),
  );
  const notIncluded = wrap("NotIncluded", moneyElement("AIACapitalAllowancesNotInc", b[735]));
  const qualifyingExpenditure = wrap(
    "QualifyingExpenditure",
    moneyElement("MachineryAndPlantExpenditure", b[760]) +
      moneyElement("MachineryAndPlantSpecialRateAllowance", b[773]) +
      moneyElement("OtherMachineryAndPlant", b[775]),
  );
  const losses = wrap(
    "LossesDeficitsAndExcess",
    wrap("AmountArising", wrap("LossesOfTradesUK", moneyElement("Arising", b[780])) + moneyElement("LossesOfTradesOutsideUK", b[790])),
  );

  return `<IRenvelope xmlns="${CT600_NAMESPACE}"><IRheader><Keys><Key Type="UTR">${b[3]}</Key></Keys><PeriodEnd>${b[35]}</PeriodEnd><DefaultCurrency>GBP</DefaultCurrency><IRmark Type="generic"></IRmark><Sender>Company</Sender></IRheader><CompanyTaxReturn ReturnType="${amended ? "amended" : "new"}"><CompanyInformation><CompanyName>${escapeXmlText(b[1])}</CompanyName><RegistrationNumber>${b[2]}</RegistrationNumber><Reference>${b[3]}</Reference><CompanyType>${b[4]}</CompanyType><PeriodCovered><From>${b[30]}</From><To>${b[35]}</To></PeriodCovered></CompanyInformation><ReturnInfoSummary><Accounts><ThisPeriodAccounts>yes</ThisPeriodAccounts></Accounts><Computations><ThisPeriodComputations>yes</ThisPeriodComputations></Computations></ReturnInfoSummary><Turnover>${moneyElement("Total", b[145])}</Turnover>${companyTaxCalculation}${calculationOfTax}${reconciliation}${indicators}${allowances}${notIncluded}${qualifyingExpenditure}${losses}<Declaration><AcceptDeclaration>yes</AcceptDeclaration><Name>${escapeXmlText(b[975])}</Name><Status>${escapeXmlText(b[985])}</Status></Declaration><AttachedFiles><XBRLsubmission><Computation><Instance><EncodedInlineXBRLDocument Filename="computations.html">${encoded(computationsIxbrl)}</EncodedInlineXBRLDocument></Instance></Computation><Accounts><Instance><EncodedInlineXBRLDocument Filename="accounts.html">${encoded(accountsIxbrl)}</EncodedInlineXBRLDocument></Instance></Accounts></XBRLsubmission></AttachedFiles></CompanyTaxReturn></IRenvelope>`;
}

/**
 * derive_company_tax_return: the figures, the CT600 boxes and the computation lines for the
 * session's loaded Company book.
 * @param {object} session - carries book and lines
 * @param {object} company - the typed facts a book does not hold
 * @param {string} company.companyName - box 1
 * @param {string} company.companyNumber - box 2
 * @param {string} company.utr - box 3
 * @param {number} company.companyType - box 4
 * @param {string} company.declarantName - box 975
 * @param {string} company.declarantStatus - box 985
 * @param {number} [company.taxAlreadyPaid] - box 595, pounds and pence paid before filing
 * @param {object} [options]
 * @param {object} [options.priorYearProfitAndLoss] - the prior year's profit and loss lines, when the company has them
 */
export async function deriveCompanyTaxReturn(session, company, options) {
  if (!session.book || !session.lines) throw new Error("No book is loaded. Call open_book first.");
  const accounts = await deriveSmallCompanyAccounts(session, options);
  const taxData = await loadTaxDataForBook(session.book);
  const results = calculatedResultsFor(session.book, session.lines, taxData);
  const figures = {
    ...ct600FiguresFromResults(results, accounts),
    companyName: company.companyName,
    companyNumber: company.companyNumber,
    utr: company.utr,
    companyType: company.companyType,
    declarantName: company.declarantName,
    declarantStatus: company.declarantStatus,
    taxAlreadyPaid: company.taxAlreadyPaid ?? 0,
  };
  return { ...deriveCt600FromFigures(figures, ltdTaxDataForPeriodEnd(figures.periodEnd)), figures };
}
