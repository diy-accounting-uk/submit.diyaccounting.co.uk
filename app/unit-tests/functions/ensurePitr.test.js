// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
  return { DynamoDBClient, UpdateContinuousBackupsCommand, DescribeContinuousBackupsCommand };
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
