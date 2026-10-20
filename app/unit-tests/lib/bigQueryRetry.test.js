// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";
import { withTransientRetry, isTransientBigQueryError } from "../../lib/bigQueryRetry.js";

function bigQueryError(reason, code = 400) {
  const error = new Error("The job encountered an error during execution. Retrying the job may solve the problem.");
  error.code = code;
  error.errors = [{ message: error.message, domain: "global", reason }];
  return error;
}

describe("bigQueryRetry", () => {
  test.each(["backendError", "jobBackendError", "rateLimitExceeded", "internalError"])("%s is transient", (reason) => {
    expect(isTransientBigQueryError(bigQueryError(reason))).toBe(true);
  });

  test("a top-level reason is read as well as the errors list", () => {
    expect(isTransientBigQueryError({ reason: "backendError" })).toBe(true);
  });

  test("an invalid query is not transient", () => {
    expect(isTransientBigQueryError(bigQueryError("invalidQuery"))).toBe(false);
  });

  test("an error without reasons is not transient", () => {
    expect(isTransientBigQueryError(new Error("boom"))).toBe(false);
  });

  test("a transient failure is retried once and the second result is returned", async () => {
    const run = vi.fn().mockRejectedValueOnce(bigQueryError("jobBackendError")).mockResolvedValueOnce("rows");

    await expect(withTransientRetry(run, { waitMs: 0 })).resolves.toBe("rows");
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("a non-transient failure is rethrown after one attempt", async () => {
    const error = bigQueryError("invalidQuery");
    const run = vi.fn().mockRejectedValue(error);

    await expect(withTransientRetry(run, { waitMs: 0 })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("a second transient failure is rethrown unchanged", async () => {
    const second = bigQueryError("backendError");
    const run = vi.fn().mockRejectedValueOnce(bigQueryError("backendError")).mockRejectedValueOnce(second);

    await expect(withTransientRetry(run, { waitMs: 0 })).rejects.toBe(second);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
