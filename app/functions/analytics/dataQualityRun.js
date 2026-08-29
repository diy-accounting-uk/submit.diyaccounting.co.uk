// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/dataQualityRun.js
//
// Daily job that starts one Glue Data Quality evaluation run over activity_events. It does not
// wait for the run to finish: Glue runs evaluation asynchronously and, with CloudWatchMetricsEnabled
// set, publishes glue.data.quality.rules.passed/failed to the "Glue Data Quality" namespace itself,
// so a CloudWatch alarm on that metric is the pass/fail signal, not this Lambda's return value.
//
// activity_events uses Athena partition projection, so the catalog carries no partitions and
// Athena queries never need any. Glue Data Quality runs on Spark, which reads partitions from the
// catalog only, so before every run this Lambda registers whatever year=*/month=*/day=* partitions
// exist in S3 but are missing from the catalog. Idempotent: partitions already registered are left
// alone, and a partition another concurrent run just created is tolerated as already-existing.

import {
  GlueClient,
  StartDataQualityRulesetEvaluationRunCommand,
  GetTableCommand,
  GetPartitionsCommand,
  BatchCreatePartitionCommand,
} from "@aws-sdk/client-glue";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/dataQualityRun.js" });

const NUMBER_OF_WORKERS = 2;
const TIMEOUT_MINUTES = 20;

// AWS caps BatchCreatePartition at 100 partition inputs per call.
const BATCH_CREATE_PARTITION_LIMIT = 100;

// Matches a curated activity-events partition prefix, e.g.
// "curated/activity-events/year=2026/month=08/day=29/". The S3 folder names are zero-padded
// (projection.month.digits/projection.day.digits = "2") but the partition columns are typed as
// plain integers, so the catalog Values below are unpadded.
const PARTITION_PREFIX_PATTERN = /year=(\d+)\/month=(\d+)\/day=(\d+)\/$/;

let cachedGlueClient = null;
let cachedS3Client = null;

function getGlueClient() {
  if (!cachedGlueClient) {
    cachedGlueClient = new GlueClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedGlueClient;
}

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

/**
 * Required environment configuration for the run, read once so a missing variable fails fast
 * with a clear message rather than as an opaque Glue validation error.
 *
 * @returns {{databaseName: string, tableName: string, rulesetName: string, roleArn: string, lakeBucketName: string, curatedPrefix: string}}
 */
export function readConfig() {
  const databaseName = process.env.GLUE_DATABASE_NAME;
  const tableName = process.env.GLUE_DATA_QUALITY_TABLE_NAME;
  const rulesetName = process.env.GLUE_DATA_QUALITY_RULESET_NAME;
  const roleArn = process.env.GLUE_DATA_QUALITY_ROLE_ARN;
  const lakeBucketName = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  const curatedPrefix = process.env.GLUE_DATA_QUALITY_CURATED_PREFIX;

  const missing = Object.entries({ databaseName, tableName, rulesetName, roleArn, lakeBucketName, curatedPrefix })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for dataQualityRun: ${missing.join(", ")}`);
  }

  return { databaseName, tableName, rulesetName, roleArn, lakeBucketName, curatedPrefix };
}

/**
 * Lists the immediate "directory" prefixes one level below `prefix`, using a delimited listing so
 * the cost is proportional to the number of distinct prefixes rather than to the (much larger,
 * ever-growing) number of files inside them.
 *
 * @param {import("@aws-sdk/client-s3").S3Client} s3Client
 * @param {string} bucketName
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
async function listCommonPrefixes(s3Client, bucketName, prefix) {
  const prefixes = [];
  let continuationToken;
  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const commonPrefix of response.CommonPrefixes ?? []) {
      if (commonPrefix.Prefix) prefixes.push(commonPrefix.Prefix);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return prefixes;
}

/**
 * Walks the year, then month, then day partition prefixes three levels deep under the curated
 * prefix and returns the day prefixes found, e.g.
 * "curated/activity-events/year=2026/month=08/day=29/". Three delimited
 * listings keep the request count bounded by the number of years and months actually present,
 * not by how many event files a day partition has accumulated.
 *
 * @param {import("@aws-sdk/client-s3").S3Client} s3Client
 * @param {string} bucketName
 * @param {string} curatedPrefix
 * @returns {Promise<string[]>}
 */
export async function listPartitionPrefixes(s3Client, bucketName, curatedPrefix) {
  const dayPrefixes = [];
  const yearPrefixes = await listCommonPrefixes(s3Client, bucketName, curatedPrefix);
  for (const yearPrefix of yearPrefixes) {
    const monthPrefixes = await listCommonPrefixes(s3Client, bucketName, yearPrefix);
    for (const monthPrefix of monthPrefixes) {
      dayPrefixes.push(...(await listCommonPrefixes(s3Client, bucketName, monthPrefix)));
    }
  }
  return dayPrefixes;
}

/**
 * Parses a day partition prefix into the catalog Values (unpadded integers, matching the
 * partition columns' "integer" projection type) and the S3 location to register it under.
 *
 * @param {string} prefix
 * @returns {{values: string[], location: string}|null} null when the prefix doesn't match the
 *   expected year=/month=/day=/ shape (defensive against unrelated keys under the same table).
 */
export function parsePartitionPrefix(prefix) {
  const match = PARTITION_PREFIX_PATTERN.exec(prefix);
  if (!match) return null;
  const [, year, month, day] = match;
  return { values: [String(Number(year)), String(Number(month)), String(Number(day))], location: prefix };
}

/**
 * Fetches every partition already registered for the table, as a set of "year/month/day" value
 * keys, so the caller can skip re-creating them.
 *
 * @param {import("@aws-sdk/client-glue").GlueClient} glueClient
 * @param {{databaseName: string, tableName: string}} config
 * @returns {Promise<Set<string>>}
 */
export async function listRegisteredPartitionKeys(glueClient, config) {
  const registered = new Set();
  let nextToken;
  do {
    const response = await glueClient.send(
      new GetPartitionsCommand({
        DatabaseName: config.databaseName,
        TableName: config.tableName,
        NextToken: nextToken,
        ExcludeColumnSchema: true,
      }),
    );
    for (const partition of response.Partitions ?? []) {
      if (partition.Values) registered.add(partition.Values.join("/"));
    }
    nextToken = response.NextToken;
  } while (nextToken);
  return registered;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Registers the given partitions, batched to Glue's per-call limit. AlreadyExistsException
 * entries in a batch response are tolerated (a concurrent run, or a previous run that registered
 * the partition but failed afterwards) - anything else fails the whole run.
 *
 * @param {import("@aws-sdk/client-glue").GlueClient} glueClient
 * @param {{databaseName: string, tableName: string, lakeBucketName: string}} config
 * @param {{values: string[], location: string}[]} partitions
 * @param {object} storageDescriptor the table's own StorageDescriptor, copied per partition with
 *   only Location overridden
 * @returns {Promise<number>} the number of partitions newly registered
 */
export async function registerMissingPartitions(glueClient, config, partitions, storageDescriptor) {
  let registeredCount = 0;
  for (const batch of chunk(partitions, BATCH_CREATE_PARTITION_LIMIT)) {
    const response = await glueClient.send(
      new BatchCreatePartitionCommand({
        DatabaseName: config.databaseName,
        TableName: config.tableName,
        PartitionInputList: batch.map((partition) => ({
          Values: partition.values,
          StorageDescriptor: {
            ...storageDescriptor,
            Location: `s3://${config.lakeBucketName}/${partition.location}`,
          },
        })),
      }),
    );
    const errors = response.Errors ?? [];
    const fatalErrors = errors.filter((error) => error.ErrorDetail?.ErrorCode !== "AlreadyExistsException");
    if (fatalErrors.length > 0) {
      throw new Error(`Failed to register ${fatalErrors.length} partition(s): ${JSON.stringify(fatalErrors)}`);
    }
    registeredCount += batch.length - errors.length;
  }
  return registeredCount;
}

/**
 * Registers every year/month/day partition present in S3 but missing from the catalog.
 * Listing failures and registration failures both throw: a caught-and-logged failure here would
 * let the evaluation run start over an empty (or stale) dataset without anyone noticing.
 *
 * @param {{databaseName: string, tableName: string, lakeBucketName: string, curatedPrefix: string}} config
 * @returns {Promise<{registered: number}>}
 */
export async function registerPartitions(config) {
  const s3Client = getS3Client();
  const glueClient = getGlueClient();

  let partitionPrefixes;
  try {
    partitionPrefixes = await listPartitionPrefixes(s3Client, config.lakeBucketName, config.curatedPrefix);
  } catch (error) {
    logger.error({
      message: "Failed to list curated activity-events partitions from S3",
      bucket: config.lakeBucketName,
      prefix: config.curatedPrefix,
      error: error.message,
    });
    throw error;
  }

  const candidates = partitionPrefixes.map(parsePartitionPrefix).filter((candidate) => candidate !== null);
  if (candidates.length === 0) {
    logger.info({
      message: "No curated activity-events partitions found in S3",
      bucket: config.lakeBucketName,
      prefix: config.curatedPrefix,
    });
    return { registered: 0 };
  }

  const registeredKeys = await listRegisteredPartitionKeys(glueClient, config);
  const missing = candidates.filter((candidate) => !registeredKeys.has(candidate.values.join("/")));
  if (missing.length === 0) {
    logger.info({
      message: "All curated activity-events partitions already registered",
      count: candidates.length,
    });
    return { registered: 0 };
  }

  const table = await glueClient.send(
    new GetTableCommand({ DatabaseName: config.databaseName, Name: config.tableName }),
  );
  const storageDescriptor = table.Table?.StorageDescriptor;
  if (!storageDescriptor) {
    throw new Error(`Glue table ${config.tableName} has no StorageDescriptor to copy for new partitions`);
  }

  const registered = await registerMissingPartitions(glueClient, config, missing, storageDescriptor);
  logger.info({
    message: "Registered missing activity_events partitions",
    registered,
    missing: missing.length,
    alreadyRegistered: candidates.length - missing.length,
  });
  return { registered };
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
 * Registers any missing partitions, then starts today's evaluation run. Any failure from the S3
 * listing, the Glue partition APIs, or the Glue evaluation-run API is rethrown rather than
 * swallowed: a caught-and-logged failure here would leave the schedule looking healthy while
 * the ruleset silently stopped running (or ran over an empty dataset).
 *
 * @returns {Promise<{runId: string}>}
 */
export async function handler() {
  const config = readConfig();

  await registerPartitions(config);

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
