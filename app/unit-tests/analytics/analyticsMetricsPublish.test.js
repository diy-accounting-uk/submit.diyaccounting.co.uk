// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockAthenaSend = vi.fn();
vi.mock("@aws-sdk/client-athena", () => ({
  AthenaClient: class {
    send(...args) {
      return mockAthenaSend(...args);
    }
  },
  StartQueryExecutionCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  GetQueryExecutionCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  GetQueryResultsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockCloudWatchSend = vi.fn();
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send(...args) {
      return mockCloudWatchSend(...args);
    }
  },
  PutMetricDataCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  handler,
  defaultTargetDate,
  defaultReconciliationDate,
  pollUntilTerminal,
  parseResultSet,
  runAthenaQuery,
  toMetricData,
  publishMetricData,
  METRIC_DEFINITIONS,
  METRICS_NAMESPACE,
} from "@app/functions/analytics/analyticsMetricsPublish.js";

function varchar(value) {
  return { VarCharValue: value };
}

function resultSetOf(header, rows) {
  return {
    Rows: [{ Data: header.map(varchar) }, ...rows.map((row) => ({ Data: row.map(varchar) }))],
  };
}

/** Queues up SUCCEEDED replies for every query the handler will run, each with an empty
 * result set, routed purely by the command's constructor name. */
function mockAllQueriesSucceedEmpty() {
  mockAthenaSend.mockImplementation((command) => {
    switch (command.constructor.name) {
      case "StartQueryExecutionCommand":
        return Promise.resolve({ QueryExecutionId: "qid" });
      case "GetQueryExecutionCommand":
        return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
      case "GetQueryResultsCommand":
        return Promise.resolve({ ResultSet: { Rows: [] } });
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  });
}

describe("analyticsMetricsPublish", () => {
  beforeEach(() => {
    mockAthenaSend.mockReset();
    mockCloudWatchSend.mockReset();
    mockCloudWatchSend.mockResolvedValue({});

    process.env.ATHENA_WORK_GROUP_NAME = "test-workgroup";
    process.env.GLUE_DATABASE_NAME = "test_env_analytics";
    process.env.ATHENA_POLL_INTERVAL_MS = "1";
    process.env.ATHENA_POLL_MAX_ATTEMPTS = "3";
  });

  afterEach(() => {
    delete process.env.ATHENA_WORK_GROUP_NAME;
    delete process.env.GLUE_DATABASE_NAME;
    delete process.env.ATHENA_POLL_INTERVAL_MS;
    delete process.env.ATHENA_POLL_MAX_ATTEMPTS;
    vi.restoreAllMocks();
  });

  describe("defaultTargetDate", () => {
    test("returns yesterday in UTC as YYYY-MM-DD", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-29T05:00:00Z"));
      expect(defaultTargetDate()).toBe("2026-08-28");
      vi.useRealTimers();
    });
  });

  describe("defaultReconciliationDate", () => {
    test("returns two days ago in UTC as YYYY-MM-DD", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-29T05:00:00Z"));
      expect(defaultReconciliationDate()).toBe("2026-08-27");
      vi.useRealTimers();
    });
  });

  describe("parseResultSet", () => {
    test("maps the header row onto each data row", () => {
      const resultSet = resultSetOf(["outcome", "submissions"], [["success", "12"], ["failure", "3"]]);
      expect(parseResultSet(resultSet)).toEqual([
        { outcome: "success", submissions: "12" },
        { outcome: "failure", submissions: "3" },
      ]);
    });

    test("returns an empty array for a result set with no rows", () => {
      expect(parseResultSet({ Rows: [] })).toEqual([]);
      expect(parseResultSet({})).toEqual([]);
    });
  });

  describe("toMetricData", () => {
    const timestamp = new Date("2026-08-28T00:00:00Z");

    test("builds one datum per row, with the dimension when the definition has one", () => {
      const definition = METRIC_DEFINITIONS.find((d) => d.metricName === "Submissions");
      const rows = [
        { outcome: "success", submissions: "12" },
        { outcome: "failure", submissions: "3" },
      ];

      expect(toMetricData(definition, rows, timestamp)).toEqual([
        {
          MetricName: "Submissions",
          Value: 12,
          Unit: "Count",
          Timestamp: timestamp,
          Dimensions: [{ Name: "Outcome", Value: "success" }],
        },
        {
          MetricName: "Submissions",
          Value: 3,
          Unit: "Count",
          Timestamp: timestamp,
          Dimensions: [{ Name: "Outcome", Value: "failure" }],
        },
      ]);
    });

    test("carries no dimensions for a definition with none", () => {
      const definition = METRIC_DEFINITIONS.find((d) => d.metricName === "ActiveUsers");
      const rows = [{ active_users: "42" }];

      expect(toMetricData(definition, rows, timestamp)).toEqual([
        { MetricName: "ActiveUsers", Value: 42, Unit: "Count", Timestamp: timestamp, Dimensions: [] },
      ]);
    });

    test("skips a row whose value column is null rather than publishing zero", () => {
      const definition = METRIC_DEFINITIONS.find((d) => d.metricName === "ActiveUsers");
      const rows = [{ active_users: null }];

      expect(toMetricData(definition, rows, timestamp)).toEqual([]);
    });

    test.each(["Ga4Purchases", "StripePaidCharges", "ActivityActivations"])(
      "%s reads its view's coalesced zero, not an absent value",
      (metricName) => {
        const definition = METRIC_DEFINITIONS.find((d) => d.metricName === metricName);
        const column = definition.valueColumn;

        // v_purchase_reconciliation_daily's FULL JOIN + coalesce means a day with a row always
        // carries a numeric string for every one of the three counts, "0" included when that
        // source had nothing that day - never null. A published zero here is the correct
        // reading of "no purchases from this source", not the query-failed case toMetricData
        // otherwise guards against by skipping null.
        expect(toMetricData(definition, [{ [column]: "0" }], timestamp)).toEqual([
          { MetricName: metricName, Value: 0, Unit: "Count", Timestamp: timestamp, Dimensions: [] },
        ]);

        expect(toMetricData(definition, [{ [column]: "7" }], timestamp)).toEqual([
          { MetricName: metricName, Value: 7, Unit: "Count", Timestamp: timestamp, Dimensions: [] },
        ]);
      },
    );

    test("reconciliation metrics carry no dimension: the gap columns are not published", () => {
      for (const metricName of ["Ga4Purchases", "StripePaidCharges", "ActivityActivations"]) {
        const definition = METRIC_DEFINITIONS.find((d) => d.metricName === metricName);
        expect(definition.dimension).toBeNull();
        expect(definition.sql("2026-08-28")).not.toMatch(/minus/i);
      }
    });
  });

  describe("pollUntilTerminal", () => {
    test("returns once the execution reaches SUCCEEDED", async () => {
      mockAthenaSend
        .mockResolvedValueOnce({ QueryExecution: { Status: { State: "RUNNING" } } })
        .mockResolvedValueOnce({ QueryExecution: { Status: { State: "SUCCEEDED" } } });

      await expect(pollUntilTerminal({ send: mockAthenaSend }, "qid")).resolves.toBeUndefined();
      expect(mockAthenaSend).toHaveBeenCalledTimes(2);
    });

    test("throws when the execution reaches FAILED", async () => {
      mockAthenaSend.mockResolvedValueOnce({
        QueryExecution: { Status: { State: "FAILED", StateChangeReason: "table not found" } },
      });

      await expect(pollUntilTerminal({ send: mockAthenaSend }, "qid")).rejects.toThrow(/FAILED: table not found/);
    });

    test("throws once the attempt budget is exhausted", async () => {
      mockAthenaSend.mockResolvedValue({ QueryExecution: { Status: { State: "RUNNING" } } });

      await expect(pollUntilTerminal({ send: mockAthenaSend }, "qid")).rejects.toThrow(
        /did not reach a terminal state/,
      );
      expect(mockAthenaSend).toHaveBeenCalledTimes(3);
    });
  });

  describe("runAthenaQuery", () => {
    test("starts the query, polls to completion, then reads the results", async () => {
      mockAthenaSend
        .mockResolvedValueOnce({ QueryExecutionId: "qid-123" })
        .mockResolvedValueOnce({ QueryExecution: { Status: { State: "SUCCEEDED" } } })
        .mockResolvedValueOnce({ ResultSet: resultSetOf(["active_users"], [["7"]]) });

      const rows = await runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" });

      expect(rows).toEqual([{ active_users: "7" }]);
      expect(mockAthenaSend).toHaveBeenCalledTimes(3);
      expect(mockAthenaSend.mock.calls[0][0].input).toEqual({
        QueryString: "SELECT 1",
        QueryExecutionContext: { Database: "db" },
        WorkGroup: "wg",
      });
    });

    test("propagates a query failure without reading results", async () => {
      mockAthenaSend
        .mockResolvedValueOnce({ QueryExecutionId: "qid-123" })
        .mockResolvedValueOnce({ QueryExecution: { Status: { State: "FAILED", StateChangeReason: "boom" } } });

      await expect(runAthenaQuery({ workGroup: "wg", database: "db", sql: "SELECT 1" })).rejects.toThrow(/boom/);
      expect(mockAthenaSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("publishMetricData", () => {
    test("does nothing for an empty list", async () => {
      await publishMetricData([], METRICS_NAMESPACE);
      expect(mockCloudWatchSend).not.toHaveBeenCalled();
    });

    test("sends everything in one call when at or under the batch size", async () => {
      const datums = Array.from({ length: 5 }, (_, i) => ({ MetricName: `M${i}` }));
      await publishMetricData(datums, METRICS_NAMESPACE);

      expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
      expect(mockCloudWatchSend.mock.calls[0][0].input).toEqual({
        Namespace: METRICS_NAMESPACE,
        MetricData: datums,
      });
    });

    test("splits more than 20 datums into multiple PutMetricData calls", async () => {
      const datums = Array.from({ length: 45 }, (_, i) => ({ MetricName: `M${i}` }));
      await publishMetricData(datums, METRICS_NAMESPACE);

      expect(mockCloudWatchSend).toHaveBeenCalledTimes(3);
      expect(mockCloudWatchSend.mock.calls[0][0].input.MetricData).toHaveLength(20);
      expect(mockCloudWatchSend.mock.calls[1][0].input.MetricData).toHaveLength(20);
      expect(mockCloudWatchSend.mock.calls[2][0].input.MetricData).toHaveLength(5);
    });
  });

  describe("handler", () => {
    test("requires the workgroup and database environment variables", async () => {
      delete process.env.ATHENA_WORK_GROUP_NAME;
      await expect(handler({ date: "2026-08-28" })).rejects.toThrow(/ATHENA_WORK_GROUP_NAME/);

      process.env.ATHENA_WORK_GROUP_NAME = "test-workgroup";
      delete process.env.GLUE_DATABASE_NAME;
      await expect(handler({ date: "2026-08-28" })).rejects.toThrow(/GLUE_DATABASE_NAME/);
    });

    test("runs one query per metric definition and publishes nothing when every result is empty", async () => {
      mockAllQueriesSucceedEmpty();

      const result = await handler({ date: "2026-08-28" });

      expect(result).toEqual({ date: "2026-08-28", metricsPublished: 0 });
      // 3 Athena calls per definition (start, poll, results).
      expect(mockAthenaSend).toHaveBeenCalledTimes(METRIC_DEFINITIONS.length * 3);
      expect(mockCloudWatchSend).not.toHaveBeenCalled();
    });

    test("uses the explicit event date over yesterday, for every definition including the reconciliation trio", async () => {
      mockAllQueriesSucceedEmpty();

      await handler({ date: "2020-01-01" });

      const startCalls = mockAthenaSend.mock.calls.filter(
        ([command]) => command.constructor.name === "StartQueryExecutionCommand",
      );
      expect(startCalls).toHaveLength(METRIC_DEFINITIONS.length);
      for (const [command] of startCalls) {
        expect(command.input.QueryString).toContain("2020-01-01");
      }
    });

    test("on the unmanned default, queries the reconciliation trio two days ago and everything else yesterday", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-29T05:00:00Z"));
      mockAllQueriesSucceedEmpty();

      await handler();

      vi.useRealTimers();

      const startCalls = mockAthenaSend.mock.calls.filter(
        ([command]) => command.constructor.name === "StartQueryExecutionCommand",
      );
      const reconciliationNames = ["Ga4Purchases", "StripePaidCharges", "ActivityActivations"];
      METRIC_DEFINITIONS.forEach((definition, index) => {
        const expectedDate = reconciliationNames.includes(definition.metricName) ? "2026-08-27" : "2026-08-28";
        expect(startCalls[index][0].input.QueryString).toContain(expectedDate);
      });
    });

    test("maps a successful result set to a published metric and stops on the first failing query", async () => {
      // ActiveUsers is the first definition: succeeds with one row. The second definition
      // (Submissions) fails, so the run must throw before publishing anything, including the
      // ActiveUsers datum already computed.
      let callIndex = 0;
      mockAthenaSend.mockImplementation((command) => {
        callIndex += 1;
        const name = command.constructor.name;
        if (name === "StartQueryExecutionCommand") return Promise.resolve({ QueryExecutionId: `qid-${callIndex}` });
        if (name === "GetQueryExecutionCommand") {
          if (callIndex === 2) return Promise.resolve({ QueryExecution: { Status: { State: "SUCCEEDED" } } });
          return Promise.resolve({
            QueryExecution: { Status: { State: "FAILED", StateChangeReason: "glue table missing" } },
          });
        }
        if (name === "GetQueryResultsCommand") {
          return Promise.resolve({ ResultSet: resultSetOf(["active_users"], [["9"]]) });
        }
        throw new Error(`unexpected command ${name}`);
      });

      await expect(handler({ date: "2026-08-28" })).rejects.toThrow(/glue table missing/);
      expect(mockCloudWatchSend).not.toHaveBeenCalled();
    });
  });
});
