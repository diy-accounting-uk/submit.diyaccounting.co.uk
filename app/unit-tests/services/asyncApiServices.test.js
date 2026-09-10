// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the async request repository so we can control write ordering directly.
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  putAsyncRequest: vi.fn().mockResolvedValue(undefined),
  getAsyncRequest: vi.fn().mockResolvedValue(null),
}));

const { putAsyncRequest } = await import("../../data/dynamoDbAsyncRequestRepository.js");
const { initiateProcessing } = await import("../../services/asyncApiServices.js");

describe("initiateProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not start the background processor until the processing marker write has landed", async () => {
    let resolveProcessingWrite;
    const processingWritten = new Promise((resolve) => {
      resolveProcessingWrite = resolve;
    });

    putAsyncRequest.mockImplementation((userId, requestId, status) => {
      if (status === "processing") return processingWritten;
      return Promise.resolve();
    });

    let processorStarted = false;
    const processor = vi.fn(async () => {
      processorStarted = true;
      return { ok: true };
    });

    const initiatePromise = initiateProcessing({
      processor,
      userId: "user1",
      requestId: "req1",
      waitTimeMs: 0,
      payload: {},
      tableName: "async-requests-table",
      queueUrl: "none",
      maxWaitMs: 25000,
    });

    // Let a few microtask turns pass without resolving the "processing" write. If the
    // write were fire-and-forget, the processor would already have run by now.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(processorStarted).toBe(false);

    resolveProcessingWrite();
    await initiatePromise;
    // Let the now-unblocked background processing run to completion.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(processorStarted).toBe(true);
  });

  it("writes the processing marker before the processor's own completion write, so a fast processor cannot revert a completed status back to processing", async () => {
    const writeOrder = [];
    let resolveProcessingWrite;
    const processingWritten = new Promise((resolve) => {
      resolveProcessingWrite = resolve;
    });

    putAsyncRequest.mockImplementation((userId, requestId, status) => {
      writeOrder.push(status);
      if (status === "processing") return processingWritten;
      return Promise.resolve();
    });

    // A processor fast enough to resolve on the very next microtask turn, simulating a
    // cheap HMRC validation error (e.g. VRN_INVALID) that never touches the network.
    const processor = vi.fn(async () => ({ hmrcResponse: { ok: false }, hmrcResponseBody: { code: "VRN_INVALID" } }));

    const initiatePromise = initiateProcessing({
      processor,
      userId: "user1",
      requestId: "req1",
      waitTimeMs: 0,
      payload: {},
      tableName: "async-requests-table",
      queueUrl: "none",
      maxWaitMs: 25000,
    });

    resolveProcessingWrite();
    await initiatePromise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeOrder[0]).toBe("processing");
    expect(writeOrder[writeOrder.length - 1]).toBe("completed");
  });
});
