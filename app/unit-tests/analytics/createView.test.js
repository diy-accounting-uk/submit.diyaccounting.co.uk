// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

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
}));

import { onEvent, isComplete } from "@app/functions/analytics/createView.js";

function resourceProperties(overrides = {}) {
  return {
    ViewName: "v_returning_submitters_quarterly",
    Sql: "CREATE OR REPLACE VIEW v_returning_submitters_quarterly AS SELECT 1",
    Database: "prod_env_analytics",
    WorkGroup: "prod-env-analytics",
    ...overrides,
  };
}

beforeEach(() => {
  mockAthenaSend.mockReset();
});

describe("onEvent", () => {
  test("submits the view's SQL and carries the query execution id forward as Data, on Create", async () => {
    mockAthenaSend.mockResolvedValueOnce({ QueryExecutionId: "abc-123" });

    const result = await onEvent({ RequestType: "Create", ResourceProperties: resourceProperties() });

    expect(mockAthenaSend).toHaveBeenCalledTimes(1);
    const command = mockAthenaSend.mock.calls[0][0];
    expect(command.input).toEqual({
      QueryString: resourceProperties().Sql,
      QueryExecutionContext: { Database: "prod_env_analytics" },
      WorkGroup: "prod-env-analytics",
    });
    expect(result).toEqual({
      PhysicalResourceId: "v_returning_submitters_quarterly-view",
      Data: { QueryExecutionId: "abc-123" },
    });
  });

  test("resubmits on Update with the same fixed physical resource id, so the resource is not replaced", async () => {
    mockAthenaSend.mockResolvedValueOnce({ QueryExecutionId: "def-456" });

    const result = await onEvent({ RequestType: "Update", ResourceProperties: resourceProperties() });

    expect(result.PhysicalResourceId).toBe("v_returning_submitters_quarterly-view");
  });

  test("does nothing on Delete", async () => {
    const result = await onEvent({
      RequestType: "Delete",
      PhysicalResourceId: "v_returning_submitters_quarterly-view",
      ResourceProperties: resourceProperties(),
    });

    expect(mockAthenaSend).not.toHaveBeenCalled();
    expect(result).toEqual({ PhysicalResourceId: "v_returning_submitters_quarterly-view" });
  });
});

describe("isComplete", () => {
  test("reports complete once the query succeeds", async () => {
    mockAthenaSend.mockResolvedValueOnce({ QueryExecution: { Status: { State: "SUCCEEDED" } } });

    const result = await isComplete({
      RequestType: "Create",
      ResourceProperties: resourceProperties(),
      Data: { QueryExecutionId: "abc-123" },
    });

    expect(result).toEqual({ IsComplete: true });
  });

  test("reports not complete while the query is still running, without throwing", async () => {
    mockAthenaSend.mockResolvedValueOnce({ QueryExecution: { Status: { State: "RUNNING" } } });

    const result = await isComplete({
      RequestType: "Create",
      ResourceProperties: resourceProperties(),
      Data: { QueryExecutionId: "abc-123" },
    });

    expect(result).toEqual({ IsComplete: false });
  });

  test("throws with the Athena StateChangeReason when the query fails", async () => {
    mockAthenaSend.mockResolvedValueOnce({
      QueryExecution: {
        Status: {
          State: "FAILED",
          StateChangeReason:
            "TABLE_NOT_FOUND: line 1:15: Table 'awsdatacatalog.prod_env_analytics.v_ga4_funnel_daily' does not exist",
        },
      },
    });

    await expect(
      isComplete({
        RequestType: "Create",
        ResourceProperties: resourceProperties(),
        Data: { QueryExecutionId: "abc-123" },
      }),
    ).rejects.toThrow(/TABLE_NOT_FOUND/);
  });

  test("throws on a cancelled query even without a StateChangeReason", async () => {
    mockAthenaSend.mockResolvedValueOnce({ QueryExecution: { Status: { State: "CANCELLED" } } });

    await expect(
      isComplete({
        RequestType: "Create",
        ResourceProperties: resourceProperties(),
        Data: { QueryExecutionId: "abc-123" },
      }),
    ).rejects.toThrow(/CANCELLED/);
  });

  test("reports complete on Delete without calling Athena", async () => {
    const result = await isComplete({
      RequestType: "Delete",
      ResourceProperties: resourceProperties(),
      Data: {},
    });

    expect(mockAthenaSend).not.toHaveBeenCalled();
    expect(result).toEqual({ IsComplete: true });
  });
});
