// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ct600Xml.js
// The CT600 (2026) Version 3 return as HMRC's IRenvelope XML (RIM artefacts V1.994, namespace
// http://www.govtalk.gov.uk/taxation/CT/5), with the accounts and computations iXBRL attached,
// for a small trading company filed from a diya-gl Company book. deriveCt600Boxes works the boxes
// from the book's calculated results and refuses a book that needs a box diya-gl has no cell for;
// buildCt600IrEnvelope writes them in the schema's element order.

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { apportionCorporationTax, financialYearsInPeriod } from "@diy-accounting-uk/diya-gl/dist/app/lib/tax/corporation-tax.js";
import { escapeXmlText } from "../lib/xmlDom.js";
import { computationLinesFromResults } from "./ctComputationsIxbrl.js";

// eslint-disable-next-line sonarjs/no-clear-text-protocols -- XML namespace, compared byte for byte, not fetched
export const CT600_NAMESPACE = "http://www.govtalk.gov.uk/taxation/CT/5";
export const CT600_RIM_ARTEFACT_VERSION = "V1.994";

const EARLIEST_PERIOD_START = "2015-04-01";
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const WORKING_SHEET_TOLERANCE_POUNDS = 5;

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
  300: "/IRenvelope/CompanyTaxReturn/CompanyTaxCalculation/ChargesAndReliefs/ProfitsBeforeDonationsAndGroupRelief",
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
  690: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/AIACapitalAllowancesInc",
  705: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantMainPool/CapitalAllowances",
  710: "/IRenvelope/CompanyTaxReturn/AllowancesAndCharges/MachineryAndPlantMainPool/BalancingCharges",
  975: "/IRenvelope/CompanyTaxReturn/Declaration/Name",
  985: "/IRenvelope/CompanyTaxReturn/Declaration/Status",
};

export class Ct600RefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = "Ct600RefusedError";
  }
}

function isoFromSerial(serial) {
  return new Date(EXCEL_EPOCH_MS + serial * DAY_MS).toISOString().slice(0, 10);
}

function utcDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function lastDayOfTwelveMonths(isoStart) {
  const date = utcDate(isoStart);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function toPence(pounds) {
  return Math.round(pounds * 100);
}

function fromPence(pence) {
  return pence / 100;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length < 2) throw new Error(`${label} is required (at least 2 characters)`);
  return value.trim();
}

/**
 * Work the CT600 boxes for a small trading company from a Company book's calculated results and
 * the facts typed on the page. The tax rows follow HMRC's rules from box 315: 9198 splits the
 * profit between financial years by days, 9204 and 9213 charge each share at its rate to the
 * penny, and the marginal relief is diya-gl's own calculation on the boxed profit. The working
 * sheet's own trading profit and tax must agree with the result to within a few pounds.
 *
 * @param {object} input
 * @param {object} input.results - diya-gl calculatedResultsFor output for a Company book
 * @param {object} input.company
 * @param {string} input.company.companyName - box 1
 * @param {string} input.company.companyNumber - box 2
 * @param {string} input.company.utr - box 3
 * @param {number} input.company.companyType - box 4; 0, none of the listed types, is the only one this builder files
 * @param {string} input.company.declarantName - box 975
 * @param {string} input.company.declarantStatus - box 985, e.g. "Director"
 * @param {number} [input.company.taxAlreadyPaid] - box 595, pounds and pence paid before filing
 * @returns {{boxes: Record<number, string|number>, computationLines: object, periodStart: string, periodEnd: string}}
 */
export function deriveCt600Boxes({ results, company }) {
  const ct600 = results.CT600;
  const workingSheet = results.CorporationTax;
  const admin = results.Admin;
  if (!ct600 || !workingSheet || !admin) {
    throw new Ct600RefusedError("The book carries no CT600 sheet; only a Company (ltd) book files a Company Tax Return");
  }
  if (company.companyType !== 0) {
    throw new Ct600RefusedError(`Company type ${company.companyType} is not filed here; only type 0 (none of the listed types) is`);
  }
  if (!/^\d{10}$/.test(company.utr || "")) throw new Error("The UTR must be 10 digits");
  if (!/^[A-Z0-9]{2,8}$/.test(company.companyNumber || ""))
    throw new Error("The company registration number must be 2 to 8 capital letters or digits");

  const periodStart = isoFromSerial(ct600.B33);
  const periodEnd = isoFromSerial(ct600.M33);
  if (periodStart < EARLIEST_PERIOD_START) {
    throw new Ct600RefusedError(
      `The return period starts ${periodStart}; CT600 Version 3 covers periods starting on or after ${EARLIEST_PERIOD_START}`,
    );
  }
  if (periodEnd > lastDayOfTwelveMonths(periodStart)) {
    throw new Ct600RefusedError(
      `The return period ${periodStart} to ${periodEnd} is longer than 12 months; a long period of account files two returns`,
    );
  }
  if (workingSheet.K22 < 0) {
    throw new Ct600RefusedError("The book makes a trading loss; the loss boxes (780 onward) have no diya-gl cell yet");
  }
  if (workingSheet.K24 < 0) {
    throw new Ct600RefusedError("The book has net non-trading loan relationship debits; those boxes have no diya-gl cell yet");
  }
  if ((ct600.AK66 ?? 0) < 0) throw new Ct600RefusedError("The book's turnover is negative");

  const computationLines = computationLinesFromResults(results);
  const boxes = {
    1: requireText(company.companyName, "The company name"),
    2: company.companyNumber,
    3: company.utr,
    4: 0,
    30: periodStart,
    35: periodEnd,
    145: Math.round(ct600.AK66 ?? 0),
    975: requireText(company.declarantName, "The declarant's name"),
    985: requireText(company.declarantStatus, "The declarant's status"),
  };

  const tradingProfit = Math.max(computationLines.adjustedProfit, 0);
  if (Math.abs(tradingProfit - workingSheet.K22) > WORKING_SHEET_TOLERANCE_POUNDS) {
    throw new Ct600RefusedError(
      `The computation's adjusted trading profit ${tradingProfit} disagrees with the working sheet's ${Math.round(workingSheet.K22)}`,
    );
  }
  const lossesBroughtForward = Math.round(ct600.Z72 ?? 0);
  if (tradingProfit > 0) {
    boxes[155] = tradingProfit;
    if (lossesBroughtForward > 0) boxes[160] = Math.min(lossesBroughtForward, tradingProfit);
    boxes[165] = tradingProfit - (boxes[160] ?? 0);
  }
  const bankInterest = computationLines.nonTradingLoanRelationshipCredits;
  if (bankInterest > 0) boxes[170] = bankInterest;
  const profitsBeforeOtherDeductions = (boxes[165] ?? 0) + (boxes[170] ?? 0);
  if (profitsBeforeOtherDeductions > 0) {
    boxes[235] = profitsBeforeOtherDeductions;
    boxes[300] = profitsBeforeOtherDeductions;
  }
  const chargeableProfits = profitsBeforeOtherDeductions;
  boxes[315] = chargeableProfits;

  const { years, totalDays } = financialYearsInPeriod(utcDate(periodStart), utcDate(periodEnd));
  const straddles = years[1].days > 0;
  const associatedCompanies = admin.P14 ?? 0;
  const frankedInvestmentIncome = Math.round(workingSheet.K29 ?? 0);
  if (frankedInvestmentIncome > 0) boxes[620] = frankedInvestmentIncome;

  let corporationTaxPence = 0;
  let marginalReliefPence = 0;
  if (chargeableProfits > 0) {
    const perYear = [6, 7].map((row) => ({
      smallProfitsRatePercent: admin[`P${row}`],
      mainRatePercent: admin[`R${row}`],
      marginalReliefFraction: admin[`S${row}`],
      lowerLimit: admin[`T${row}`],
      upperLimit: admin[`U${row}`],
    }));
    const charge = apportionCorporationTax(chargeableProfits, years, totalDays, { perYear, associatedCompanies, frankedInvestmentIncome });
    const firstShare = straddles ? Math.round((chargeableProfits * years[0].days) / totalDays) : chargeableProfits;
    const shares = [firstShare, chargeableProfits - firstShare];
    const yearBoxes = [
      [330, 335, 340, 345],
      [380, 385, 390, 395],
    ];
    years.forEach((year, index) => {
      if (index === 1 && !straddles) return;
      const [yearBox, profitBox, rateBox, taxBox] = yearBoxes[index];
      const ratePercent = charge.rows[index].ratePercent;
      boxes[yearBox] = year.year;
      boxes[profitBox] = shares[index];
      boxes[rateBox] = ratePercent;
      const taxPence = shares[index] * ratePercent;
      boxes[taxBox] = fromPence(taxPence);
      corporationTaxPence += taxPence;
    });
    marginalReliefPence = toPence(charge.marginalRelief);
    const claimsSmallProfitsRateOrRelief =
      marginalReliefPence > 0 ||
      charge.rows.some(
        (row, index) =>
          row.days > 0 &&
          perYear[index].smallProfitsRatePercent < perYear[index].mainRatePercent &&
          row.ratePercent === perYear[index].smallProfitsRatePercent,
      );
    if (straddles) {
      boxes[327] = associatedCompanies;
      boxes[328] = associatedCompanies;
    } else {
      boxes[326] = associatedCompanies;
    }
    if (claimsSmallProfitsRateOrRelief) boxes[329] = "yes";
    boxes[430] = fromPence(corporationTaxPence);
    if (marginalReliefPence > 0) boxes[435] = fromPence(marginalReliefPence);
  }
  const netCorporationTaxPence = corporationTaxPence - marginalReliefPence;
  if (Math.abs(fromPence(netCorporationTaxPence) - (workingSheet.K35 ?? 0)) > WORKING_SHEET_TOLERANCE_POUNDS) {
    throw new Ct600RefusedError(
      `The return's Corporation Tax ${fromPence(netCorporationTaxPence).toFixed(2)} disagrees with the working sheet's ${(workingSheet.K35 ?? 0).toFixed(2)}`,
    );
  }
  boxes[440] = fromPence(netCorporationTaxPence);
  boxes[475] = boxes[440];
  boxes[510] = boxes[440];
  const incomeTaxDeductedPence = workingSheet.K37 > 0 ? toPence(workingSheet.K37) : 0;
  if (incomeTaxDeductedPence > 0) boxes[515] = fromPence(incomeTaxDeductedPence);
  const taxPayablePence = Math.max(netCorporationTaxPence - incomeTaxDeductedPence, 0);
  boxes[525] = fromPence(taxPayablePence);
  boxes[528] = boxes[525];

  const alreadyPaidPence = company.taxAlreadyPaid ? toPence(company.taxAlreadyPaid) : 0;
  if (alreadyPaidPence < 0) throw new Error("The tax already paid cannot be negative");
  if (alreadyPaidPence > taxPayablePence) {
    throw new Ct600RefusedError(
      "More tax was paid than the return charges; the repayment boxes (bank details, 920 onward) are not filed here",
    );
  }
  if (alreadyPaidPence > 0) boxes[595] = fromPence(alreadyPaidPence);
  boxes[600] = fromPence(taxPayablePence - alreadyPaidPence);

  const allowances = workingSheet;
  const annualInvestmentAllowance = Math.round(allowances.I15 ?? 0);
  const mainPoolAllowances = Math.round((allowances.I16 ?? 0) + (allowances.I17 ?? 0) + Math.max(allowances.I18 ?? 0, 0));
  const balancingCharges = Math.round(Math.max(-(allowances.I18 ?? 0), 0));
  if (annualInvestmentAllowance > 0) boxes[690] = annualInvestmentAllowance;
  if (mainPoolAllowances > 0) boxes[705] = mainPoolAllowances;
  if (balancingCharges > 0) boxes[710] = balancingCharges;

  return { boxes, computationLines, periodStart, periodEnd };
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
 * @param {Record<number, string|number>} input.boxes - deriveCt600Boxes output
 * @param {string} input.accountsIxbrl - the full FRS 102 accounts document
 * @param {string} input.computationsIxbrl - from ctComputationsIxbrl.js
 * @returns {string}
 */
export function buildCt600IrEnvelope({ boxes, accountsIxbrl, computationsIxbrl }) {
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
  const companyTaxCalculation = `<CompanyTaxCalculation>${income}${moneyElement("ProfitsBeforeOtherDeductions", b[235])}${wrap("ChargesAndReliefs", moneyElement("ProfitsBeforeDonationsAndGroupRelief", b[300]))}${moneyElement("ChargeableProfits", b[315])}${chargeable}${moneyElement("CorporationTax", b[430])}${moneyElement("MarginalReliefForRingFenceTrades", b[435])}${moneyElement("NetCorporationTaxChargeable", b[440])}</CompanyTaxCalculation>`;
  const calculationOfTax = `<CalculationOfTaxOutstandingOrOverpaid>${moneyElement("NetCorporationTaxLiability", b[475])}${moneyElement("TaxChargeable", b[510])}${wrap("IncomeTax", moneyElement("DeductedIncomeTax", b[515]))}${moneyElement("TaxPayable", b[525])}${moneyElement("TaxPayableIncludingRestitutionTax", b[528])}</CalculationOfTaxOutstandingOrOverpaid>`;
  const reconciliation = wrap(
    "TaxReconciliation",
    moneyElement("TaxAlreadyPaid", b[595]) + wrap("TaxOutstandingOrOverpaid", moneyElement("TaxOutstanding", b[600])),
  );
  const indicators = wrap("IndicatorsAndInformation", moneyElement("FrankedInvestmentIncome", b[620]));
  const allowances = wrap(
    "AllowancesAndCharges",
    moneyElement("AIACapitalAllowancesInc", b[690]) +
      wrap("MachineryAndPlantMainPool", moneyElement("BalancingCharges", b[710]) + moneyElement("CapitalAllowances", b[705])),
  );

  return `<IRenvelope xmlns="${CT600_NAMESPACE}"><IRheader><Keys><Key Type="UTR">${b[3]}</Key></Keys><PeriodEnd>${b[35]}</PeriodEnd><DefaultCurrency>GBP</DefaultCurrency><IRmark Type="generic"></IRmark><Sender>Company</Sender></IRheader><CompanyTaxReturn ReturnType="new"><CompanyInformation><CompanyName>${escapeXmlText(b[1])}</CompanyName><RegistrationNumber>${b[2]}</RegistrationNumber><Reference>${b[3]}</Reference><CompanyType>${b[4]}</CompanyType><PeriodCovered><From>${b[30]}</From><To>${b[35]}</To></PeriodCovered></CompanyInformation><ReturnInfoSummary><Accounts><ThisPeriodAccounts>yes</ThisPeriodAccounts></Accounts><Computations><ThisPeriodComputations>yes</ThisPeriodComputations></Computations></ReturnInfoSummary><Turnover>${moneyElement("Total", b[145])}</Turnover>${companyTaxCalculation}${calculationOfTax}${reconciliation}${indicators}${allowances}<Declaration><AcceptDeclaration>yes</AcceptDeclaration><Name>${escapeXmlText(b[975])}</Name><Status>${escapeXmlText(b[985])}</Status></Declaration><AttachedFiles><XBRLsubmission><Computation><Instance><EncodedInlineXBRLDocument Filename="computations.html">${encoded(computationsIxbrl)}</EncodedInlineXBRLDocument></Instance></Computation><Accounts><Instance><EncodedInlineXBRLDocument Filename="accounts.html">${encoded(accountsIxbrl)}</EncodedInlineXBRLDocument></Instance></Accounts></XBRLsubmission></AttachedFiles></CompanyTaxReturn></IRenvelope>`;
}

/**
 * derive_company_tax_return: the CT600 boxes and computation lines for the session's loaded
 * Company book.
 * @param {object} session - carries book and lines
 * @param {object} company - the typed facts deriveCt600Boxes takes
 */
export async function deriveCompanyTaxReturn(session, company) {
  if (!session.book || !session.lines) throw new Error("No book is loaded. Call open_book first.");
  const taxData = await loadTaxDataForBook(session.book);
  const results = calculatedResultsFor(session.book, session.lines, taxData);
  return deriveCt600Boxes({ results, company });
}
