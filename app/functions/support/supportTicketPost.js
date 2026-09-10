// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/support/supportTicketPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { appendAutomationDisclosure } from "../../lib/gitHubHelpers.js";

const logger = createLogger({ source: "app/functions/support/supportTicketPost.js" });

// Cache the GitHub token to avoid fetching from Secrets Manager on every request
let __cachedGitHubToken = null;

/**
 * Fetch GitHub PAT from AWS Secrets Manager
 */
async function getGitHubToken() {
  if (__cachedGitHubToken) {
    logger.debug({ message: "Using cached GitHub token" });
    return __cachedGitHubToken;
  }

  const secretArn = process.env.GITHUB_TOKEN_SECRET_ARN;
  if (!secretArn) {
    throw new Error("GITHUB_TOKEN_SECRET_ARN environment variable is required");
  }

  logger.info({ message: "Fetching GitHub token from Secrets Manager", secretArn });

  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));

  if (!response.SecretString) {
    throw new Error(`Secret ${secretArn} exists but has no SecretString value`);
  }

  __cachedGitHubToken = response.SecretString;
  logger.info({ message: "GitHub token successfully fetched and cached" });
  return __cachedGitHubToken;
}

/**
 * Create a GitHub issue via the GitHub API
 */
async function createGitHubIssue({ title, body, labels }) {
  const githubToken = await getGitHubToken();
  const githubRepo = process.env.GITHUB_REPO;

  if (!githubRepo) {
    throw new Error("GITHUB_REPO environment variable is required");
  }

  const response = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ message: "GitHub API error", status: response.status, error: errorText });
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/support/ticket", ingestHandler);
  app.head("/api/v1/support/ticket", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["GITHUB_TOKEN_SECRET_ARN", "GITHUB_REPO"]);

  const { request, requestId } = extractRequest(event);

  // If HEAD request, return 200 OK immediately
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Processing support ticket request", requestId });

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Get client info from headers (for logging/tracking, not authentication)
  const clientIp = event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";

  // Parse and validate request body
  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Invalid JSON in request body",
    });
  }

  const { subject, description, category } = requestBody || {};

  if (!subject || !description || !category) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Missing required fields: subject, description, category",
    });
  }

  // Validate field lengths
  if (subject.length > 100) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Subject must be 100 characters or less",
    });
  }

  if (description.length > 2000) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Description must be 2000 characters or less",
    });
  }

  const validCategories = ["connection", "submission", "bundles", "receipts", "other"];
  if (!validCategories.includes(category)) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
    });
  }

  // Build the GitHub issue
  const categoryLabels = {
    connection: "connection",
    submission: "submission",
    bundles: "bundles",
    receipts: "receipts",
    other: "general",
  };

  const issueTitle = `[Support] ${subject}`;
  const issueBodyContent = `## Support Request

**Category:** ${category}
**Submitted:** ${new Date().toISOString()}
**Request ID:** ${requestId}

---

${description}`;

  const issueBody = appendAutomationDisclosure(issueBodyContent);
  const labels = ["support", categoryLabels[category]];

  try {
    logger.info({ message: "Creating GitHub issue", subject, category, clientIp });

    const issue = await createGitHubIssue({
      title: issueTitle,
      body: issueBody,
      labels,
    });

    logger.info({ message: "GitHub issue created successfully", issueNumber: issue.number, issueUrl: issue.html_url });
    await publishActivityEvent({
      event: "support-ticket",
      summary: "Support ticket created",
    });

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: {
        success: true,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      },
    });
  } catch (error) {
    logger.error({ message: "Failed to create GitHub issue", error: error.message, stack: error.stack });

    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Failed to create support ticket",
      error: error.message,
    });
  }
}
