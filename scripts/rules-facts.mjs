// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The rules that look_up_rule answers beyond the rates page and the MTD calendar: each fact a
// tax-sources file cites that neither builder shows, with its value in the words of its source.
// Each id is the source file's fact id; build-rules-data.mjs adds these to the rules data.

export const SOURCED_RULE_FACTS = [
  {
    id: "ch-officer-changes-14-days",
    title: "Companies House: changes to directors",
    value: "Tell Companies House within 14 days of a change to a company's directors or their details, such as an address.",
  },
  {
    id: "ch-psc-changes-14-days",
    title: "Companies House: changes to people with significant control",
    value: "Tell Companies House within 14 days of a change to a company's people with significant control.",
  },
  {
    id: "ct-accounting-period-12-months",
    title: "Corporation Tax: the longest accounting period",
    value:
      "An accounting period for Corporation Tax is at most 12 months, so accounts that cover a longer period need two Company Tax Returns.",
  },
  {
    id: "itsa-digital-records",
    title: "Making Tax Digital for Income Tax: digital records",
    value: "Under Making Tax Digital for Income Tax, your software creates your digital records.",
  },
  {
    id: "itsa-qualifying-income",
    title: "Making Tax Digital for Income Tax: qualifying income",
    value:
      "Qualifying income for Making Tax Digital for Income Tax is the amount before expenses (turnover), from the tax return for the previous tax year.",
  },
  {
    id: "sa-balancing-payment",
    title: "Self Assessment: the balancing payment",
    value: "The Self Assessment balancing payment is due by midnight on 31 January after the end of the tax year.",
  },
  {
    id: "sa-payments-on-account",
    title: "Self Assessment: payments on account",
    value: "Self Assessment payments on account are due by midnight on 31 January and 31 July.",
  },
  {
    id: "vat-payment-same-deadline",
    title: "VAT: the payment deadline",
    value: "A VAT payment must reach HMRC by the same deadline as the return, even when the deadline falls on a weekend or a bank holiday.",
  },
  {
    id: "vat-penalty-200",
    title: "VAT: the late submission penalty",
    value:
      "At the penalty points threshold, a late VAT return brings a £200 penalty, and each later late return while at the threshold another £200.",
  },
  {
    id: "vat-penalty-points-removal",
    title: "VAT: removing penalty points at the threshold",
    value:
      "Penalty points are removed once every return in a period of compliance is on time and every outstanding return for the previous 24 months is submitted.",
  },
  {
    id: "vat-penalty-points-expire",
    title: "VAT: when a penalty point expires",
    value:
      "A penalty point expires on the last day of the month 24 months after the month of the return's deadline, or 25 months after it when the deadline is the last day of a month.",
  },
  {
    id: "vat-penalty-points-thresholds",
    title: "VAT: penalty points thresholds",
    value: "The penalty points threshold is 2 points for annual returns, 4 for quarterly returns and 5 for monthly returns.",
  },
  {
    id: "vat-return-due-date",
    title: "VAT: the return deadline",
    value: "A VAT return is usually due online one calendar month and 7 days after the end of the accounting period.",
  },
  {
    id: "ct-s455-rate-2022-04",
    kind: "rate",
    title: "Corporation Tax: section 455 tax on a loan to a participator",
    period: "loans made from 6 April 2022 to 5 April 2026",
    value: 0.3375,
    display: "33.75%",
  },
  {
    id: "ct-s455-rate-2026-04",
    kind: "rate",
    title: "Corporation Tax: section 455 tax on a loan to a participator",
    period: "loans made from 6 April 2026",
    value: 0.3575,
    display: "35.75%",
  },
];
