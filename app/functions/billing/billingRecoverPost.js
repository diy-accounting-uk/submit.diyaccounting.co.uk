// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingRecoverPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";

const logger = createLogger({ source: "app/functions/billing/billingRecoverPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/billing/recover", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  extractRequest(event);
  logger.info({ message: "Billing recover endpoint - not yet implemented" });

  return {
    statusCode: 501,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Not implemented" }),
  };
}
