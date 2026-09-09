// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/alarmEvidence.js
//
// Maps a CloudWatch alarm to the evidence an operator needs: which log
// groups to query, which X-Ray filter to search, which DynamoDB tables are
// behind it, and any AWS or GitHub console page that carries evidence a
// log group cannot. Pure: no AWS calls, no I/O. The caller resolves the
// deployment slug and, for a composite alarm, its child function names,
// and passes both in.
//
// The mapping is an ordered list of rules, not a row per alarm name: most
// rules key on the metric namespace and read the resource name out of the
// alarm's own dimensions, so a new Lambda alarm needs no new row. The last
// two rules are unconditional fallbacks, so every alarm resolves to some
// evidence, including one added tomorrow.

const FAMILY_KEY_PATTERN = /^(ci|prod)-(app|env)-(.+)$/;

// Every function alarm the ~100 "check-" prefixed per-function checks that
// feed a "-stack-health" composite is named "check-{function}-{suffix}"
// (see infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java).
// A composite's AlarmRule chains these as ALARM("arn:...:alarm:check-...").
// The queue-backed suffixes name a DLQ or queue depth, not a Lambda log
// group, so they are dropped.
const COMPOSITE_CHILD_PATTERN = /alarm:check-([A-Za-z0-9-]+?)-(errors|log-errors|not-empty|message-age)"/g;
const LOG_GROUP_QUEUE_SUFFIXES = new Set(["not-empty", "message-age"]);

const CUSTOMER_TABLE_SUFFIXES = ["receipts", "bundles", "passes", "subscriptions", "hmrc-api-requests"];

// Submit/Security metric names map to the CloudTrail event name behind
// them, so the Logs Insights query can filter on it directly.
const CLOUDTRAIL_EVENT_NAMES = {
  DynamoDbCustomerTableScan: "Scan",
  DynamoDbCustomerTableGetItem: "GetItem",
  SaltSecretUnexpectedRead: "GetSecretValue",
};

/**
 * Extract the Lambda function names behind a composite alarm from its raw
 * AlarmRule string (CompositeAlarms[0].AlarmRule from DescribeAlarms). A
 * queue or DLQ capture ("-not-empty", "-message-age") is dropped: it names
 * a resource with no Lambda log group.
 */
export function extractCompositeChildFunctionNames(alarmRule) {
  if (!alarmRule) return [];
  const names = [];
  for (const match of alarmRule.matchAll(COMPOSITE_CHILD_PATTERN)) {
    const [, functionName, suffix] = match;
    if (LOG_GROUP_QUEUE_SUFFIXES.has(suffix)) continue;
    names.push(functionName);
  }
  return names;
}

function parseFamilyParts(familyKey) {
  const match = (familyKey || "").match(FAMILY_KEY_PATTERN);
  if (!match) return null;
  const [, env, kind, suffix] = match;
  return { env, kind, suffix };
}

function lastArnSegment(value) {
  if (!value) return null;
  const parts = value.split(":");
  return parts[parts.length - 1] || null;
}

function genericInsightsQuery(logGroupNamePrefixes) {
  if (!logGroupNamePrefixes.length) return null;
  const source = logGroupNamePrefixes.map((prefix) => `'${prefix}'`).join(", ");
  return [
    `SOURCE logGroups(namePrefix: [${source}])`,
    "| fields @timestamp, @logStream, level, message, requestId",
    "| filter level >= 40 or @message like /(?i)error|fail|exception/",
    "| sort @timestamp desc",
    "| limit 200",
  ].join("\n");
}

function cloudTrailInsightsQuery(logGroupNamePrefixes, eventName) {
  if (!logGroupNamePrefixes.length) return null;
  const source = logGroupNamePrefixes.map((prefix) => `'${prefix}'`).join(", ");
  const lines = [
    `SOURCE logGroups(namePrefix: [${source}])`,
    "| fields @timestamp, @logStream, eventName, eventSource, userIdentity.arn, requestParameters.tableName",
  ];
  if (eventName) lines.push(`| filter eventName = "${eventName}"`);
  lines.push("| sort @timestamp desc", "| limit 200");
  return lines.join("\n");
}

// Ordered: the first matching rule wins. See PLAN_ALARM_EVIDENCE_AND_TRIAGE.md
// Part 2.2 for the table this array implements.
export const EVIDENCE_RULES = [
  {
    id: 1,
    match: (ctx) => ctx.familyParts?.kind === "env" && ctx.familyParts.suffix === "hmrc-submission-failure",
    build: (ctx) => {
      const prefixes = [`/aws/lambda/${ctx.deployment}-app-hmrc-vat-return-post`];
      return {
        logGroupNamePrefixes: prefixes,
        tableNames: [`${ctx.env}-env-hmrc-api-requests`],
        xrayFilterExpression: `service("${ctx.deployment}-app-hmrc-vat-return-post-worker") { fault = true OR error = true }`,
        insightsQuery: genericInsightsQuery(prefixes),
      };
    },
  },
  {
    id: 2,
    match: (ctx) => ctx.familyParts?.kind === "env" && ctx.familyParts.suffix === "bundle-cap-reached",
    build: (ctx) => {
      const prefixes = [`/aws/lambda/${ctx.deployment}-app-bundle-post`];
      return {
        logGroupNamePrefixes: prefixes,
        tableNames: [`${ctx.env}-env-bundle-capacity`, `${ctx.env}-env-bundles`],
        xrayFilterExpression: `service("${ctx.deployment}-app-bundle-post-worker") { fault = true OR error = true }`,
        insightsQuery: genericInsightsQuery(prefixes),
      };
    },
  },
  {
    id: 3,
    match: (ctx) => ctx.namespace === "Submit/Security",
    build: (ctx) => {
      const prefixes = [`/aws/cloudtrail/${ctx.env}-env-cloud-trail`];
      const isCustomerTableMetric =
        ctx.metricName === "DynamoDbCustomerTableScan" || ctx.metricName === "DynamoDbCustomerTableGetItem";
      return {
        logGroupNamePrefixes: prefixes,
        tableNames: isCustomerTableMetric
          ? CUSTOMER_TABLE_SUFFIXES.map((suffix) => `${ctx.env}-env-${suffix}`)
          : [],
        insightsQuery: cloudTrailInsightsQuery(prefixes, CLOUDTRAIL_EVENT_NAMES[ctx.metricName]),
      };
    },
  },
  {
    id: 4,
    match: (ctx) => ctx.familyParts?.kind === "app" && ctx.familyParts.suffix === "api-5xx",
    build: (ctx) => {
      const prefixes = [`/aws/apigw/${ctx.env}-env/access`, `/aws/lambda/${ctx.deployment}-app-`];
      return {
        logGroupNamePrefixes: prefixes,
        xrayFilterExpression: "fault = true OR error = true",
        insightsQuery: genericInsightsQuery(prefixes),
      };
    },
  },
  {
    id: 5,
    match: (ctx) => ctx.namespace === "CloudWatchSynthetics",
    build: (ctx) => {
      const canaryName = ctx.dimensions.CanaryName;
      const prefixes = [`/aws/lambda/cwsyn-${canaryName}-`, `/aws/apigw/${ctx.env}-env/access`];
      return {
        logGroupNamePrefixes: prefixes,
        xrayFilterExpression: "fault = true OR error = true",
        insightsQuery: genericInsightsQuery(prefixes),
      };
    },
  },
  {
    id: 6,
    match: (ctx) => ctx.namespace === "AWS/Lambda",
    build: (ctx) => {
      const functionName = ctx.dimensions.FunctionName;
      const prefixes = [`/aws/lambda/${functionName}`];
      return {
        logGroupNamePrefixes: prefixes,
        xrayFilterExpression: `service("${functionName}") { fault = true OR error = true }`,
        insightsQuery: genericInsightsQuery(prefixes),
      };
    },
  },
  {
    id: 7,
    match: (ctx) => ctx.namespace === "AWS/States",
    build: (ctx) => {
      const stateMachineArn = ctx.dimensions.StateMachineArn;
      const name = lastArnSegment(stateMachineArn);
      const prefixes = name ? [`/aws/vendedlogs/states/${name}`] : [];
      return {
        logGroupNamePrefixes: prefixes,
        insightsQuery: genericInsightsQuery(prefixes),
        extraLinks: stateMachineArn
          ? [
              {
                label: "State machine executions",
                url: `https://eu-west-2.console.aws.amazon.com/states/home?region=eu-west-2#/statemachines/view/${encodeURIComponent(stateMachineArn)}`,
              },
            ]
          : [],
      };
    },
  },
  {
    id: 8,
    match: (ctx) => ctx.namespace === "AWS/Firehose",
    build: (ctx) => {
      const prefixes = [`/aws/kinesisfirehose/${ctx.dimensions.DeliveryStreamName}`];
      return { logGroupNamePrefixes: prefixes, insightsQuery: genericInsightsQuery(prefixes) };
    },
  },
  {
    id: 9,
    match: (ctx) => ctx.namespace === "Glue Data Quality",
    build: (ctx) => {
      const prefixes = [`/aws/lambda/${ctx.env}-env-data-quality-run`];
      return {
        logGroupNamePrefixes: prefixes,
        insightsQuery: genericInsightsQuery(prefixes),
        extraLinks: [
          {
            label: "Glue Data Quality ruleset",
            url: "https://eu-west-2.console.aws.amazon.com/glue/home?region=eu-west-2#/v2/data-quality",
          },
        ],
      };
    },
  },
  {
    id: 10,
    match: (ctx) => ctx.namespace === "AWS/RUM",
    build: () => ({
      xrayFilterExpression: "fault = true OR error = true",
      noEvidenceReason: "RUM events are not written to CloudWatch Logs.",
      extraLinks: [
        {
          label: "RUM app monitor",
          url: "https://eu-west-2.console.aws.amazon.com/rum/home?region=eu-west-2#/",
        },
      ],
    }),
  },
  {
    id: 11,
    match: (ctx) => ctx.namespace === "AWS/WAFV2",
    build: (ctx) => {
      const prefixes = [`/aws/lambda/${ctx.deployment}-app-waf-scan-detect`];
      return {
        logGroupNamePrefixes: prefixes,
        insightsQuery: genericInsightsQuery(prefixes),
        extraLinks: [
          {
            label: "Web ACL sampled requests",
            url: "https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=global",
          },
        ],
      };
    },
  },
  {
    id: 12,
    match: (ctx) => ctx.namespace === "AWS/CertificateManager",
    build: () => ({
      noEvidenceReason: "Certificates are managed in ACM; there is no log group to query.",
      extraLinks: [
        { label: "Certificate in ACM", url: "https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1" },
        {
          label: "certificate-check.yml runs",
          url: "https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/actions/workflows/certificate-check.yml",
        },
      ],
    }),
  },
  {
    id: 13,
    // Namespace is "<env>-submit.diyaccounting.co.uk" (e.g. "prod-submit.diyaccounting.co.uk"),
    // where <env> is one of this file's known environment names (see FAMILY_KEY_PATTERN).
    // Anchored at both ends so an unrelated namespace that merely ends with the domain
    // (e.g. "evilsubmit.diyaccounting.co.uk") cannot match.
    match: (ctx) => {
      const namespace = ctx.namespace || "";
      return namespace === "submit.diyaccounting.co.uk" || /^(ci|prod)-submit\.diyaccounting\.co\.uk$/.test(namespace);
    },
    build: () => ({
      noEvidenceReason: "The evidence is a GitHub Actions run, not an AWS resource.",
      extraLinks: [
        {
          label: "probe-test.yml runs",
          url: "https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/actions/workflows/probe-test.yml",
        },
      ],
    }),
  },
  {
    id: 14,
    match: (ctx) => Boolean(ctx.familyParts?.suffix.endsWith("-stack-health")) && ctx.compositeChildFunctionNames.length > 0,
    build: (ctx) => {
      const prefixes = ctx.compositeChildFunctionNames.map((name) => `/aws/lambda/${name}`);
      return {
        logGroupNamePrefixes: prefixes,
        xrayFilterExpression: "fault = true OR error = true",
        insightsQuery: genericInsightsQuery(prefixes),
      };
    },
  },
  {
    id: 15,
    match: (ctx) => ctx.familyParts?.kind === "app",
    build: (ctx) => {
      const prefixes = [`/aws/lambda/${ctx.deployment}-app-`];
      return {
        logGroupNamePrefixes: prefixes,
        xrayFilterExpression: "fault = true OR error = true",
        insightsQuery: genericInsightsQuery(prefixes),
        noEvidenceReason: ctx.compositeWidened
          ? "The composite alarm's children could not be resolved; widened to the deployment's Lambda log group prefix."
          : null,
      };
    },
  },
  {
    id: 16,
    match: () => true,
    build: (ctx) => {
      const prefixes = [`/aws/lambda/${ctx.env}-env-`];
      return {
        logGroupNamePrefixes: prefixes,
        xrayFilterExpression: "fault = true OR error = true",
        insightsQuery: genericInsightsQuery(prefixes),
        noEvidenceReason: ctx.compositeWidened
          ? "The composite alarm's children could not be resolved; widened to the environment's Lambda log group prefix."
          : null,
      };
    },
  },
];

export function resolveAlarmEvidence({
  alarmName,
  familyKey,
  env,
  deployment,
  namespace,
  metricName,
  dimensions,
  compositeChildFunctionNames,
}) {
  const familyParts = parseFamilyParts(familyKey);
  const safeChildNames = Array.isArray(compositeChildFunctionNames) ? compositeChildFunctionNames : [];
  const compositeWidened = Boolean(familyParts?.suffix.endsWith("-stack-health")) && safeChildNames.length === 0;

  const ctx = {
    alarmName,
    familyKey,
    familyParts,
    env,
    deployment,
    namespace: namespace || null,
    metricName: metricName || null,
    dimensions: dimensions || {},
    compositeChildFunctionNames: safeChildNames,
    compositeWidened,
  };

  const rule = EVIDENCE_RULES.find((candidate) => candidate.match(ctx));
  const built = rule.build(ctx);

  const logGroupNamePrefixes = built.logGroupNamePrefixes || [];
  const noEvidenceReason =
    built.noEvidenceReason !== undefined
      ? built.noEvidenceReason
      : logGroupNamePrefixes.length === 0
        ? "No log group applies to this alarm."
        : null;

  return {
    ruleId: rule.id,
    logGroupNamePrefixes,
    tableNames: built.tableNames || [],
    xrayFilterExpression: built.xrayFilterExpression || null,
    insightsQuery: built.insightsQuery || null,
    noEvidenceReason,
    extraLinks: built.extraLinks || [],
  };
}
