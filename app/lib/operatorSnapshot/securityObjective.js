// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/securityObjective.js
//
// The security objective's observations for the operator snapshot.

import { buildAthenaSavedQueryLink } from "../consoleLinks.js";

export const securityObjective = {
  id: "security",
  name: "Security",
  observations: [
    // security_hub_findings and guardduty_findings write one row per active finding each
    // day, plus a zero_findings heartbeat row with no finding_id on a day with none; the
    // finding_id test gives that heartbeat a zero, so a quiet day is a day with a count of zero,
    // not one. Each day's rows are a nightly reading of what is open, so the figure is the
    // newest day's total.
    {
      id: "security-hub-open-findings",
      label: "Security Hub open findings",
      unit: "count",
      view: "security_hub_findings",
      dayColumn: "dt",
      valueExpr: "CASE WHEN finding_id IS NOT NULL THEN 1 ELSE 0 END",
      aggregation: "latest-total",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "security-hub-critical-findings",
      label: "Security Hub critical findings",
      unit: "count",
      view: "security_hub_findings",
      dayColumn: "dt",
      valueExpr: "CASE WHEN finding_id IS NOT NULL AND severity_label = 'CRITICAL' THEN 1 ELSE 0 END",
      aggregation: "latest-total",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "guardduty-open-findings",
      label: "GuardDuty open findings",
      unit: "count",
      view: "guardduty_findings",
      dayColumn: "dt",
      valueExpr: "CASE WHEN finding_id IS NOT NULL THEN 1 ELSE 0 END",
      aggregation: "latest-total",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "github-open-alerts",
      label: "GitHub open alerts",
      unit: "count",
      view: "github_alerts",
      dayColumn: "dt",
      valueExpr: "count",
      aggregation: "latest-total",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
  ],
};
