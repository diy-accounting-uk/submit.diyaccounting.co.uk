// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The fact ids the rates page shows: each row's fact slug joined to a column slug.

export const TAX_YEAR_COLUMNS = ["2025-26", "2026-27"];
export const FINANCIAL_YEAR_COLUMNS = ["fy2025", "fy2026"];

export const TAX_YEAR_FACT_SLUGS = [
  "income-tax-personal-allowance",
  "income-tax-personal-allowance-income-limit",
  "income-tax-basic-rate",
  "income-tax-basic-rate-band",
  "income-tax-higher-rate",
  "income-tax-additional-rate-threshold",
  "income-tax-additional-rate",
  "ni-class4-lower-profits-limit",
  "ni-class4-upper-profits-limit",
  "ni-class4-main-rate",
  "ni-class4-additional-rate",
  "ni-class2-weekly-rate",
  "ni-class2-small-profits-threshold",
  "capital-allowances-aia-limit",
  "capital-allowances-main-rate",
  "capital-allowances-special-rate",
  "mileage-car-first-10000",
  "mileage-car-over-10000",
  "mileage-car-band-miles",
  "cis-deduction-registered",
  "cis-deduction-unregistered",
  "cis-deduction-gross",
  "vat-registration-threshold",
  "vat-standard-rate",
  "vat-flat-rate-joining-limit",
  "vat-flat-rate-leaving-limit",
  "vat-flat-rate-limited-cost-trader",
];

export const FINANCIAL_YEAR_FACT_SLUGS = [
  "corporation-tax-main-rate",
  "corporation-tax-small-profits-rate",
  "corporation-tax-lower-limit",
  "corporation-tax-upper-limit",
  "corporation-tax-marginal-relief-fraction",
  "capital-allowances-full-expensing",
  "capital-allowances-company-aia-limit",
  "capital-allowances-company-main-rate",
  "capital-allowances-company-special-rate",
];

export const RATES_FACT_IDS = [
  ...TAX_YEAR_FACT_SLUGS.flatMap((slug) => TAX_YEAR_COLUMNS.map((column) => `${slug}-${column}`)),
  ...FINANCIAL_YEAR_FACT_SLUGS.flatMap((slug) => FINANCIAL_YEAR_COLUMNS.map((column) => `${slug}-${column}`)),
];
