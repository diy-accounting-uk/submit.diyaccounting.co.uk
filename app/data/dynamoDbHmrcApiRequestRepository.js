// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbHmrcApiRequestRepository.js

import { createLogger, context } from "../lib/logger.js";
import { hashSub, getSaltVersion } from "../services/subHasher.js";
import { maskHttpData } from "../lib/dataMasking.js";
import { v4 as uuidv4 } from "uuid";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTwentyEightDayTtl } from "../lib/dateUtils.js";

const logger = createLogger({ source: "app/data/dynamoDbHmrcApiRequestRepository.js" });

/*
Example data:
  let duration = 0;
  const httpRequest = {
    method: "POST",
    headers: { ...requestHeaders },
    body: requestBody,
  };
  const httpResponse = {
    statusCode: response.status,
    headers: response.headers ?? {},
    body: responseTokens,
  };
 */
export async function putHmrcApiRequest(userSub, { url, httpRequest, httpResponse, duration }) {
  const hashedSub = hashSub(userSub);
  const method = httpRequest && httpRequest.method ? httpRequest.method : "UNKNOWN";
  logger.info({
    message: `DynamoDB enabled, proceeding with putHmrcApiRequest [table: ${process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME}]`,
    hashedSub,
    url,
    method,
  });

  const amznTraceId = context.get("amznTraceId");
  const traceparent = context.get("traceparent");
  const correlationId = context.get("requestId") || `req-${uuidv4()}`;
  const id = `hmrcreq-${uuidv4()}`; // Unique ID for this specific call

  try {
    const tableName = getResourceName("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME");

    const now = new Date();

    // Mask sensitive data before persisting to DynamoDB
    // This prevents leakage of credentials, tokens, and passwords in audit logs
    const maskedHttpRequest = maskHttpData(httpRequest);
    const maskedHttpResponse = maskHttpData(httpResponse);

    const item = {
      hashedSub,
      id,
      requestId: correlationId,
      amznTraceId,
      traceparent,
      url,
      method,
      httpRequest: maskedHttpRequest,
      httpResponse: maskedHttpResponse,
      duration,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    // Calculate TTL as 28 days
    const { ttl, ttl_datestamp } = calculateTwentyEightDayTtl(now);
    item.ttl = ttl;
    item.ttl_datestamp = ttl_datestamp;

    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: item,
        }),
    );

    logger.info({
      message: "HmrcApiRequest stored in DynamoDB",
      hashedSub,
      url,
      method,
    });
  } catch (error) {
    logger.error({
      message: "Error storing HmrcApiRequest in DynamoDB",
      error: error.message,
      hashedSub,
      url,
      method,
    });
    throw error;
  }
}
