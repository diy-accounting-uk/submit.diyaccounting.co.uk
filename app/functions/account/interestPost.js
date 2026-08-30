// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/interestPost.js

import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { publishActivityEvent, maskEmail } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/account/interestPost.js" });

const snsClient = new SNSClient({ region: process.env.AWS_REGION || "eu-west-2" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/interest", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/interest", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  const { request, requestId } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // If HEAD request, return 200 OK immediately
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Processing feedback engagement request", requestId });

  // Extract email from JWT authorizer context
  const user = extractUserFromAuthorizerContext(event);
  const email = user?.email;

  if (!email) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Email not found in authentication context",
    });
  }

  const topicArn = process.env.FEEDBACK_TOPIC_ARN;
  if (!topicArn) {
    logger.error({ message: "FEEDBACK_TOPIC_ARN environment variable is not set" });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Feedback engagement service not configured",
      error: "FEEDBACK_TOPIC_ARN not set",
    });
  }

  try {
    const timestamp = new Date().toISOString();
    await snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: "Feedback engagement",
        Message: `New feedback engagement:\n\nEmail: ${email}\nTimestamp: ${timestamp}`,
      }),
    );

    logger.info({ message: "Feedback engagement published to SNS", email, requestId });
    await publishActivityEvent({
      event: "feedback-engagement-registered",
      summary: "Feedback: " + maskEmail(email),
      userSub: user?.sub,
      detail: { email: maskEmail(email) },
    });

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { registered: true },
    });
  } catch (error) {
    logger.error({ message: "Failed to publish feedback engagement", error: error.message, stack: error.stack });

    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Failed to register interest",
      error: error.message,
    });
  }
}
