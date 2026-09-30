// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { calculateExpectedTax } from "../diya-gl/tax/income-tax.js";
import { calculateCapitalAllowances } from "../diya-gl/tax/capital-allowances.js";
import { calculateMileageAllowance } from "../diya-gl/tax/mileage.js";
import {
  apportionCorporationTax,
  financialYearsInPeriod,
  financialYearRatesFor,
  financialYearNumber,
} from "../diya-gl/tax/corporation-tax.js";

const poundsWhole = (amount) => `£${amount.toLocaleString("en-GB")}`;

export function twelveMonthPeriodStart(yearEnd) {
  const sameDayLastYear = yearEnd.getUTCMonth() === 1 && yearEnd.getUTCDate() === 29 ? 28 : yearEnd.getUTCDate();
  const lastYear = Date.UTC(yearEnd.getUTCFullYear() - 1, yearEnd.getUTCMonth(), sameDayLastYear);
  return new Date(lastYear + 24 * 60 * 60 * 1000);
}

export function vatPosition(inputs, vatTable) {
  const rate = vatTable.standard_rate;
  const overThreshold = !inputs.vatRegistered && inputs.income > vatTable.registration_threshold;
  if (!inputs.vatRegistered) {
    return { outputVat: 0, inputVat: 0, vatDue: 0, incomeForTax: inputs.income, expensesForTax: inputs.expenses, overThreshold };
  }
  if (inputs.vatScheme === "flat-rate") {
    const grossIncome = inputs.income * (1 + rate);
    const vatDue = (grossIncome * inputs.flatRatePercent) / 100;
    return {
      outputVat: 0,
      inputVat: 0,
      vatDue,
      incomeForTax: grossIncome - vatDue,
      expensesForTax: inputs.expenses * (1 + rate),
      overThreshold,
    };
  }
  const outputVat = inputs.income * rate;
  const inputVat = inputs.expenses * rate;
  return { outputVat, inputVat, vatDue: outputVat - inputVat, incomeForTax: inputs.income, expensesForTax: inputs.expenses, overThreshold };
}

export function cisDeducted(inputs, sourced) {
  if (!inputs.cis) return 0;
  const rateByStatus = { registered: sourced.cisRegisteredRate, unregistered: sourced.cisUnregisteredRate, gross: 0 };
  return inputs.cisLabour * rateByStatus[inputs.cisStatus];
}

export function capitalAllowancesFor(inputs, capitalAllowancesTable, writingDownKey) {
  return calculateCapitalAllowances(
    [
      { acquiredInYear: true, cost: inputs.equipment },
      { acquiredInYear: false, cost: 0, taxWrittenDownValue: inputs.poolBroughtForward },
    ],
    {
      investmentAllowancePercent: Math.round(capitalAllowancesTable.annual_investment_allowance * 100),
      writingDownPercent: Math.round(capitalAllowancesTable[writingDownKey] * 100),
    },
  );
}

function sharedFigures(inputs, tables, sourced, writingDownKey) {
  const vat = vatPosition(inputs, tables.vat);
  const mileageAllowance = calculateMileageAllowance(inputs.miles, tables.mileage);
  const capitalAllowances = capitalAllowancesFor(inputs, tables.capital_allowances, writingDownKey);
  const taxableProfit = vat.incomeForTax - vat.expensesForTax - mileageAllowance - capitalAllowances.total;
  const cisTaken = cisDeducted(inputs, sourced);

  const messages = [];
  if (vat.overThreshold) {
    messages.push(
      `Income is over the ${poundsWhole(tables.vat.registration_threshold)} VAT registration threshold. Tick "VAT registered" if you are registered.`,
    );
  }
  if (inputs.equipment > sourced.aiaLimit) {
    messages.push(
      `Equipment is over the ${poundsWhole(sourced.aiaLimit)} Annual Investment Allowance limit. The figures still claim it in full.`,
    );
  }
  if (inputs.cis && inputs.cisLabour > inputs.income) {
    messages.push("Labour paid under CIS is more than income.");
  }
  return { vat, mileageAllowance, capitalAllowances, taxableProfit, cisTaken, messages };
}

export function computeSelfEmployed(inputs, yearTables, sourced) {
  const { vat, mileageAllowance, capitalAllowances, taxableProfit, cisTaken, messages } = sharedFigures(
    inputs,
    yearTables,
    sourced,
    "writing_down_allowance",
  );
  const r = calculateExpectedTax(taxableProfit, {
    ...yearTables,
    income_tax: { ...yearTables.income_tax, personal_allowance: inputs.personalAllowance },
  });
  const taxAndNi = r.total_tax_and_ni;
  return {
    vat,
    mileageAllowance,
    capitalAllowances,
    taxableProfit,
    personalAllowance: r.personal_allowance,
    incomeTax: r.income_tax,
    class4: r.ni_class4_lower + r.ni_class4_upper,
    class2Voluntary: r.ni_class2,
    taxAndNi,
    cisDeducted: cisTaken,
    leftToPay: taxAndNi - cisTaken,
    profitAfterTax: taxableProfit - taxAndNi,
    messages,
  };
}

export function computeLimitedCompany(inputs, fyTablesByYear, sourced) {
  const periodEnd = new Date(`${inputs.yearEnd}T00:00:00Z`);
  const periodStart = twelveMonthPeriodStart(periodEnd);
  const fileFinancialYear = financialYearNumber(periodEnd);
  const tables = fyTablesByYear[fileFinancialYear];
  if (!tables) throw new Error(`No rates for financial year ${fileFinancialYear}`);

  const { vat, mileageAllowance, capitalAllowances, taxableProfit, cisTaken, messages } = sharedFigures(
    inputs,
    tables,
    sourced,
    "writing_down_allowance_main",
  );
  const { years, totalDays } = financialYearsInPeriod(periodStart, periodEnd);
  const perYear = years.map((fy) => financialYearRatesFor(tables, fy.year, fileFinancialYear, fy.days));
  const charge = apportionCorporationTax(taxableProfit, years, totalDays, {
    perYear,
    associatedCompanies: inputs.associatedCompanies,
    frankedInvestmentIncome: 0,
  });
  return {
    vat,
    mileageAllowance,
    capitalAllowances,
    taxableProfit,
    periodStart,
    periodEnd,
    rows: charge.rows,
    taxBeforeRelief: charge.taxBeforeRelief,
    marginalRelief: charge.marginalRelief,
    corporationTax: charge.tax,
    cisDeducted: cisTaken,
    profitAfterTax: taxableProfit - charge.tax,
    messages,
  };
}
