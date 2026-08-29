// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const mockGlueSend = vi.fn();

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
  return { GlueClient, StartDataQualityRulesetEvaluationRunCommand };
});

const { handler, readConfig, buildEvaluationRunParams } = await import("../../functions/analytics/dataQualityRun.js");

const ENV_KEYS = [
  "GLUE_DATABASE_NAME",
  "GLUE_DATA_QUALITY_TABLE_NAME",
  "GLUE_DATA_QUALITY_RULESET_NAME",
  "GLUE_DATA_QUALITY_ROLE_ARN",
];

function setValidEnv() {
  process.env.GLUE_DATABASE_NAME = "ci_env_analytics";
  process.env.GLUE_DATA_QUALITY_TABLE_NAME = "activity_events";
  process.env.GLUE_DATA_QUALITY_RULESET_NAME = "ci_env_activity_events_dq";
  process.env.GLUE_DATA_QUALITY_ROLE_ARN = "arn:aws:iam::111111111111:role/ci-env-data-quality-run";
}

describe("dataQualityRun", () => {
  beforeEach(() => {
    mockGlueSend.mockReset();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  describe("readConfig", () => {
    test("reads all four required variables", () => {
      setValidEnv();
      expect(readConfig()).toEqual({
        databaseName: "ci_env_analytics",
        tableName: "activity_events",
        rulesetName: "ci_env_activity_events_dq",
        roleArn: "arn:aws:iam::111111111111:role/ci-env-data-quality-run",
      });
    });

    test("throws naming every missing variable rather than silently defaulting", () => {
      setValidEnv();
      delete process.env.GLUE_DATA_QUALITY_RULESET_NAME;
      delete process.env.GLUE_DATA_QUALITY_ROLE_ARN;

      expect(() => readConfig()).toThrow(/rulesetName, roleArn/);
    });
  });

  describe("buildEvaluationRunParams", () => {
    test("enables CloudWatch metrics and names the configured ruleset", () => {
      const params = buildEvaluationRunParams({
        databaseName: "ci_env_analytics",
        tableName: "activity_events",
        rulesetName: "ci_env_activity_events_dq",
        roleArn: "arn:aws:iam::111111111111:role/ci-env-data-quality-run",
      });

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

  describe("handler", () => {
    test("starts the evaluation run and returns its run id", async () => {
      setValidEnv();
      mockGlueSend.mockResolvedValue({ RunId: "dqrun-123" });

      const result = await handler();

      expect(result).toEqual({ runId: "dqrun-123" });
      expect(mockGlueSend).toHaveBeenCalledTimes(1);
      const command = mockGlueSend.mock.calls[0][0];
      expect(command.input.RulesetNames).toEqual(["ci_env_activity_events_dq"]);
      expect(command.input.AdditionalRunOptions).toEqual({ CloudWatchMetricsEnabled: true });
    });

    test("rethrows a Glue API error rather than returning success", async () => {
      setValidEnv();
      const apiError = new Error("Glue is unavailable");
      mockGlueSend.mockRejectedValue(apiError);

      await expect(handler()).rejects.toThrow("Glue is unavailable");
    });

    test("fails fast on missing configuration without calling Glue", async () => {
      await expect(handler()).rejects.toThrow(/Missing required environment variable/);
      expect(mockGlueSend).not.toHaveBeenCalled();
    });
  });
});
