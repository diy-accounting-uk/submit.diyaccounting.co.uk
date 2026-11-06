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
const COGNITO_QUERY = '{AWS/Cognito,UserPool,UserPoolClient} MetricName="SignInSuccesses"';
const COGNITO_BUSIEST_CLIENTS = 1;
// The 20 largest Submit/Analytics metrics span cost, revenue and small counts, so one graph flattens
// the small ones. Three graphs hold ranks 1 to 4, 5 to 12 and 13 to 20 by peak.
const ANALYTICS_BANDS = [
  { slug: "analytics-all", title: "Submit/Analytics metrics ranked 1 to 4 by peak", skip: 0, limit: 4 },
  { slug: "analytics-all-middle", title: "Submit/Analytics metrics ranked 5 to 12 by peak", skip: 4, limit: 8 },
  { slug: "analytics-all-rest", title: "Submit/Analytics metrics ranked 13 to 20 by peak", skip: 12, limit: 8 },
];
// The functions that peak far above the rest (tens of seconds against under ten) share one graph.
const SLOWEST_FUNCTIONS = 6;
const NEXT_FUNCTIONS_END = 11;

// SEARCH answers an empty graph above 100 series, so each search is wrapped in a SORT that keeps
// the largest few. A search with `skip` set keeps the series ranked after the first `skip`: metric
// math cannot compare a whole series with a number, so a band of series is a band of ranks.
function searchExpression({ query, stat, period, sortBy, limit, skip }) {
  const search = "SEARCH('" + query + "', '" + stat + "', " + period + ")";
  if (skip > 0) return "SLICE(SORT(" + search + ", " + sortBy + ", DESC), " + skip + ", " + (skip + limit) + ")";
  return "SORT(" + search + ", " + sortBy + ", DESC, " + limit + ")";
}

// `yAxisLabel` names the unit on the y axis for a search whose series share one unit. CloudWatch
// prints "No unit" on a custom or math series otherwise; a search that mixes units sets none.
// Every search graph starts its y axis at 0.
function metricSearch({ slug, title, query, stat, period, start, sortBy = "SUM", limit = SEARCH_SERIES_LIMIT, skip = 0, yAxisLabel }) {
  return { slug, title, kind: "metric-search", query, stat, period, start, sortBy, limit, skip, yAxisLabel };
}

// Every Submit/Analytics metric is a gauge: analyticsMetricsPublish.js writes the prior day's value
// on each run, and a run repeats within a day. Sum would plot a day's value once per run, so these
// searches use Maximum.
function analyticsItems(envName) {
  return [
    metricSearch({
      slug: "cognito-sign-ins",
      title: "Cognito sign-ins and refreshes, the busiest client",
      query: COGNITO_QUERY,
      stat: "Sum",
      period: 86400,
      start: "-P30D",
      limit: COGNITO_BUSIEST_CLIENTS,
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "cognito-sign-ins-rest",
      title: "Cognito sign-ins and refreshes, the other clients",
      query: COGNITO_QUERY,
      stat: "Sum",
      period: 86400,
      start: "-P30D",
      skip: COGNITO_BUSIEST_CLIENTS,
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "hmrc-authentications",
      title: "HMRC authentications",
      query: "Submit/Analytics HmrcAuthentications",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "bundle-operations",
      title: "Bundle operations by activity",
      query: '{Submit/Analytics,Activity} MetricName="BundleOperations"',
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "bundle-grants",
      title: "Bundle grants",
      query: "Submit/Analytics BundleGrants",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "purchases",
      title: "Purchases: GA4, Stripe and activity events",
      query: "Submit/Analytics Ga4Purchases OR StripePaidCharges OR ActivityActivations",
      stat: "Maximum",
      period: 86400,
      start: "-P30D",
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "deploy-lead-time",
      title: "Deploy lead time in hours",
      query: '{Submit/Analytics,Environment} MetricName="DeployLeadTimeHours"',
      stat: "Average",
      period: 86400,
      start: "-P30D",
      yAxisLabel: "Hours",
    }),
    ...ANALYTICS_BANDS.map(({ slug, title, skip, limit }) =>
      metricSearch({ slug, title, query: "Submit/Analytics", stat: "Maximum", period: 86400, start: "-P30D", sortBy: "MAX", skip, limit }),
    ),
  ].map((item) => ({ ...item, group: "analytics", env: envName }));
}

// The paint and interaction times are milliseconds and the layout shift is a unitless score near
// 0.1, so they take two graphs. The 75th percentile is the figure the web vitals thresholds use,
// and one slow visit does not flatten it as the maximum does.
function vitalsItems({ title, application }) {
  const shared = { kind: "rum", application, stat: "p75", period: 3600, start: "-P3D" };
  return [
    {
      ...shared,
      slug: "rum-vitals",
      title: title + ", paint and interaction times (p75)",
      metrics: ["WebVitalsLargestContentfulPaint", "WebVitalsInteractionToNextPaint"],
      yAxisLabel: "Milliseconds",
    },
    {
      ...shared,
      slug: "rum-vitals-score",
      title: title + ", layout shift score (p75)",
      metrics: ["WebVitalsCumulativeLayoutShift"],
      yAxisLabel: "Score",
    },
  ];
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
      yAxisLabel: "Count",
    }),
    metricSearch({
      slug: "lambda-throttles",
      title: "Lambda throttles by function",
      query: '{AWS/Lambda,FunctionName} MetricName="Throttles" ' + functionTerm,
      stat: "Sum",
      period: 3600,
      start: "-P3D",
      yAxisLabel: "Count",
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
      yAxisLabel: "Milliseconds",
    }),
    metricSearch({
      slug: "lambda-duration-rest",
      title: "Lambda duration by function, ranks " + (SLOWEST_FUNCTIONS + 1) + " to " + NEXT_FUNCTIONS_END + " by peak",
      query: '{AWS/Lambda,FunctionName} MetricName="Duration" ' + functionTerm,
      stat: "Average",
      period: 3600,
      start: "-P3D",
      sortBy: "MAX",
      skip: SLOWEST_FUNCTIONS,
      limit: NEXT_FUNCTIONS_END - SLOWEST_FUNCTIONS,
      yAxisLabel: "Milliseconds",
    }),
    metricSearch({
      slug: "lambda-duration-tail",
      title:
        "Lambda duration by function, ranks " + (NEXT_FUNCTIONS_END + 1) + " to " + (NEXT_FUNCTIONS_END + SEARCH_SERIES_LIMIT) + " by peak",
      query: '{AWS/Lambda,FunctionName} MetricName="Duration" ' + functionTerm,
      stat: "Average",
      period: 3600,
      start: "-P3D",
      sortBy: "MAX",
      skip: NEXT_FUNCTIONS_END,
      yAxisLabel: "Milliseconds",
    }),
    metricSearch({
      slug: "bundle-allocations",
      title: "Active bundle allocations",
      query: '{Submit/BundleCapacity,bundleId} MetricName="BundleActiveAllocations"',
      stat: "Maximum",
      period: 3600,
      start: "-P3D",
      sortBy: "MAX",
      yAxisLabel: "Count",
    }),
    ...vitalsItems({ title: "Web vitals", application: envName + "-env-rum" }),
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
    ...vitalsItems({ title: sibling.label + " web vitals", application: sibling.monitor }).map((item) => ({
      ...item,
      group: "operations",
      env: "prod",
    })),
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
      yAxis: { left: { min: 0, ...(item.yAxisLabel ? { label: item.yAxisLabel, showUnits: false } : {}) } },
    };
  }
  if (item.kind === "rum") {
    return {
      ...base,
      metrics: item.metrics.map((metricName) => ["AWS/RUM", metricName, "application_name", item.application, { stat: item.stat }]),
      yAxis: { left: { min: 0, ...(item.yAxisLabel ? { label: item.yAxisLabel, showUnits: false } : {}) } },
    };
  }
  throw new Error("Not a metric item: " + item.id);
}

/** The seconds a graph's `start` looks back, for a start written "-P<days>D". */
export function rangeSeconds(item) {
  const days = /^-P(\d+)D$/.exec(item.start);
  if (!days) throw new Error("Not a day range: " + item.start);
  return Number(days[1]) * 86400;
}

/**
 * The GetMetricData queries that read the same series as a graph, so the capture can say whether
 * the graph holds any data. CloudWatch draws an empty graph with no text.
 */
export function metricDataQueries(item) {
  if (item.kind === "metric-search") return [{ Id: "e1", Expression: searchExpression(item), Period: item.period }];
  if (item.kind === "rum") {
    return item.metrics.map((metricName, index) => ({
      Id: "m" + index,
      MetricStat: {
        Metric: { Namespace: "AWS/RUM", MetricName: metricName, Dimensions: [{ Name: "application_name", Value: item.application }] },
        Period: item.period,
        Stat: item.stat,
      },
    }));
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
