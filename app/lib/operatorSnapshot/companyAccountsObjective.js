// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/companyAccountsObjective.js
//
// The company-accounts objective's observations for the operator snapshot.

import { buildAthenaSavedQueryLink } from "../consoleLinks.js";

export const companyAccountsObjective = {
  // Not one of the page's eight objectives (OBJECTIVE_ORDER in dashboard.html): the company
  // accounts panel reads this objective's observations directly and renders its own block
  // above them, rather than the generic trend table renderObjective builds for the eight.
  // The company_accounts table (CompanyBookTables.java) carries no rows until the company's
  // book is named, so every query here returns SQL NULL rather than failing - "max" over zero
  // matching rows is a null aggregate, not an empty result set - and the panel reads that as
  // nothing to show yet.
  id: "company-accounts",
  name: "Company accounts",
  observations: [
    {
      id: "company-cash-at-bank",
      label: "Cash at bank",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "cashatbank",
      aggregation: "latest",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-turnover",
      label: "Turnover",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.profitandloss.turnover",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-costs",
      label: "Costs",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.profitandloss.costs",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-profit",
      label: "Profit",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.profitandloss.profit",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-fixed-assets",
      label: "Fixed assets",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.fixedassets",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-current-assets",
      label: "Current assets",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.currentassets",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-creditors-within-one-year",
      label: "Creditors: within one year",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.creditorswithinoneyear",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-creditors-after-one-year",
      label: "Creditors: after one year",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.creditorsafteroneyear",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-called-up-share-capital",
      label: "Called up share capital",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.calledupsharecapital",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-profit-and-loss-account",
      label: "Profit and loss account",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.profitandlossaccount",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-capital-and-reserves",
      label: "Capital and reserves",
      unit: "gbp",
      view: "company_accounts",
      dayColumn: "dt",
      valueExpr: "accounts.balancesheet.currentyear.capitalandreserves",
      aggregation: "max",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-contribution-gbp",
      label: "Contribution",
      description:
        "Revenue less the AWS bill in pounds less Ads cost (Google and Microsoft), added over the days. The AWS bill is in dollars and is converted at the European Central Bank rate of each day.",
      unit: "gbp",
      view: "v_contribution_daily",
      dayColumn: "day",
      valueExpr: "contribution_gbp",
      aggregation: "sum",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-net-monthly-burn-gbp",
      label: "Net monthly burn",
      description:
        "The period's costs less its turnover in the latest company book, spread over the months of the accounting period. Zero or below means the book made a profit.",
      unit: "gbp",
      view: "v_company_runway",
      dayColumn: "dt",
      valueExpr: "net_monthly_burn_gbp",
      aggregation: "latest",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "company-runway-months",
      label: "Runway",
      description:
        "Cash at bank less creditors due within one year, divided by the net monthly burn, in months. Not shown while the book makes a profit.",
      unit: "months",
      view: "v_company_runway",
      dayColumn: "dt",
      valueExpr: "runway_months",
      aggregation: "latest",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
  ],
};
