// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";

import { resolveAlarmEvidence, extractCompositeChildFunctionNames } from "@app/lib/alarmEvidence.js";
import { alarmFamilyKey } from "@app/lib/alarmName.js";

describe("resolveAlarmEvidence", () => {
  test("rule 1: prod-env-hmrc-submission-failure", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-hmrc-submission-failure",
      familyKey: alarmFamilyKey("prod-env-hmrc-submission-failure"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "Submit/Business",
      metricName: "VatSubmissionFailure",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(1);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-0f68ed8-app-hmrc-vat-return-post"]);
    expect(evidence.tableNames).toEqual(["prod-env-hmrc-api-requests"]);
    expect(evidence.xrayFilterExpression).toContain('service("prod-0f68ed8-app-hmrc-vat-return-post-worker")');
  });

  test("rule 1: ci-env-hmrc-submission-failure produces the ci table name from the same rule", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "ci-env-hmrc-submission-failure",
      familyKey: alarmFamilyKey("ci-env-hmrc-submission-failure"),
      env: "ci",
      deployment: "ci-abc1234",
      namespace: "Submit/Business",
      metricName: "VatSubmissionFailure",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(1);
    expect(evidence.tableNames).toEqual(["ci-env-hmrc-api-requests"]);
  });

  test("rule 2: prod-env-bundle-cap-reached", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-bundle-cap-reached",
      familyKey: alarmFamilyKey("prod-env-bundle-cap-reached"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "Submit/BundleCapacity",
      metricName: "BundleCapReached",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(2);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-0f68ed8-app-bundle-post"]);
    expect(evidence.tableNames).toEqual(["prod-env-bundle-capacity", "prod-env-bundles"]);
  });

  test("rule 3: prod-env-salt-secret-unexpected-read", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-salt-secret-unexpected-read",
      familyKey: alarmFamilyKey("prod-env-salt-secret-unexpected-read"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "Submit/Security",
      metricName: "SaltSecretUnexpectedRead",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(3);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/cloudtrail/prod-env-cloud-trail"]);
    expect(evidence.xrayFilterExpression).toBeNull();
    expect(evidence.tableNames).toEqual([]);
  });

  test("rule 3: the customer-table scan/getitem metrics carry the five customer tables", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-dynamodb-customer-table-scan",
      familyKey: alarmFamilyKey("prod-env-dynamodb-customer-table-scan"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "Submit/Security",
      metricName: "DynamoDbCustomerTableScan",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.tableNames).toEqual([
      "prod-env-receipts",
      "prod-env-bundles",
      "prod-env-passes",
      "prod-env-subscriptions",
      "prod-env-hmrc-api-requests",
    ]);
  });

  test("rule 4: prod-0f68ed8-app-api-5xx includes both the API access log and the deployment's Lambda prefix", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-api-5xx",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-api-5xx"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/ApiGateway",
      metricName: "5xx",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(4);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/apigw/prod-env/access", "/aws/lambda/prod-0f68ed8-app-"]);
  });

  test("rule 5: prod-0f68ed8-app-api-failed builds the canary log group from the CanaryName dimension, not the alarm name", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-api-failed",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-api-failed"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "CloudWatchSynthetics",
      metricName: "SuccessPercent",
      dimensions: { CanaryName: "prod-0f68ed8-api" },
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(5);
    expect(evidence.logGroupNamePrefixes).toContain("/aws/lambda/cwsyn-prod-0f68ed8-api-");
  });

  test("rule 6: prod-env-stripe-reconcile-errors reads FunctionName from the dimensions", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-stripe-reconcile-errors",
      familyKey: alarmFamilyKey("prod-env-stripe-reconcile-errors"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/Lambda",
      metricName: "Errors",
      dimensions: { FunctionName: "prod-env-stripe-reconcile" },
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(6);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-env-stripe-reconcile"]);
    expect(evidence.xrayFilterExpression).toContain('service("prod-env-stripe-reconcile")');
  });

  test("rule 7: prod-env-analytics-nightly-failed takes the state machine's last ARN segment", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-analytics-nightly-failed",
      familyKey: alarmFamilyKey("prod-env-analytics-nightly-failed"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/States",
      metricName: "ExecutionsFailed",
      dimensions: { StateMachineArn: "arn:aws:states:eu-west-2:367191799875:stateMachine:prod-env-analytics-nightly" },
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(7);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/vendedlogs/states/prod-env-analytics-nightly"]);
  });

  test("rule 8: prod-env-firehose-put-failed", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-firehose-put-failed",
      familyKey: alarmFamilyKey("prod-env-firehose-put-failed"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/Firehose",
      metricName: "ThrottledRecords",
      dimensions: { DeliveryStreamName: "prod-env-activity-events" },
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(8);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/kinesisfirehose/prod-env-activity-events"]);
  });

  test("rule 9: prod-env-data-quality-rules-failed", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-data-quality-rules-failed",
      familyKey: alarmFamilyKey("prod-env-data-quality-rules-failed"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "Glue Data Quality",
      metricName: "glue.data.quality.rules.failed",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(9);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-env-data-quality-run"]);
  });

  test("rule 10: prod-env-rum-js-errors has no log group, sets noEvidenceReason, and names the RUM monitor", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-rum-js-errors",
      familyKey: alarmFamilyKey("prod-env-rum-js-errors"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/RUM",
      metricName: "JsErrorCount",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(10);
    expect(evidence.logGroupNamePrefixes).toEqual([]);
    expect(evidence.noEvidenceReason).toBeTruthy();
    expect(evidence.extraLinks.some((link) => /RUM/i.test(link.label))).toBe(true);
  });

  test("rule 11: prod-0f68ed8-app-waf-rate-limit names the Web ACL in its extra links", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-waf-rate-limit",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-waf-rate-limit"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/WAFV2",
      metricName: "BlockedRequests",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(11);
    expect(evidence.extraLinks.some((link) => /Web ACL/i.test(link.label))).toBe(true);
  });

  test("rule 12: prod-0f68ed8-app-cert-expiring has no log group and no X-Ray", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-cert-expiring",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-cert-expiring"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "AWS/CertificateManager",
      metricName: "DaysToExpiry",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(12);
    expect(evidence.logGroupNamePrefixes).toEqual([]);
    expect(evidence.xrayFilterExpression).toBeNull();
  });

  test("rule 13: prod-env-github-probe-failed names probe-test.yml in its extra links", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-github-probe-failed",
      familyKey: alarmFamilyKey("prod-env-github-probe-failed"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: "prod-submit.diyaccounting.co.uk",
      metricName: "behaviour-test",
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(13);
    expect(evidence.extraLinks.some((link) => /probe-test\.yml/.test(link.url))).toBe(true);
  });

  test("rule 14: a composite with two child function names maps them to two log group prefixes", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-hmrc-stack-health",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-hmrc-stack-health"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: null,
      metricName: null,
      dimensions: {},
      compositeChildFunctionNames: [
        "prod-0f68ed8-app-hmrc-vat-return-post",
        "prod-0f68ed8-app-hmrc-vat-return-get",
      ],
    });

    expect(evidence.ruleId).toBe(14);
    expect(evidence.logGroupNamePrefixes).toEqual([
      "/aws/lambda/prod-0f68ed8-app-hmrc-vat-return-post",
      "/aws/lambda/prod-0f68ed8-app-hmrc-vat-return-get",
    ]);
  });

  test("the same composite alarm with an empty child list widens to rule 15's deployment prefix and sets noEvidenceReason", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-hmrc-stack-health",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-hmrc-stack-health"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: null,
      metricName: null,
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(15);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-0f68ed8-app-"]);
    expect(evidence.noEvidenceReason).toBeTruthy();
  });

  test("rule 15: an invented deployment-scoped alarm falls back to the deployment prefix", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-0f68ed8-app-something-new",
      familyKey: alarmFamilyKey("prod-0f68ed8-app-something-new"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: null,
      metricName: null,
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(15);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-0f68ed8-app-"]);
    expect(evidence.noEvidenceReason).toBeNull();
  });

  test("rule 16: an invented environment-scoped alarm falls back to the environment prefix", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-something-new",
      familyKey: alarmFamilyKey("prod-env-something-new"),
      env: "prod",
      deployment: "prod-0f68ed8",
      namespace: null,
      metricName: null,
      dimensions: {},
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(16);
    expect(evidence.logGroupNamePrefixes).toEqual(["/aws/lambda/prod-env-"]);
  });

  test("rule order holds: a family suffix match wins over a namespace match", () => {
    const evidence = resolveAlarmEvidence({
      alarmName: "prod-env-hmrc-submission-failure",
      familyKey: alarmFamilyKey("prod-env-hmrc-submission-failure"),
      env: "prod",
      deployment: "prod-0f68ed8",
      // Namespace would otherwise hit rule 6 (AWS/Lambda); the family suffix rule
      // earlier in the list must still win.
      namespace: "AWS/Lambda",
      metricName: "Errors",
      dimensions: { FunctionName: "some-other-function" },
      compositeChildFunctionNames: [],
    });

    expect(evidence.ruleId).toBe(1);
  });
});

describe("extractCompositeChildFunctionNames", () => {
  test("parses a real AlarmRule string into function names", () => {
    const alarmRule =
      'ALARM("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:check-prod-0f68ed8-app-hmrc-vat-return-post-errors") ' +
      'OR ALARM("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:check-prod-0f68ed8-app-hmrc-vat-return-post-log-errors")';

    expect(extractCompositeChildFunctionNames(alarmRule)).toEqual([
      "prod-0f68ed8-app-hmrc-vat-return-post",
      "prod-0f68ed8-app-hmrc-vat-return-post",
    ]);
  });

  test("drops a -not-empty or -message-age child, because a queue is not a log group", () => {
    const alarmRule =
      'ALARM("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:check-prod-0f68ed8-app-hmrc-vat-return-post-errors") ' +
      'OR ALARM("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:check-prod-0f68ed8-app-hmrc-vat-return-post-async-queue-not-empty") ' +
      'OR ALARM("arn:aws:cloudwatch:eu-west-2:367191799875:alarm:check-prod-0f68ed8-app-hmrc-vat-return-post-async-queue-message-age")';

    expect(extractCompositeChildFunctionNames(alarmRule)).toEqual(["prod-0f68ed8-app-hmrc-vat-return-post"]);
  });

  test("returns [] for an empty or missing AlarmRule", () => {
    expect(extractCompositeChildFunctionNames("")).toEqual([]);
    expect(extractCompositeChildFunctionNames(undefined)).toEqual([]);
  });
});
