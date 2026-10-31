// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/retentionObjective.js
//
// The retention objective's observations for the operator snapshot.

import { buildCloudWatchDashboardLink, buildAthenaSavedQueryLink } from "../consoleLinks.js";

export const retentionObjective = {
  id: "retention",
  name: "Retention",
  observations: [
    {
      id: "submitters-90d",
      label: "Submitters, 90 days to the latest day",
      unit: "count",
      view: "v_returning_submitters_rolling_daily",
      dayColumn: "day",
      valueExpr: "submitters_90d",
      aggregation: "latest",
      deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
    },
    {
      id: "returning-submitters",
      label: "Returning submitters, 90 days to the latest day",
      unit: "count",
      view: "v_returning_submitters_rolling_daily",
      dayColumn: "day",
      valueExpr: "returning_submitters_90d",
      aggregation: "latest",
      deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
    },
    {
      id: "retention-active-customers-7d",
      label: "Active customers, per 7 days",
      description:
        "Distinct signed-in customers who made a call in the 7 days to each day, all app clients together, averaged over the days. The base the retained submitters come from.",
      unit: "count",
      view: "v_active_customers_7d_daily",
      dayColumn: "day",
      valueExpr: "active_users_7d",
      aggregation: "avg",
      where: "app_client = 'all'",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "retention-new-accounts",
      label: "New accounts",
      description: "Accounts opened, added over the days.",
      unit: "count",
      view: "v_signup_to_first_submission",
      dayColumn: "signup_day",
      valueExpr: "new_accounts",
      aggregation: "sum",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "retention-new-accounts-submitted-share",
      label: "New accounts that submitted, share",
      description:
        "The accounts opened in the window that have submitted, as a share of all the accounts opened in it. A recent account may not have submitted yet.",
      unit: "ratio",
      view: "v_signup_to_first_submission",
      dayColumn: "signup_day",
      valueExpr: "submitted",
      aggregation: "ratio",
      denominatorExpr: "new_accounts",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "retention-passes-issued",
      label: "Passes issued",
      unit: "count",
      view: "v_pass_redemptions_daily",
      dayColumn: "day",
      valueExpr: "passes_issued",
      aggregation: "sum",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "subscription-renewals",
      label: "Subscription renewals",
      unit: "count",
      view: "v_subscription_renewals_daily",
      dayColumn: "day",
      valueExpr: "renewals",
      aggregation: "sum",
      deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
    },
    {
      id: "subscription-cancellations",
      label: "Subscription cancellations",
      unit: "count",
      view: "v_subscription_cancellations_daily",
      dayColumn: "day",
      valueExpr: "cancellations",
      aggregation: "sum",
      deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
    },
  ],
};
