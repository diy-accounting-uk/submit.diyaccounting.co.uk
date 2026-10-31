// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/complianceObjective.js
//
// The compliance objective's observations for the operator snapshot.

import { buildGithubActionsWorkflowLink } from "../consoleLinks.js";

export const complianceObjective = {
  id: "compliance",
  name: "Compliance",
  observations: [
    {
      id: "accessibility-open-findings",
      label: "Accessibility open findings",
      unit: "count",
      view: "v_compliance_status",
      dayColumn: "day",
      valueExpr: "open_findings",
      aggregation: "sum",
      where: "area = 'accessibility'",
      deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "compliance.yml"),
    },
    {
      id: "fraud-header-open-findings",
      label: "Fraud-prevention header months needing action",
      unit: "count",
      view: "v_compliance_status",
      dayColumn: "day",
      valueExpr: "open_findings",
      aggregation: "sum",
      where: "area = 'fraud-prevention-headers'",
      deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "fraud-header-check.yml"),
    },
  ],
};
