// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/retentionObjective.js
//
// The retention objective's observations for the operator snapshot. The totals come first, each a
// reading on the latest day, then the events of a day added over the window, so each event count
// has its total beside it.

import { buildAthenaSavedQueryLink } from "../consoleLinks.js";
import { CUSTOMER_ROWS, nonCustomerObservations } from "./actorClassObservations.js";

const athenaLink = (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName);

// A rolling count of customer submitters on the latest day, from v_returning_submitters_rolling_daily.
const rollingSubmitters = (id, label, valueExpr, description) => ({
  id,
  label,
  description,
  unit: "count",
  view: "v_returning_submitters_rolling_daily",
  dayColumn: "day",
  valueExpr,
  aggregation: "latest",
  deepLink: athenaLink,
});

// A figure of v_account_lifecycle_daily for customer accounts.
const lifecycle = (id, label, valueExpr, aggregation, description, extra = {}) => ({
  id,
  label,
  description,
  unit: "count",
  view: "v_account_lifecycle_daily",
  dayColumn: "day",
  valueExpr,
  aggregation,
  where: CUSTOMER_ROWS,
  deepLink: athenaLink,
  ...extra,
});

const accountsTotal = lifecycle(
  "retention-accounts-total",
  "Accounts in total",
  "accounts_total",
  "latest-total",
  "Customer accounts with a record on or before the latest day. An account opened before the lake began counts from its first record.",
);

const newAccounts = {
  id: "retention-new-accounts",
  label: "New accounts",
  description: "Accounts opened, added over the days. An account opens with its first bundle grant.",
  unit: "count",
  view: "v_signup_to_first_submission",
  dayColumn: "signup_day",
  valueExpr: "new_accounts",
  aggregation: "sum",
  where: CUSTOMER_ROWS,
  deepLink: athenaLink,
};

const renewals = {
  id: "subscription-renewals",
  label: "Subscription renewals",
  unit: "count",
  view: "v_subscription_renewals_daily",
  dayColumn: "day",
  valueExpr: "renewals",
  aggregation: "sum",
  where: CUSTOMER_ROWS,
  deepLink: athenaLink,
};

const cancellations = {
  id: "subscription-cancellations",
  label: "Subscription cancellations",
  unit: "count",
  view: "v_subscription_cancellations_daily",
  dayColumn: "day",
  valueExpr: "cancellations",
  aggregation: "sum",
  where: CUSTOMER_ROWS,
  deepLink: athenaLink,
};

export const retentionObjective = {
  id: "retention",
  name: "Retention",
  observations: [
    accountsTotal,
    ...nonCustomerObservations(accountsTotal),
    {
      id: "retention-active-customers-90d",
      label: "Active customers, 90 days to the latest day",
      description: "Distinct signed-in customers who made a call in the 90 days to the latest day, all app clients together.",
      unit: "count",
      view: "v_active_customers_7d_daily",
      dayColumn: "day",
      valueExpr: "active_users_90d",
      aggregation: "latest",
      where: "app_client = 'all'",
      deepLink: athenaLink,
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
      deepLink: athenaLink,
    },
    rollingSubmitters(
      "submitters-90d",
      "Submitters, 90 days to the latest day",
      "submitters_90d",
      "Distinct customers with a VAT submission in the 90 days to the latest day.",
    ),
    rollingSubmitters(
      "retention-submitters-7d",
      "Submitters, 7 days to the latest day",
      "submitters_7d",
      "Distinct customers with a VAT submission in the 7 days to the latest day.",
    ),
    rollingSubmitters(
      "retention-submitters-due-90d",
      "Submitters due, 90 days to the latest day",
      "due_submitters_90d",
      "Customers who submitted in the 90 days before the window. A quarterly VAT filer is due to submit again in the window.",
    ),
    rollingSubmitters(
      "returning-submitters",
      "Returning submitters, 90 days to the latest day",
      "returning_submitters_90d",
      "Of the submitters due, the customers who submitted in the window too.",
    ),
    {
      id: "retention-returning-share-of-due",
      label: "Returning submitters, share of those due",
      description: "Returning submitters over submitters due, on the latest day: the share of last quarter's submitters who came back.",
      unit: "ratio",
      view: "v_returning_submitters_rolling_daily",
      dayColumn: "day",
      valueExpr: "cast(returning_submitters_90d AS double) / nullif(due_submitters_90d, 0)",
      aggregation: "latest",
      deepLink: athenaLink,
    },
    rollingSubmitters(
      "retention-dormant-submitters-90d",
      "Dormant submitters, 90 days to the latest day",
      "dormant_submitters_90d",
      "Of the submitters due, the customers who did not submit in the window.",
    ),
    rollingSubmitters(
      "retention-new-submitters-90d",
      "New submitters, 90 days to the latest day",
      "new_submitters_90d",
      "Customers whose first VAT submission is in the 90 days to the latest day.",
    ),
    rollingSubmitters(
      "retention-resurrected-submitters-90d",
      "Resurrected submitters, 90 days to the latest day",
      "resurrected_submitters_90d",
      "Customers who submitted in the window and before the 90 days before it, but not in those 90 days.",
    ),
    {
      id: "retention-submitter-quick-ratio",
      label: "Submitter quick ratio, 90 days",
      description:
        "New and resurrected submitters over dormant submitters, on the latest day. Above 1 the submitters grow; below 1 they shrink. No figure while no submitter is dormant.",
      unit: "number",
      view: "v_returning_submitters_rolling_daily",
      dayColumn: "day",
      valueExpr: "cast(new_submitters_90d + resurrected_submitters_90d AS double) / nullif(dormant_submitters_90d, 0)",
      aggregation: "latest",
      deepLink: athenaLink,
    },
    lifecycle(
      "retention-active-subscriptions",
      "Active subscriptions",
      "active_subscriptions",
      "latest-total",
      "Customer subscriptions active at the end of the latest day. One set to cancel at the period end stays active until it ends.",
    ),
    lifecycle(
      "retention-subscription-churn-30d",
      "Subscription churn, 30 days",
      "cast(subscriptions_ended_30d AS double) / nullif(active_subscriptions_30d_before, 0)",
      "latest",
      "Customer subscriptions that ended in the 30 days to the latest day, over those active 30 days before it.",
      { unit: "ratio" },
    ),
    lifecycle(
      "retention-active-passes",
      "Active passes",
      "active_passes",
      "latest-total",
      "Passes issued by customers that are open to redeem at the end of the latest day: not deleted, revoked, expired or used up.",
    ),
    newAccounts,
    ...nonCustomerObservations(newAccounts),
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
      where: CUSTOMER_ROWS,
      deepLink: athenaLink,
    },
    lifecycle(
      "retention-first-submissions",
      "First submissions",
      "first_submissions",
      "sum",
      "Customers who made their first VAT submission, added over the days.",
    ),
    lifecycle(
      "retention-days-first-to-second-submission",
      "Days from first to second submission",
      "days_first_to_second",
      "ratio",
      "The average number of days from a customer's first VAT submission to the second, over the second submissions made in the window. A quarterly filer reads about 90.",
      { unit: "days", denominatorExpr: "second_submissions" },
    ),
    lifecycle(
      "retention-subscriptions-started",
      "Subscriptions started",
      "subscriptions_started",
      "sum",
      "Customer subscriptions that became active, added over the days.",
    ),
    renewals,
    ...nonCustomerObservations(renewals),
    cancellations,
    ...nonCustomerObservations(cancellations),
    lifecycle(
      "retention-subscriptions-ended",
      "Subscriptions ended",
      "subscriptions_ended",
      "sum",
      "Customer subscriptions that stopped being active, added over the days. A cancellation at the period end ends when the period does.",
    ),
    lifecycle(
      "retention-subscriptions-net-change",
      "Net change in subscriptions",
      "subscriptions_net_change",
      "sum",
      "Subscriptions started less subscriptions ended, added over the days.",
    ),
    {
      id: "retention-passes-issued",
      label: "Passes issued",
      unit: "count",
      view: "v_pass_redemptions_daily",
      dayColumn: "day",
      valueExpr: "passes_issued",
      aggregation: "sum",
      deepLink: athenaLink,
    },
    {
      id: "retention-passes-redeemed",
      label: "Passes redeemed",
      description: "Redemptions of passes that customers issued, added over the days.",
      unit: "count",
      view: "v_pass_redemptions_daily",
      dayColumn: "day",
      valueExpr: "passes_redeemed",
      aggregation: "sum",
      deepLink: athenaLink,
    },
  ],
};
