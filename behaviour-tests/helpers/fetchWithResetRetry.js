// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/fetchWithResetRetry.js

const RESET_PATTERN = /ECONNRESET|socket hang up/i;
const RETRY_DELAY_MS = 200;
const CONTEXT_CLOSED_PATTERN = /Request context disposed|Target page, context or browser has been closed/i;

// True when the browser context closed while a route was still being served. The test has ended and no
// page waits for the answer, but Playwright fails the run for an error thrown in the route callback.
export function isContextClosedError(error) {
  return CONTEXT_CLOSED_PATTERN.test(String(error?.message ?? error));
}

// Calls route.fetch(), trying again when the connection was reset. Any other error throws at once.
export async function fetchWithResetRetry(route, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await route.fetch();
    } catch (error) {
      lastError = error;
      if (!RESET_PATTERN.test(String(error?.message ?? error))) throw error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw lastError;
}
