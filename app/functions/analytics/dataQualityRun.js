// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/dataQualityRun.js
//
// Daily job that starts one Glue Data Quality evaluation run per target table (activity_events,
// alarm_state_changes, dora_runs). It does not wait for a run to finish: Glue runs evaluation
// asynchronously and, with CloudWatchMetricsEnabled set, publishes
// glue.data.quality.rules.passed/failed to the "Glue Data Quality" namespace itself, so a
// CloudWatch alarm on that metric is the pass/fail signal, not this Lambda's return value.
//
// Every target table uses Athena partition projection, so the catalog carries no partitions and
// Athena queries never need any. Glue Data Quality runs on Spark, which reads partitions from the
// catalog only, so before every run this Lambda registers whatever partitions exist in S3 but are
// missing from the catalog. activity_events and alarm_state_changes partition on
// year=*/month=*/day=*; dora_runs partitions on a single dt=YYYY-MM-DD level, so
// registerPartitions dispatches on config.partitionScheme. Idempotent: partitions already
// registered are left alone, and a partition another concurrent run just created is tolerated as
// already-existing.

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

// dora_runs partitions on a single dt=YYYY-MM-DD level; every other target partitions on
// year=*/month=*/day=*, the scheme registerPartitions defaults to when a target carries none.
const DT_PARTITIONED_TABLES = new Set(["dora_runs"]);

/**
 * Required environment configuration for the run, read once so a missing variable fails fast
 * with a clear message rather than as an opaque Glue validation error. GLUE_DATA_QUALITY_TARGETS
 * is a JSON array of `{table, ruleset, curatedPrefix}`, one entry per table this run evaluates.
 *
 * @returns {{databaseName: string, roleArn: string, lakeBucketName: string, targets: {table: string, ruleset: string, curatedPrefix: string}[]}}
 */
export function readConfig() {
  const databaseName = process.env.GLUE_DATABASE_NAME;
  const roleArn = process.env.GLUE_DATA_QUALITY_ROLE_ARN;
  const lakeBucketName = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  const targetsJson = process.env.GLUE_DATA_QUALITY_TARGETS;

  const missing = Object.entries({ databaseName, roleArn, lakeBucketName, targetsJson })
    .filter(([, value]) => !value)
    .map(([name]) => (name === "targetsJson" ? "targets" : name));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for dataQualityRun: ${missing.join(", ")}`);
  }

  let targets;
  try {
    targets = JSON.parse(targetsJson);
  } catch (error) {
    throw new Error(`GLUE_DATA_QUALITY_TARGETS is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("GLUE_DATA_QUALITY_TARGETS must be a non-empty JSON array");
  }

  return { databaseName, roleArn, lakeBucketName, targets };
}

/**
 * Merge the shared config with one target's table, ruleset and curated prefix into the shape
 * every per-table helper below expects, plus the partition scheme dora_runs' dt=YYYY-MM-DD
 * layout needs instead of the year/month/day default.
 *
 * @param {{databaseName: string, roleArn: string, lakeBucketName: string}} sharedConfig
 * @param {{table: string, ruleset: string, curatedPrefix: string}} target
 * @returns {{databaseName: string, tableName: string, rulesetName: string, roleArn: string, lakeBucketName: string, curatedPrefix: string, partitionScheme: string}}
 */
export function buildTargetConfig(sharedConfig, target) {
  return {
    databaseName: sharedConfig.databaseName,
    tableName: target.table,
    rulesetName: target.ruleset,
    roleArn: sharedConfig.roleArn,
    lakeBucketName: sharedConfig.lakeBucketName,
    curatedPrefix: target.curatedPrefix,
    partitionScheme: DT_PARTITIONED_TABLES.has(target.table) ? "dt" : "year-month-day",
  };
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

// Matches a curated dora-runs partition prefix, e.g. "curated/dora/dt=2026-09-08/". Unlike the
// year/month/day scheme, dt is a single "date"-typed partition column, so the S3 folder name is
// kept as-is rather than unpadded.
const DT_PARTITION_PREFIX_PATTERN = /dt=(\d{4}-\d{2}-\d{2})\/$/;

/**
 * Lists the immediate dt=YYYY-MM-DD partition prefixes one level below `curatedPrefix`: unlike
 * the year/month/day scheme, a table partitioned on a single dt column needs only one delimited
 * listing, not three.
 *
 * @param {import("@aws-sdk/client-s3").S3Client} s3Client
 * @param {string} bucketName
 * @param {string} curatedPrefix
 * @returns {Promise<string[]>}
 */
export async function listDtPartitionPrefixes(s3Client, bucketName, curatedPrefix) {
  return listCommonPrefixes(s3Client, bucketName, curatedPrefix);
}

/**
 * Parses a dt=YYYY-MM-DD partition prefix into the catalog Values and the S3 location to
 * register it under.
 *
 * @param {string} prefix
 * @returns {{values: string[], location: string}|null} null when the prefix doesn't match the
 *   expected dt=YYYY-MM-DD/ shape.
 */
export function parseDtPartitionPrefix(prefix) {
  const match = DT_PARTITION_PREFIX_PATTERN.exec(prefix);
  if (!match) return null;
  const [, dt] = match;
  return { values: [dt], location: prefix };
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
 * Registers every partition present in S3 but missing from the catalog, for one target table.
 * `config.partitionScheme` selects the layout: "dt" for a single dt=YYYY-MM-DD level (dora_runs),
 * "year-month-day" (the default) for the three-level year=/month=/day= layout every other target
 * uses. Listing failures and registration failures both throw: a caught-and-logged failure here
 * would let the evaluation run start over an empty (or stale) dataset without anyone noticing.
 *
 * @param {{databaseName: string, tableName: string, lakeBucketName: string, curatedPrefix: string, partitionScheme?: string}} config
 * @returns {Promise<{registered: number}>}
 */
export async function registerPartitions(config) {
  const s3Client = getS3Client();
  const glueClient = getGlueClient();
  const isDtScheme = config.partitionScheme === "dt";
  const listPrefixes = isDtScheme ? listDtPartitionPrefixes : listPartitionPrefixes;
  const parsePrefix = isDtScheme ? parseDtPartitionPrefix : parsePartitionPrefix;

  let partitionPrefixes;
  try {
    partitionPrefixes = await listPrefixes(s3Client, config.lakeBucketName, config.curatedPrefix);
  } catch (error) {
    logger.error({
      message: `Failed to list curated ${config.tableName} partitions from S3`,
      bucket: config.lakeBucketName,
      prefix: config.curatedPrefix,
      error: error.message,
    });
    throw error;
  }

  const candidates = partitionPrefixes.map(parsePrefix).filter((candidate) => candidate !== null);
  if (candidates.length === 0) {
    logger.info({
      message: `No curated ${config.tableName} partitions found in S3`,
      bucket: config.lakeBucketName,
      prefix: config.curatedPrefix,
    });
    return { registered: 0 };
  }

  const registeredKeys = await listRegisteredPartitionKeys(glueClient, config);
  const missing = candidates.filter((candidate) => !registeredKeys.has(candidate.values.join("/")));
  if (missing.length === 0) {
    logger.info({
      message: `All curated ${config.tableName} partitions already registered`,
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
    message: `Registered missing ${config.tableName} partitions`,
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
 * For every configured target, registers any missing partitions then starts today's evaluation
 * run. Runs one target after another rather than concurrently, and any failure from the S3
 * listing, the Glue partition APIs, or the Glue evaluation-run API is rethrown rather than
 * swallowed: a caught-and-logged failure here would leave the schedule looking healthy while a
 * ruleset silently stopped running (or ran over an empty dataset), and the remaining targets
 * would be left unevaluated with nothing to say so.
 *
 * @returns {Promise<{runIds: Record<string, string>}>}
 */
export async function handler() {
  const sharedConfig = readConfig();

  const runIds = {};
  for (const target of sharedConfig.targets) {
    const config = buildTargetConfig(sharedConfig, target);

    await registerPartitions(config);

    const params = buildEvaluationRunParams(config);
    try {
      const result = await getGlueClient().send(new StartDataQualityRulesetEvaluationRunCommand(params));
      logger.info({
        message: "Started Glue data quality evaluation run",
        table: config.tableName,
        ruleset: config.rulesetName,
        runId: result.RunId,
      });
      runIds[config.tableName] = result.RunId;
    } catch (error) {
      logger.error({
        message: "Failed to start Glue data quality evaluation run",
        table: config.tableName,
        ruleset: config.rulesetName,
        error: error.message,
      });
      throw error;
    }
  }

  return { runIds };
}
