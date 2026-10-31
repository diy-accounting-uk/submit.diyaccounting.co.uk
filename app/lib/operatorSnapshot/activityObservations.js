// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/activityObservations.js

import { buildAthenaSavedQueryLink } from "../consoleLinks.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "../../services/productCatalog.js";

/**
 * One started and one completed observation per prod-listed catalogue activity
 * (web/public/submit.catalogue.toml), generated here rather than hand-listed so a new prod
 * listing joins the operator dashboard's activities table (renderActivities in dashboard.html)
 * with no change to this file. The pair share their activity id as an "id::started"/
 * "id::completed" suffix, which is how the page pairs them back into one table row.
 *
 * @returns {Array<object>} observation definitions, two per prod-listed activity
 */
export function buildActivityObservations() {
  const catalog = loadCatalogFromRoot();
  const activities = (catalog.activities || []).filter((activity) => isActivityListedInEnvironment(activity, "prod"));
  return activities.flatMap((activity) => [
    {
      id: `${activity.id}::started`,
      label: `${activity.name} — started`,
      unit: "count",
      view: "v_activity_started_daily",
      dayColumn: "day",
      valueExpr: "starts",
      aggregation: "sum",
      where: `activity = '${activity.id}'`,
      reportDataSince: true,
      // v_activity_started_daily groups by whole calendar day, which cannot answer Today
      // since UK midnight accurately (see v_activity_started_hourly.sql), so Today, Previous
      // day and Last 7 days read from the hourly view instead, in the same query shape.
      fastWindowView: "v_activity_started_hourly",
      fastWindowColumn: "hour",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: `${activity.id}::completed`,
      label: `${activity.name} — completed`,
      unit: "count",
      view: "v_submissions_by_activity_daily",
      dayColumn: "day",
      valueExpr: "completions",
      aggregation: "sum",
      where: `activity = '${activity.id}'`,
      reportDataSince: true,
      fastWindowView: "v_submissions_by_activity_hourly",
      fastWindowColumn: "hour",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
  ]);
}
