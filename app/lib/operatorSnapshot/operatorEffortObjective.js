// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/operatorEffortObjective.js
//
// The operator-effort objective's observations for the operator snapshot.

import { buildAthenaSavedQueryLink } from "../consoleLinks.js";

export const operatorEffortObjective = {
  id: "operator-effort",
  name: "Operator effort",
  observations: [
    {
      id: "agent-cost-per-posted-run-usd",
      label: "Agent cost per run that posted",
      description: "The day's Claude on Bedrock cost divided by the agent runs that posted a result that day, averaged over the days.",
      unit: "usd",
      view: "v_agent_cost_daily",
      dayColumn: "day",
      valueExpr: "cost_per_posted_run_usd",
      aggregation: "avg",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "agent-cost-per-accepted-pr-usd",
      label: "Agent cost per accepted pull request",
      description: "The day's Claude on Bedrock cost divided by the agent pull requests a person merged that day, averaged over the days.",
      unit: "usd",
      view: "v_agent_cost_daily",
      dayColumn: "day",
      valueExpr: "cost_per_accepted_pr_usd",
      aggregation: "avg",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "operator-interventions-total",
      label: "Operator interventions, all kinds",
      unit: "count",
      view: "v_operator_interventions_daily",
      dayColumn: "day",
      valueExpr: "interventions",
      aggregation: "sum",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "operator-manual-dispatches",
      label: "Hand-dispatched workflow runs",
      unit: "count",
      view: "v_operator_interventions_daily",
      dayColumn: "day",
      valueExpr: "interventions",
      aggregation: "sum",
      where: "kind = 'manual-dispatch'",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: "operator-authored-commits",
      label: "Operator-authored commits",
      unit: "count",
      view: "v_operator_interventions_daily",
      dayColumn: "day",
      valueExpr: "interventions",
      aggregation: "sum",
      where: "kind = 'commit'",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
  ],
};
