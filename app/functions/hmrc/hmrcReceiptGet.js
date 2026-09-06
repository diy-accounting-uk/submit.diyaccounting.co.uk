// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/hmrc/hmrcReceiptGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http500ServerErrorResponse,
  buildValidationError,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserSub } from "../../lib/jwtHelper.js";
import { getReceipt, listUserReceipts } from "../../data/dynamoDbReceiptRepository.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcReceiptGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/hmrc/receipt", ingestHandler);
  registerLambdaRoute(app, "get", `/api/v1/hmrc/receipt/:name`, ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/hmrc/receipt", ingestHandler);
  registerLambdaRoute(app, "head", `/api/v1/hmrc/receipt/:name`, ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages, userSub) {
  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const { name, key: providedKey } = { ...pathParams, ...queryParams };

  // Determine if this is a list or single-item request
  const hasNameOrKey = Boolean(name || providedKey);

  if (hasNameOrKey) {
    // Single item validation
    let receiptId;
    let Key; // Legacy S3-style key for compatibility
    if (providedKey) {
      if (!providedKey.startsWith(`receipts/${userSub}/`) || providedKey.includes("..")) {
        errorMessages.push("Invalid or forbidden key parameter");
      }
      Key = providedKey;
      // Extract receiptId from key: receipts/{userSub}/{receiptId}.json
      const parts = providedKey.split("/");
      receiptId = parts[parts.length - 1].replace(".json", "");
    } else if (name) {
      if (!/^[^/]+\.json$/.test(name)) {
        errorMessages.push("Invalid name format - must be a filename ending in .json");
      }
      receiptId = name.replace(".json", "");
      Key = `receipts/${userSub}/${name}`;
    }
    return { hasNameOrKey, receiptId, Key };
  }

  return { hasNameOrKey: false };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["RECEIPTS_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Check authentication
  const userSub = getUserSub(event || {});
  if (!userSub) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  const errorMessages = [];

  // Extract and validate parameters
  const { hasNameOrKey, receiptId, Key } = extractAndValidateParameters(event, errorMessages, userSub);

  // Validation errors
  if (errorMessages.length > 0) {
    // Check for forbidden error specifically
    if (errorMessages.some((msg) => msg.includes("forbidden"))) {
      return http403ForbiddenResponse({
        request,
        headers: { ...responseHeaders },
        message: "Forbidden",
      });
    }
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    if (hasNameOrKey) {
      logger.info({ message: "Retrieving single receipt", receiptId, key: Key });
      const receipt = await getReceiptByReceiptId(userSub, receiptId);
      return {
        statusCode: 200,
        headers: { ...responseHeaders },
        body: JSON.stringify(receipt),
      };
    } else {
      logger.info({ message: "Listing user receipts", userSub });
      const receipts = await listUserReceipts(userSub);
      return http200OkResponse({
        request,
        headers: { ...responseHeaders },
        data: { receipts },
      });
    }
  } catch (error) {
    logger.error({ message: "Error retrieving receipts", error: error.message, stack: error.stack });
    // Check if this is a not found error
    if (error.message && error.message.includes("not found")) {
      return buildValidationError(request, ["Receipt not found"], responseHeaders);
    }
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getReceiptByReceiptId(userSub, receiptId) {
  try {
    const receipt = await getReceipt(userSub, receiptId);
    if (!receipt) {
      throw new Error("Receipt not found");
    }
    return receipt;
  } catch (e) {
    if (e.message === "Receipt not found") {
      throw e;
    }
    throw new Error(`Failed to get receipt: ${e?.message || String(e)}`);
  }
}
