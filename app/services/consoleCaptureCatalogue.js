// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/consoleCaptureCatalogue.js
//
// What the console capture renders, one entry per capture id. Each entry is one of the links in
// web/public/operator/dashboard.awslinks.js: a CloudWatch metric search, the RUM web vitals, the
// alarms, the Bedrock invocation counts, the X-Ray service graph, or a sibling site's RUM. Pure:
// no AWS calls. The capture Lambda (consoleCapturePublish.js) turns each entry into one PNG or one
// table, and a unit test holds this list equal to the ids the dashboard page asks for.

export const SUBMIT_REGION = "eu-west-2";
export const SIBLING_REGION = "us-east-1";

// Where a capture run reads, by target key. prod and ci are this repository's accounts; the two
// sibling keys are the spreadsheets and gateway accounts, which hold their RUM monitors in
// us-east-1.
export const SIBLING_TARGETS = {
  spreadsheets: { label: "Spreadsheets site", monitor: "spreadsheets-web" },
  gateway: { label: "Gateway site", monitor: "gateway-web" },
};

const WIDGET_WIDTH = 800;
const WIDGET_HEIGHT = 400;
const SEARCH_SERIES_LIMIT = 10;
const ANALYTICS_SERIES_LIMIT = 20;
// The functions that peak far above the rest (tens of seconds against under ten) share one graph.
const SLOWEST_FUNCTIONS = 6;

// SEARCH answers an empty graph above 100 series, so each search is wrapped in a SORT that keeps
// the largest few. A search with `skip` set keeps the series ranked after the first `skip`: metric
// math cannot compare a whole series with a number, so a band of series is a band of ranks.
function searchExpression({ query, stat, period, sortBy, limit, skip }) {
  const search = "SEARCH('" + query + "', '" + stat + "', " + period + ")";
  if (skip > 0) return "SLICE(SORT(" + search + ", " + sortBy + ", DESC), " + skip + ", " + (skip + limit) + ")";
  return "SORT(" + search + ", " + sortBy + ", DESC, " + limit + ")";
}

function metricSearch({ slug, title, query, stat, period, start, sortBy = "SUM", limit = SEARCH_SERIES_LIMIT, skip = 0 }) {
  return { slug, title, kind: "metric-search", query, stat, period, start, sortBy, limit, skip };
}

// Every Submit/Analytics metric is a gauge: analyticsMetricsPublish.js writes the prior day's value
// on each run, and a run repeats within a day. Sum would plot a day's value once per run, so these
// searches use Maximum.
function analyticsItems(envName) {
  return [
    metricSearch({
      slug: "cognito-sign-ins",
      title: "Cognito sign-ins and refreshes by client",
      query: '{AWS/Cognito,UserPool,UserPoolClient} MetricName="SignInSuccesses"',
      stat: "Sum",
      period: 86400,
      start: "-P30D",
    }),
    metricSearch({
      slug: "hmrc-authentications",
      title: "HMRC authentications",
      query: "Submit/Analytics HmrcAuthentications",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
    }),
    metricSearch({
      slug: "bundle-operations",
      title: "Bundle operations by activity",
      query: '{Submit/Analytics,Activity} MetricName="BundleOperations"',
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
    }),
    metricSearch({
      slug: "bundle-grants",
      title: "Bundle grants",
      query: "Submit/Analytics BundleGrants",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
    }),
    metricSearch({
      slug: "purchases",
      title: "Purchases: GA4, Stripe and activity events",
      query: "Submit/Analytics Ga4Purchases OR StripePaidCharges OR ActivityActivations",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
    }),
    metricSearch({
      slug: "deploy-lead-time",
      title: "Deploy lead time in hours",
      query: '{Submit/Analytics,Environment} MetricName="DeployLeadTimeHours"',
      stat: "Average",
      period: 86400,
      start: "-P30D",
    }),
    metricSearch({
      slug: "analytics-all",
      title: "The 20 largest Submit/Analytics metrics",
      query: "Submit/Analytics",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
      limit: ANALYTICS_SERIES_LIMIT,
    }),
  ].map((item) => ({ ...item, group: "analytics", env: envName }));
}

function operationsItems(envName) {
  const functionTerm = envName + "-env";
  const items = [
    metricSearch({
      slug: "lambda-errors",
      title: "Lambda errors by function",
      query: '{AWS/Lambda,FunctionName} MetricName="Errors" ' + functionTerm,
      stat: "Sum",
      period: 3600,
      start: "-P3D",
    }),
    metricSearch({
      slug: "lambda-throttles",
      title: "Lambda throttles by function",
      query: '{AWS/Lambda,FunctionName} MetricName="Throttles" ' + functionTerm,
      stat: "Sum",
      period: 3600,
      start: "-P3D",
    }),
    metricSearch({
      slug: "lambda-duration-slowest",
      title: "Lambda duration by function, the " + SLOWEST_FUNCTIONS + " slowest by peak",
      query: '{AWS/Lambda,FunctionName} MetricName="Duration" ' + functionTerm,
      stat: "Average",
      period: 3600,
      start: "-P3D",
      sortBy: "MAX",
      limit: SLOWEST_FUNCTIONS,
    }),
    metricSearch({
      slug: "lambda-duration-rest",
      title: "Lambda duration by function, the next " + SEARCH_SERIES_LIMIT + " by peak",
      query: '{AWS/Lambda,FunctionName} MetricName="Duration" ' + functionTerm,
      stat: "Average",
      period: 3600,
      start: "-P3D",
      sortBy: "MAX",
      skip: SLOWEST_FUNCTIONS,
    }),
    metricSearch({
      slug: "bundle-allocations",
      title: "Active bundle allocations",
      query: '{Submit/BundleCapacity,bundleId} MetricName="BundleActiveAllocations"',
      stat: "Maximum",
      period: 3600,
      start: "-P3D",
      sortBy: "MAX",
    }),
    {
      slug: "rum-vitals",
      title: "Web vitals",
      kind: "rum",
      application: envName + "-env-rum",
      metrics: ["WebVitalsLargestContentfulPaint", "WebVitalsInteractionToNextPaint", "WebVitalsCumulativeLayoutShift"],
      stat: "Average",
      period: 3600,
      start: "-P3D",
    },
    {
      slug: "rum-errors",
      title: "JavaScript errors, page views and sessions",
      kind: "rum",
      application: envName + "-env-rum",
      metrics: ["JsErrorCountPerSession", "PageViewCount", "SessionCount"],
      stat: "Sum",
      period: 3600,
      start: "-P3D",
    },
    { slug: "alarms", title: "Alarms", kind: "alarms", alarmNamePrefix: envName + "-" },
    {
      slug: "bedrock",
      title: "Bedrock invocations by hour and model",
      kind: "bedrock",
      logGroupName: "/" + envName + "/bedrock/invocations",
      windowHours: 24 * 7,
    },
    { slug: "xray", title: "X-Ray services", kind: "service-graph", windowHours: envName === "prod" ? 1 : 6 },
  ];
  return items.map((item) => ({ ...item, group: "operations", env: envName }));
}

function siblingItems(targetKey) {
  const sibling = SIBLING_TARGETS[targetKey];
  return [
    {
      slug: "rum-vitals",
      title: sibling.label + " web vitals",
      kind: "rum",
      application: sibling.monitor,
      metrics: ["WebVitalsLargestContentfulPaint", "WebVitalsInteractionToNextPaint", "WebVitalsCumulativeLayoutShift"],
      stat: "Average",
      period: 3600,
      start: "-P3D",
      group: "operations",
      env: "prod",
    },
  ];
}

function withIds(targetKey, items) {
  return items.map((item) => ({ ...item, id: targetKey + "-" + item.slug, target: targetKey }));
}

/**
 * Every capture entry one run reads from one target. A target is "prod", "ci", "spreadsheets" or
 * "gateway".
 */
export function itemsForTarget(targetKey) {
  if (targetKey === "prod" || targetKey === "ci") {
    return withIds(targetKey, [...analyticsItems(targetKey), ...operationsItems(targetKey)]);
  }
  if (SIBLING_TARGETS[targetKey]) return withIds(targetKey, siblingItems(targetKey));
  throw new Error("Unknown console capture target: " + targetKey);
}

/**
 * The targets a run in `envName` reads. The prod run reads prod, ci and the two sibling
 * accounts; the ci run reads ci only, so ci never reads prod.
 */
export function targetsForRun(envName) {
  if (envName === "prod") return ["prod", "ci", ...Object.keys(SIBLING_TARGETS)];
  if (envName === "ci") return ["ci"];
  throw new Error("Console capture runs in prod and ci only, not " + envName);
}

/** The region a target's metrics, logs and traces are read in. */
export function regionForTarget(targetKey) {
  return SIBLING_TARGETS[targetKey] ? SIBLING_REGION : SUBMIT_REGION;
}

/**
 * The JSON for one GetMetricWidgetImage call.
 *
 * @param {object} item a "metric-search" or "rum" entry
 * @param {string} region the region the target is read in
 */
export function buildMetricWidget(item, region) {
  const base = {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    start: item.start,
    end: "P0D",
    period: item.period,
    view: "timeSeries",
    stacked: false,
    region,
    title: item.title,
  };
  if (item.kind === "metric-search") {
    return {
      ...base,
      metrics: [[{ expression: searchExpression(item), id: "e1", label: "" }]],
    };
  }
  if (item.kind === "rum") {
    return {
      ...base,
      metrics: item.metrics.map((metricName) => ["AWS/RUM", metricName, "application_name", item.application, { stat: item.stat }]),
    };
  }
  throw new Error("Not a metric item: " + item.id);
}

// The one query the Bedrock capture runs. It stores counts only, never a prompt or a response.
export const BEDROCK_QUERY =
  "filter ispresent(modelId) | stats count(*) as invocations, sum(input.inputTokenCount) as inputTokens, sum(output.outputTokenCount) as outputTokens by bin(1h), modelId";

/** The ids of every item any run can capture, for the check against the dashboard page. */
export function allCaptureIds() {
  return ["prod", "ci", ...Object.keys(SIBLING_TARGETS)].flatMap((targetKey) => itemsForTarget(targetKey).map((item) => item.id));
}
