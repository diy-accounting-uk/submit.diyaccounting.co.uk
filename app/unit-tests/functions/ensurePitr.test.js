// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/ensurePitr.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
    send(command) {
      return mockSend(command);
    }
  }
  class UpdateContinuousBackupsCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DescribeContinuousBackupsCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DescribeTableCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { DynamoDBClient, UpdateContinuousBackupsCommand, DescribeContinuousBackupsCommand, DescribeTableCommand };
});

const { onEvent, isComplete } = await import("@app/functions/infra/ensurePitr.mjs");

function continuousBackupsUnavailableException() {
  const error = new Error("Backups are being enabled for the table");
  error.name = "ContinuousBackupsUnavailableException";
  return error;
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("ensurePitr onEvent", () => {
  test("Create calls UpdateContinuousBackups and returns the table's physical resource id", async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await onEvent({ RequestType: "Create", ResourceProperties: { TableName: "ci-env-receipts" } });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({
      TableName: "ci-env-receipts",
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
    expect(result.PhysicalResourceId).toBe("ci-env-receipts-pitr");
  });

  test("Create swallows ContinuousBackupsUnavailableException so the deployment does not fail on the race", async () => {
    mockSend.mockRejectedValueOnce(continuousBackupsUnavailableException());

    const result = await onEvent({ RequestType: "Create", ResourceProperties: { TableName: "ci-env-receipts" } });

    expect(result.PhysicalResourceId).toBe("ci-env-receipts-pitr");
  });

  test("Create re-throws any other DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("AccessDeniedException"));

    await expect(onEvent({ RequestType: "Create", ResourceProperties: { TableName: "ci-env-receipts" } })).rejects.toThrow(
      "AccessDeniedException",
    );
  });

  test("Delete is a no-op that returns the existing physical resource id", async () => {
    const result = await onEvent({
      RequestType: "Delete",
      PhysicalResourceId: "ci-env-receipts-pitr",
      ResourceProperties: { TableName: "ci-env-receipts" },
    });

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.PhysicalResourceId).toBe("ci-env-receipts-pitr");
  });
});

describe("ensurePitr isComplete", () => {
  test("backups still enabling reports not complete and does not retry the update", async () => {
    mockSend.mockResolvedValueOnce({
      ContinuousBackupsDescription: { ContinuousBackupsStatus: "ENABLING" },
    });

    const result = await isComplete({ RequestType: "Create", ResourceProperties: { TableName: "ci-env-receipts" } });

    expect(result.IsComplete).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("backups enabled but PITR still disabled retries the update and reports not complete", async () => {
    mockSend
      .mockResolvedValueOnce({
        ContinuousBackupsDescription: {
          ContinuousBackupsStatus: "ENABLED",
          PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus: "DISABLED" },
        },
      })
      .mockResolvedValueOnce({});

    const result = await isComplete({ RequestType: "Create", ResourceProperties: { TableName: "ci-env-receipts" } });

    expect(result.IsComplete).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].input).toEqual({
      TableName: "ci-env-receipts",
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  test("PITR enabled reports complete", async () => {
    mockSend.mockResolvedValueOnce({
      ContinuousBackupsDescription: {
        ContinuousBackupsStatus: "ENABLED",
        PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus: "ENABLED" },
      },
    });

    const result = await isComplete({ RequestType: "Create", ResourceProperties: { TableName: "ci-env-receipts" } });

    expect(result.IsComplete).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("Delete reports complete without describing the table", async () => {
    const result = await isComplete({
      RequestType: "Delete",
      ResourceProperties: { TableName: "ci-env-receipts" },
    });

    expect(result.IsComplete).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("a table-active wait", () => {
  const activeWait = (RequestType) => ({ RequestType, ResourceProperties: { TableName: "ci-env-cache", Wait: "TableActive" } });

  test("onEvent changes nothing on the table and names the wait", async () => {
    const result = await onEvent(activeWait("Create"));

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.PhysicalResourceId).toBe("ci-env-cache-active");
  });

  test("isComplete is false while DescribeTable reports the table CREATING", async () => {
    mockSend.mockResolvedValueOnce({ Table: { TableStatus: "CREATING" } });

    const result = await isComplete(activeWait("Create"));

    expect(mockSend.mock.calls[0][0].input).toEqual({ TableName: "ci-env-cache" });
    expect(result).toEqual({ IsComplete: false });
  });

  test("isComplete is true once DescribeTable reports the table ACTIVE", async () => {
    mockSend.mockResolvedValueOnce({ Table: { TableStatus: "ACTIVE" } });

    expect(await isComplete(activeWait("Update"))).toEqual({ IsComplete: true });
  });

  test("Delete completes at once without a call", async () => {
    expect(await onEvent({ ...activeWait("Delete"), PhysicalResourceId: "ci-env-cache-active" })).toEqual({
      PhysicalResourceId: "ci-env-cache-active",
    });
    expect(await isComplete(activeWait("Delete"))).toEqual({ IsComplete: true });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
