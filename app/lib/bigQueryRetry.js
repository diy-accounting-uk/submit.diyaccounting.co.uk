// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/bigQueryRetry.js

import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/bigQueryRetry.js" });

// The reasons Google documents as worth retrying: BigQuery's own error message says "Retrying
// may solve the problem" for these.
const TRANSIENT_REASONS = new Set(["backendError", "jobBackendError", "rateLimitExceeded", "internalError"]);

const DEFAULT_WAIT_MS = 5000;

export function isTransientBigQueryError(error) {
  const reasons = [error?.reason, ...(Array.isArray(error?.errors) ? error.errors.map((entry) => entry?.reason) : [])];
  return reasons.some((reason) => TRANSIENT_REASONS.has(reason));
}

/**
 * Run a BigQuery job function; when it throws a transient error, wait and run it again.
 * Any other error, or a transient error on the last attempt, is rethrown unchanged.
 *
 * @param {() => Promise<T>} run creates the job and reads its results as one unit
 * @param {{attempts?: number, waitMs?: number, description?: string}} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function withTransientRetry(run, { attempts = 2, waitMs = DEFAULT_WAIT_MS, description = "BigQuery job" } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransientBigQueryError(error)) throw error;
      const reason = error.errors?.[0]?.reason ?? error.reason;
      logger.warn({ message: "Transient BigQuery error; retrying the job", reason, description, attempt });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
