// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcFraudPreventionFeedback.js
// HMRC's fraud prevention header validation feedback for a sandbox sign-in. A module of its own so
// the HMRC grant route can call it without loading the HMRC API client.

import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../lib/logger.js";
import { putHmrcApiRequest } from "../data/dynamoDbHmrcApiRequestRepository.js";
import { integrationApi, recordedFetch } from "../lib/integrationCalls.js";

const logger = createLogger({ source: "app/services/hmrcFraudPreventionFeedback.js" });

/**
 * Get validation feedback for fraud prevention headers from HMRC test API.
 * This retrieves feedback on all requests made to a specific API.
 *
 * @param {string} api - The API name (e.g., 'vat-mtd')
 * @param {string} accessToken - HMRC OAuth access token
 * @param {string} auditForUserSub - User sub for auditing to DynamoDB
 * @param {string|null} requestId - Optional request ID to use for the validation request
 * @param {string|null} traceparent - Optional traceparent header for distributed tracing
 * @param {string|null} correlationId - Optional correlation ID for tracing
 * @returns {Promise<Object>} Validation feedback
 */
export async function getFraudPreventionHeadersFeedback(
  api,
  accessToken,
  auditForUserSub,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  const hmrcBase = process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk";
  const feedbackUrl = `${hmrcBase}/test/fraud-prevention-headers/${api}/validation-feedback`;

  const headers = {
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    "x-request-id": requestId,
    "traceparent": traceparent,
    "x-correlationid": correlationId,
  };

  logger.info({
    message: `Getting fraud prevention headers validation feedback`,
    url: feedbackUrl,
    api,
  });

  const httpRequest = { method: "GET", headers };
  let duration = 0;
  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));

  try {
    const startTime = Date.now();
    const response = await recordedFetch(
      feedbackUrl,
      { method: "GET", headers, signal: controller.signal },
      { org: "hmrc", target: "test", api: integrationApi("GET", feedbackUrl) },
    );
    duration = Date.now() - startTime;

    const responseBody = await response.json().catch(() => ({}));

    // Normalise response headers to a plain object (Headers is not marshallable)
    let responseHeadersObj = {};
    try {
      if (response && typeof response.headers?.forEach === "function") {
        response.headers.forEach((value, key) => {
          responseHeadersObj[key] = value;
        });
      } else if (response?.headers && typeof response.headers === "object") {
        responseHeadersObj = { ...response.headers };
      }
    } catch (error) {
      logger.error({
        message: "Error normalizing HMRC response headers",
        error: error.message,
        stack: error.stack,
      });
    }

    logger.info({
      message: `Fraud prevention header validation feedback response`,
      status: response.status,
      feedback: responseBody,
    });

    const httpResponse = {
      statusCode: response.status,
      headers: responseHeadersObj,
      body: responseBody,
    };
    const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
    try {
      // await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
      await putHmrcApiRequest(userSubOrUuid, { url: feedbackUrl, httpRequest, httpResponse, duration });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }

    return {
      ok: response.ok,
      status: response.status,
      feedback: responseBody,
    };
  } catch (error) {
    clearTimeout(timeout);
    logger.error({
      message: "Error getting fraud prevention headers validation feedback",
      error: error.message,
      stack: error.stack,
    });
    try {
      await putHmrcApiRequest(auditForUserSub, {
        url: feedbackUrl,
        httpRequest,
        httpResponse: { statusCode: 0, headers: {}, body: { error: error.message } },
        duration,
      });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }
    return {
      ok: false,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
