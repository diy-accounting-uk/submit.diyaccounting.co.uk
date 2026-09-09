// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const mockGlueSend = vi.fn();
const mockS3Send = vi.fn();

vi.mock("@aws-sdk/client-glue", () => {
  class GlueClient {
    send(command) {
      return mockGlueSend(command);
    }
  }
  class StartDataQualityRulesetEvaluationRunCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetTableCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetPartitionsCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class BatchCreatePartitionCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    GlueClient,
    StartDataQualityRulesetEvaluationRunCommand,
    GetTableCommand,
    GetPartitionsCommand,
    BatchCreatePartitionCommand,
  };
});

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send(command) {
      return mockS3Send(command);
    }
  }
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  }
  return { S3Client, ListObjectsV2Command };
});

const { GlueClient } = await import("@aws-sdk/client-glue");
const { S3Client } = await import("@aws-sdk/client-s3");
const fakeGlueClient = new GlueClient();
const fakeS3Client = new S3Client();

const {
  handler,
  readConfig,
  buildTargetConfig,
  buildEvaluationRunParams,
  listPartitionPrefixes,
  parsePartitionPrefix,
  listDtPartitionPrefixes,
  parseDtPartitionPrefix,
  listRegisteredPartitionKeys,
  registerMissingPartitions,
  registerPartitions,
} = await import("../../functions/analytics/dataQualityRun.js");

const ENV_KEYS = [
  "GLUE_DATABASE_NAME",
  "GLUE_DATA_QUALITY_ROLE_ARN",
  "ANALYTICS_LAKE_BUCKET_NAME",
  "GLUE_DATA_QUALITY_TARGETS",
];

const VALID_TARGETS = [
  { table: "activity_events", ruleset: "ci_env_activity_events_dq", curatedPrefix: "curated/activity-events/" },
  {
    table: "alarm_state_changes",
    ruleset: "ci_env_alarm_state_changes_dq",
    curatedPrefix: "curated/alarm-state-changes/",
  },
  { table: "dora_runs", ruleset: "ci_env_dora_runs_dq", curatedPrefix: "curated/dora/" },
];

function setValidEnv() {
  process.env.GLUE_DATABASE_NAME = "ci_env_analytics";
  process.env.GLUE_DATA_QUALITY_ROLE_ARN = "arn:aws:iam::111111111111:role/ci-env-data-quality-run";
  process.env.ANALYTICS_LAKE_BUCKET_NAME = "ci-env-analytics-lake-111111111111";
  process.env.GLUE_DATA_QUALITY_TARGETS = JSON.stringify(VALID_TARGETS);
}

const VALID_SHARED_CONFIG = {
  databaseName: "ci_env_analytics",
  roleArn: "arn:aws:iam::111111111111:role/ci-env-data-quality-run",
  lakeBucketName: "ci-env-analytics-lake-111111111111",
  targets: VALID_TARGETS,
};

const VALID_CONFIG = {
  databaseName: "ci_env_analytics",
  tableName: "activity_events",
  rulesetName: "ci_env_activity_events_dq",
  roleArn: "arn:aws:iam::111111111111:role/ci-env-data-quality-run",
  lakeBucketName: "ci-env-analytics-lake-111111111111",
  curatedPrefix: "curated/activity-events/",
};

const SAMPLE_STORAGE_DESCRIPTOR = {
  Columns: [{ Name: "event", Type: "string" }],
  Location: "s3://ci-env-analytics-lake-111111111111/curated/activity-events/",
  InputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
  OutputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
  SerdeInfo: { SerializationLibrary: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe" },
};

/** Builds a ListObjectsV2 response with the given CommonPrefixes and no further pages. */
function listObjectsResponse(commonPrefixes) {
  return { CommonPrefixes: commonPrefixes.map((prefix) => ({ Prefix: prefix })), IsTruncated: false };
}

describe("dataQualityRun", () => {
  beforeEach(() => {
    mockGlueSend.mockReset();
    mockS3Send.mockReset();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  describe("readConfig", () => {
    test("reads the shared variables and parses the targets array", () => {
      setValidEnv();
      expect(readConfig()).toEqual(VALID_SHARED_CONFIG);
    });

    test("throws naming every missing variable rather than silently defaulting", () => {
      setValidEnv();
      delete process.env.GLUE_DATA_QUALITY_ROLE_ARN;
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;

      expect(() => readConfig()).toThrow(/roleArn, lakeBucketName/);
    });

    test("throws when GLUE_DATA_QUALITY_TARGETS is not valid JSON", () => {
      setValidEnv();
      process.env.GLUE_DATA_QUALITY_TARGETS = "not json";

      expect(() => readConfig()).toThrow(/not valid JSON/);
    });

    test("throws when GLUE_DATA_QUALITY_TARGETS is an empty array", () => {
      setValidEnv();
      process.env.GLUE_DATA_QUALITY_TARGETS = "[]";

      expect(() => readConfig()).toThrow(/non-empty JSON array/);
    });
  });

  describe("buildTargetConfig", () => {
    test("merges the shared config with one target's table, ruleset and curated prefix", () => {
      const config = buildTargetConfig(VALID_SHARED_CONFIG, VALID_TARGETS[0]);

      expect(config).toEqual({
        databaseName: "ci_env_analytics",
        tableName: "activity_events",
        rulesetName: "ci_env_activity_events_dq",
        roleArn: "arn:aws:iam::111111111111:role/ci-env-data-quality-run",
        lakeBucketName: "ci-env-analytics-lake-111111111111",
        curatedPrefix: "curated/activity-events/",
        partitionScheme: "year-month-day",
      });
    });

    test("selects the dt partition scheme for dora_runs", () => {
      const config = buildTargetConfig(VALID_SHARED_CONFIG, VALID_TARGETS[2]);
      expect(config.partitionScheme).toBe("dt");
    });

    test("selects the year-month-day partition scheme for alarm_state_changes", () => {
      const config = buildTargetConfig(VALID_SHARED_CONFIG, VALID_TARGETS[1]);
      expect(config.partitionScheme).toBe("year-month-day");
    });
  });

  describe("buildEvaluationRunParams", () => {
    test("enables CloudWatch metrics and names the configured ruleset", () => {
      const params = buildEvaluationRunParams(VALID_CONFIG);

      expect(params.RulesetNames).toEqual(["ci_env_activity_events_dq"]);
      expect(params.DataSource).toEqual({
        GlueTable: { DatabaseName: "ci_env_analytics", TableName: "activity_events" },
      });
      expect(params.Role).toBe("arn:aws:iam::111111111111:role/ci-env-data-quality-run");
      expect(params.AdditionalRunOptions).toEqual({ CloudWatchMetricsEnabled: true });
      expect(params.NumberOfWorkers).toBe(2);
      expect(params.Timeout).toBe(20);
    });
  });

  describe("parsePartitionPrefix", () => {
    test("parses year/month/day into unpadded integer strings", () => {
      expect(parsePartitionPrefix("curated/activity-events/year=2026/month=08/day=29/")).toEqual({
        values: ["2026", "8", "29"],
        location: "curated/activity-events/year=2026/month=08/day=29/",
      });
    });

    test("returns null for a prefix that isn't a day partition", () => {
      expect(parsePartitionPrefix("curated/activity-events/year=2026/month=08/")).toBeNull();
      expect(parsePartitionPrefix("curated/activity-events/")).toBeNull();
    });
  });

  describe("parseDtPartitionPrefix", () => {
    test("parses a dt=YYYY-MM-DD prefix, keeping the date as-is", () => {
      expect(parseDtPartitionPrefix("curated/dora/dt=2026-09-08/")).toEqual({
        values: ["2026-09-08"],
        location: "curated/dora/dt=2026-09-08/",
      });
    });

    test("returns null for a prefix that isn't a dt partition", () => {
      expect(parseDtPartitionPrefix("curated/dora/")).toBeNull();
      expect(parseDtPartitionPrefix("curated/dora/year=2026/")).toBeNull();
    });
  });

  describe("listDtPartitionPrefixes", () => {
    test("lists the dt partitions one level below the curated prefix", async () => {
      mockS3Send.mockResolvedValueOnce(
        listObjectsResponse(["curated/dora/dt=2026-09-07/", "curated/dora/dt=2026-09-08/"]),
      );

      const prefixes = await listDtPartitionPrefixes(fakeS3Client, "ci-env-analytics-lake-111111111111", "curated/dora/");

      expect(prefixes).toEqual(["curated/dora/dt=2026-09-07/", "curated/dora/dt=2026-09-08/"]);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });
  });

  describe("listPartitionPrefixes", () => {
    test("walks year, then month, then day prefixes", async () => {
      mockS3Send
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/"]))
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/month=08/"]))
        .mockResolvedValueOnce(
          listObjectsResponse(["curated/activity-events/year=2026/month=08/day=28/", "curated/activity-events/year=2026/month=08/day=29/"]),
        );

      const prefixes = await listPartitionPrefixes(fakeS3Client, "ci-env-analytics-lake-111111111111", "curated/activity-events/");

      expect(prefixes).toEqual([
        "curated/activity-events/year=2026/month=08/day=28/",
        "curated/activity-events/year=2026/month=08/day=29/",
      ]);
      expect(mockS3Send).toHaveBeenCalledTimes(3);
    });

    test("follows S3 pagination at a single level", async () => {
      mockS3Send
        .mockResolvedValueOnce({
          CommonPrefixes: [{ Prefix: "curated/activity-events/year=2026/" }],
          IsTruncated: true,
          NextContinuationToken: "token-1",
        })
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2027/"]))
        .mockResolvedValueOnce(listObjectsResponse([]))
        .mockResolvedValueOnce(listObjectsResponse([]));

      const prefixes = await listPartitionPrefixes(fakeS3Client, "bucket", "curated/activity-events/");

      expect(prefixes).toEqual([]);
      expect(mockS3Send).toHaveBeenCalledTimes(4);
      expect(mockS3Send.mock.calls[1][0].input.ContinuationToken).toBe("token-1");
    });
  });

  describe("listRegisteredPartitionKeys", () => {
    test("collects partition values across pages", async () => {
      mockGlueSend
        .mockResolvedValueOnce({
          Partitions: [{ Values: ["2026", "8", "28"] }],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({ Partitions: [{ Values: ["2026", "8", "29"] }] });

      const keys = await listRegisteredPartitionKeys(fakeGlueClient, { databaseName: "db", tableName: "activity_events" });

      expect(keys).toEqual(new Set(["2026/8/28", "2026/8/29"]));
      expect(mockGlueSend).toHaveBeenCalledTimes(2);
      expect(mockGlueSend.mock.calls[1][0].input.NextToken).toBe("token-1");
    });
  });

  describe("registerMissingPartitions", () => {
    const partitions = [
      { values: ["2026", "8", "28"], location: "curated/activity-events/year=2026/month=08/day=28/" },
      { values: ["2026", "8", "29"], location: "curated/activity-events/year=2026/month=08/day=29/" },
    ];

    test("creates partitions with the table's storage descriptor and an overridden location", async () => {
      mockGlueSend.mockResolvedValue({});

      const registered = await registerMissingPartitions(fakeGlueClient, VALID_CONFIG, partitions, SAMPLE_STORAGE_DESCRIPTOR);

      expect(registered).toBe(2);
      const command = mockGlueSend.mock.calls[0][0];
      expect(command.input.PartitionInputList).toHaveLength(2);
      expect(command.input.PartitionInputList[0]).toEqual({
        Values: ["2026", "8", "28"],
        StorageDescriptor: {
          ...SAMPLE_STORAGE_DESCRIPTOR,
          Location: "s3://ci-env-analytics-lake-111111111111/curated/activity-events/year=2026/month=08/day=28/",
        },
      });
    });

    test("tolerates AlreadyExistsException entries and does not count them as newly registered", async () => {
      mockGlueSend.mockResolvedValue({
        Errors: [
          {
            PartitionValues: ["2026", "8", "28"],
            ErrorDetail: { ErrorCode: "AlreadyExistsException", ErrorMessage: "already there" },
          },
        ],
      });

      const registered = await registerMissingPartitions(fakeGlueClient, VALID_CONFIG, partitions, SAMPLE_STORAGE_DESCRIPTOR);

      expect(registered).toBe(1);
    });

    test("throws on any error other than AlreadyExistsException", async () => {
      mockGlueSend.mockResolvedValue({
        Errors: [{ PartitionValues: ["2026", "8", "28"], ErrorDetail: { ErrorCode: "InternalServiceException" } }],
      });

      await expect(registerMissingPartitions(fakeGlueClient, VALID_CONFIG, partitions, SAMPLE_STORAGE_DESCRIPTOR)).rejects.toThrow(
        /Failed to register 1 partition/,
      );
    });

    test("batches beyond the 100-partition BatchCreatePartition limit", async () => {
      mockGlueSend.mockResolvedValue({});
      const manyPartitions = Array.from({ length: 150 }, (_, i) => ({
        values: ["2026", "1", String(i + 1)],
        location: `curated/activity-events/year=2026/month=01/day=${i + 1}/`,
      }));

      const registered = await registerMissingPartitions(fakeGlueClient, VALID_CONFIG, manyPartitions, SAMPLE_STORAGE_DESCRIPTOR);

      expect(registered).toBe(150);
      expect(mockGlueSend).toHaveBeenCalledTimes(2);
      expect(mockGlueSend.mock.calls[0][0].input.PartitionInputList).toHaveLength(100);
      expect(mockGlueSend.mock.calls[1][0].input.PartitionInputList).toHaveLength(50);
    });
  });

  describe("registerPartitions", () => {
    test("registers only the partitions missing from the catalog", async () => {
      mockS3Send
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/"]))
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/month=08/"]))
        .mockResolvedValueOnce(
          listObjectsResponse(["curated/activity-events/year=2026/month=08/day=28/", "curated/activity-events/year=2026/month=08/day=29/"]),
        );
      mockGlueSend
        .mockResolvedValueOnce({ Partitions: [{ Values: ["2026", "8", "28"] }] }) // GetPartitions
        .mockResolvedValueOnce({ Table: { StorageDescriptor: SAMPLE_STORAGE_DESCRIPTOR } }) // GetTable
        .mockResolvedValueOnce({}); // BatchCreatePartition

      const result = await registerPartitions(VALID_CONFIG);

      expect(result).toEqual({ registered: 1 });
      const batchCreateCall = mockGlueSend.mock.calls[2][0];
      expect(batchCreateCall.input.PartitionInputList).toHaveLength(1);
      expect(batchCreateCall.input.PartitionInputList[0].Values).toEqual(["2026", "8", "29"]);
    });

    test("does nothing when every partition found in S3 is already registered", async () => {
      mockS3Send
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/"]))
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/month=08/"]))
        .mockResolvedValueOnce(listObjectsResponse(["curated/activity-events/year=2026/month=08/day=29/"]));
      mockGlueSend.mockResolvedValueOnce({ Partitions: [{ Values: ["2026", "8", "29"] }] });

      const result = await registerPartitions(VALID_CONFIG);

      expect(result).toEqual({ registered: 0 });
      expect(mockGlueSend).toHaveBeenCalledTimes(1); // GetPartitions only, no GetTable/BatchCreatePartition
    });

    test("does nothing and never calls Glue when S3 has no partitions yet", async () => {
      mockS3Send.mockResolvedValueOnce(listObjectsResponse([]));

      const result = await registerPartitions(VALID_CONFIG);

      expect(result).toEqual({ registered: 0 });
      expect(mockGlueSend).not.toHaveBeenCalled();
    });

    test("fails the run when S3 listing fails, without ever calling Glue", async () => {
      mockS3Send.mockRejectedValue(new Error("access denied"));

      await expect(registerPartitions(VALID_CONFIG)).rejects.toThrow("access denied");
      expect(mockGlueSend).not.toHaveBeenCalled();
    });

    test("registers dt-scheme partitions for a dora_runs-shaped config", async () => {
      const doraConfig = { ...VALID_CONFIG, tableName: "dora_runs", curatedPrefix: "curated/dora/", partitionScheme: "dt" };
      mockS3Send.mockResolvedValueOnce(
        listObjectsResponse(["curated/dora/dt=2026-09-07/", "curated/dora/dt=2026-09-08/"]),
      );
      mockGlueSend
        .mockResolvedValueOnce({ Partitions: [{ Values: ["2026-09-07"] }] }) // GetPartitions
        .mockResolvedValueOnce({ Table: { StorageDescriptor: SAMPLE_STORAGE_DESCRIPTOR } }) // GetTable
        .mockResolvedValueOnce({}); // BatchCreatePartition

      const result = await registerPartitions(doraConfig);

      expect(result).toEqual({ registered: 1 });
      const batchCreateCall = mockGlueSend.mock.calls[2][0];
      expect(batchCreateCall.input.PartitionInputList).toHaveLength(1);
      expect(batchCreateCall.input.PartitionInputList[0].Values).toEqual(["2026-09-08"]);
    });
  });

  describe("handler", () => {
    test("registers partitions and starts one evaluation run per target, in order", async () => {
      setValidEnv();
      mockS3Send.mockResolvedValue(listObjectsResponse([]));
      mockGlueSend
        .mockResolvedValueOnce({ RunId: "dqrun-activity" })
        .mockResolvedValueOnce({ RunId: "dqrun-alarm" })
        .mockResolvedValueOnce({ RunId: "dqrun-dora" });

      const result = await handler();

      expect(result).toEqual({
        runIds: {
          activity_events: "dqrun-activity",
          alarm_state_changes: "dqrun-alarm",
          dora_runs: "dqrun-dora",
        },
      });
      expect(mockGlueSend).toHaveBeenCalledTimes(3);
      expect(mockGlueSend.mock.calls[0][0].input.RulesetNames).toEqual(["ci_env_activity_events_dq"]);
      expect(mockGlueSend.mock.calls[1][0].input.RulesetNames).toEqual(["ci_env_alarm_state_changes_dq"]);
      expect(mockGlueSend.mock.calls[2][0].input.RulesetNames).toEqual(["ci_env_dora_runs_dq"]);
      expect(mockGlueSend.mock.calls[0][0].input.AdditionalRunOptions).toEqual({ CloudWatchMetricsEnabled: true });
    });

    test("rethrows a Glue API error rather than continuing to the remaining targets", async () => {
      setValidEnv();
      mockS3Send.mockResolvedValue(listObjectsResponse([]));
      mockGlueSend.mockRejectedValueOnce(new Error("Glue is unavailable"));

      await expect(handler()).rejects.toThrow("Glue is unavailable");
      expect(mockGlueSend).toHaveBeenCalledTimes(1);
    });

    test("fails fast on missing configuration without calling S3 or Glue", async () => {
      await expect(handler()).rejects.toThrow(/Missing required environment variable/);
      expect(mockS3Send).not.toHaveBeenCalled();
      expect(mockGlueSend).not.toHaveBeenCalled();
    });

    test("does not start any evaluation run when partition registration fails", async () => {
      setValidEnv();
      mockS3Send.mockRejectedValue(new Error("access denied"));

      await expect(handler()).rejects.toThrow("access denied");
      expect(mockGlueSend).not.toHaveBeenCalled();
    });
  });
});
