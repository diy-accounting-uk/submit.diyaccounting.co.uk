// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/dataQualityRun.js
//
// Daily job that starts one Glue Data Quality evaluation run over activity_events. It does not
// wait for the run to finish: Glue runs evaluation asynchronously and, with CloudWatchMetricsEnabled
// set, publishes glue.data.quality.rules.passed/failed to the "Glue Data Quality" namespace itself,
// so a CloudWatch alarm on that metric is the pass/fail signal, not this Lambda's return value.

import { GlueClient, StartDataQualityRulesetEvaluationRunCommand } from "@aws-sdk/client-glue";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/dataQualityRun.js" });

const NUMBER_OF_WORKERS = 2;
const TIMEOUT_MINUTES = 20;

let cachedGlueClient = null;

function getGlueClient() {
  if (!cachedGlueClient) {
    cachedGlueClient = new GlueClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedGlueClient;
}

/**
 * Required environment configuration for the run, read once so a missing variable fails fast
 * with a clear message rather than as an opaque Glue validation error.
 *
 * @returns {{databaseName: string, tableName: string, rulesetName: string, roleArn: string}}
 */
export function readConfig() {
  const databaseName = process.env.GLUE_DATABASE_NAME;
  const tableName = process.env.GLUE_DATA_QUALITY_TABLE_NAME;
  const rulesetName = process.env.GLUE_DATA_QUALITY_RULESET_NAME;
  const roleArn = process.env.GLUE_DATA_QUALITY_ROLE_ARN;

  const missing = Object.entries({ databaseName, tableName, rulesetName, roleArn })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for dataQualityRun: ${missing.join(", ")}`);
  }

  return { databaseName, tableName, rulesetName, roleArn };
}

/**
 * Builds the StartDataQualityRulesetEvaluationRun request. A pure function so the shape sent to
 * Glue is testable without a mocked SDK client.
 *
 * @param {{databaseName: string, tableName: string, rulesetName: string, roleArn: string}} config
 * @returns {object}
 */
export function buildEvaluationRunParams(config) {
  return {
    DataSource: {
      GlueTable: {
        DatabaseName: config.databaseName,
        TableName: config.tableName,
      },
    },
    Role: config.roleArn,
    RulesetNames: [config.rulesetName],
    NumberOfWorkers: NUMBER_OF_WORKERS,
    Timeout: TIMEOUT_MINUTES,
    AdditionalRunOptions: {
      CloudWatchMetricsEnabled: true,
    },
  };
}

/**
 * Starts today's evaluation run. Any failure from the Glue API is rethrown rather than
 * swallowed: a caught-and-logged failure here would leave the schedule looking healthy while
 * the ruleset silently stopped running.
 *
 * @returns {Promise<{runId: string}>}
 */
export async function handler() {
  const config = readConfig();
  const params = buildEvaluationRunParams(config);

  try {
    const result = await getGlueClient().send(new StartDataQualityRulesetEvaluationRunCommand(params));
    logger.info({
      message: "Started Glue data quality evaluation run",
      ruleset: config.rulesetName,
      runId: result.RunId,
    });
    return { runId: result.RunId };
  } catch (error) {
    logger.error({
      message: "Failed to start Glue data quality evaluation run",
      ruleset: config.rulesetName,
      error: error.message,
    });
    throw error;
  }
}
