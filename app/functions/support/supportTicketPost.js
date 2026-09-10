// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/support/supportTicketPost.js
//
// POST /api/v1/support/ticket has no authorizer: anyone can file a ticket without signing in.
// That makes two things this Lambda must get right.
//
// First, provenance. The GitHub token this Lambda uses belongs to a shared machine identity
// (see getGitHubToken() below), not to a person, so the issue it opens must never read as if
// DIY Accounting or its operator wrote the submitter's words. buildIssueBody() quotes the
// submitter's subject and message in fenced code blocks - never the issue's own prose - and
// says plainly that the ticket came through the public form and that nobody has verified who
// sent it.
//
// Second, abuse. An unauthenticated write that creates a public GitHub issue is a spam vector,
// and CloudFront's WAF rate limit (2000 requests/5min per IP, see EdgeStack.java) is a blunt
// site-wide backstop, not a control on this endpoint specifically. checkSupportTicketRateLimit()
// adds a per-IP limit on top of the existing field-length caps, using the same DynamoDB
// security-state table and fixed-minute-bucket pattern bundleGet.js already uses for its own
// burst counter (see app/data/dynamoDbSecurityStateRepository.js).

import { createHash } from "node:crypto";
import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import { nowMinute } from "../../lib/dateUtils.js";
import { incrementRateCounter } from "../../data/dynamoDbSecurityStateRepository.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http429TooManyRequestsResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/support/supportTicketPost.js" });

// A caller filing more than this many tickets in one minute is almost certainly a script, not
// someone reading a "your ticket was filed" confirmation between submissions. Module constant
// rather than configuration, so this comment stays next to the number it explains.
export const SUPPORT_TICKET_RATE_LIMIT_PER_MINUTE = 3;

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

/**
 * One-way hash of the caller's IP address for use as a DynamoDB rate-limit key. Not a security
 * boundary - the item lives for a few minutes and holds no customer data - just a way to avoid
 * writing raw IP addresses into the table.
 *
 * @param {string} clientIp
 * @returns {string}
 */
export function hashClientIp(clientIp) {
  return createHash("sha256").update(clientIp).digest("hex");
}

/**
 * Checks and bumps the caller's one-minute ticket-filing counter. Never throws: a counter
 * failure is logged and treated as not limited, and the check is a no-op when the security
 * state table isn't configured (simulator, local dev, test). The WAF's site-wide rate limit
 * still applies underneath either way, so failing open here does not leave the endpoint
 * unprotected.
 *
 * @param {string} clientIp
 * @returns {Promise<{limited: boolean, hits?: number}>}
 */
export async function checkSupportTicketRateLimit(clientIp) {
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) {
    return { limited: false };
  }

  try {
    const hits = await incrementRateCounter({
      namespace: "supportticket",
      identifier: hashClientIp(clientIp),
      minute: nowMinute(),
    });
    return { limited: hits > SUPPORT_TICKET_RATE_LIMIT_PER_MINUTE, hits };
  } catch (error) {
    logger.warn({ message: "Support ticket rate counter failed", error: error.message });
    return { limited: false };
  }
}

/**
 * Wraps text in a Markdown fenced code block, choosing a fence longer than any backtick run
 * already in the text so the block can't be broken out of. A fenced block also stops GitHub
 * from turning an "@name" or "#123" in the submitter's own words into a mention or a link,
 * which a blockquote would not.
 *
 * @param {string} text
 * @returns {string}
 */
export function fenceText(text) {
  const body = String(text ?? "");
  const longestBacktickRun = Math.max(0, ...(body.match(/`+/g) || []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}\n${body}\n${fence}`;
}

/**
 * Builds the GitHub issue body for a support ticket. The submitter's subject and message are
 * fenced verbatim, never folded into this function's own prose, and the body says plainly that
 * the ticket arrived through the public form with no verified sender - the form collects no
 * name or email, so "claims to be from" is always "not given" today.
 *
 * The trailing footer line is this Lambda's own placeholder for the shared automated-disclosure
 * footer another change adds for issue and comment bodies (see buildIssueBody/buildCommentBody
 * in app/functions/ops/alarmToGithubIssue.js). Once that helper lands, this line should call it
 * instead of stating its own text.
 *
 * @param {Object} params
 * @param {string} params.subject
 * @param {string} params.description
 * @param {string} params.category
 * @param {string} params.requestId
 * @param {string} params.timestamp - ISO 8601
 * @returns {string}
 */
export function buildIssueBody({ subject, description, category, requestId, timestamp }) {
  return `## Support request

**Category:** ${category}
**Submitted:** ${timestamp}
**Request ID:** ${requestId}

This ticket was filed through the public support form, which needs no sign-in. Nobody has
verified who sent it.

**Claims to be from:** not given - the form collects no name or email.

The subject and message below are exactly what the submitter typed, quoted rather than written
in this issue's own voice.

**Subject**
${fenceText(subject)}

**Message**
${fenceText(description)}

---
*Filed automatically by the public support form. Not reviewed by a person.*`;
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

  const { limited, hits } = await checkSupportTicketRateLimit(clientIp);
  if (limited) {
    logger.warn({ message: "Support ticket rate limit exceeded", clientIp, hits });
    return http429TooManyRequestsResponse({
      request,
      headers: { ...responseHeaders },
      message: "Too many support tickets from this address. Try again in a minute.",
      retryAfterSeconds: 60,
    });
  }

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
  const issueBody = buildIssueBody({
    subject,
    description,
    category,
    requestId,
    timestamp: new Date().toISOString(),
  });

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
