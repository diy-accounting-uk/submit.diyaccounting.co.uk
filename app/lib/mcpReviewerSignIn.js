// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpReviewerSignIn.js
// The server-side sign-in of the one demo user that directory reviewers use. The reviewer types a
// password on the consent page; this module then signs the configured user in to Cognito with the
// admin password flow and answers the one-time code challenge from the stored seed, so the reviewer
// meets no second factor. It never sends the typed user name.

import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { readSecret } from "./cachedSecret.js";
import { totpCode } from "./totp.js";

const SOFTWARE_TOKEN_MFA = "SOFTWARE_TOKEN_MFA";
const USED_CODE_MESSAGE = /used|reuse|already/i;

let cognitoClient = null;

function client() {
  cognitoClient ??= new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });
  return cognitoClient;
}

function contextData({ ipAddress, serverName, serverPath, userAgent }) {
  return {
    IpAddress: ipAddress,
    ServerName: serverName,
    ServerPath: serverPath,
    HttpHeaders: userAgent ? [{ headerName: "User-Agent", headerValue: userAgent }] : [],
  };
}

async function attempt({ viewer, password, seed, stepOffset, trace }) {
  const base = { UserPoolId: process.env.MCP_USER_POOL_ID, ClientId: process.env.MCP_UPSTREAM_CLIENT_ID };
  const username = process.env.MCP_REVIEWER_USERNAME;
  const initiated = await client().send(
    new AdminInitiateAuthCommand({
      ...base,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: username, PASSWORD: password },
      ContextData: contextData(viewer),
    }),
  );
  if (initiated.AuthenticationResult) return initiated.AuthenticationResult;
  trace.challengeName = initiated.ChallengeName;
  if (initiated.ChallengeName !== SOFTWARE_TOKEN_MFA) {
    const error = new Error("The sign-in answered a challenge that this server does not take");
    error.name = "UnexpectedChallenge";
    throw error;
  }
  const answered = await client().send(
    new AdminRespondToAuthChallengeCommand({
      ...base,
      ChallengeName: SOFTWARE_TOKEN_MFA,
      Session: initiated.Session,
      ChallengeResponses: { USERNAME: username, SOFTWARE_TOKEN_MFA_CODE: totpCode(seed, { stepOffset }) },
      ContextData: contextData(viewer),
    }),
  );
  if (!answered.AuthenticationResult) {
    const error = new Error("The sign-in gave no tokens after the code");
    error.name = "NoAuthenticationResult";
    throw error;
  }
  return answered.AuthenticationResult;
}

/**
 * Sign the demo user in. A code Cognito refuses as already used gets one retry with the next
 * window's code. A code that does not match gets one retry after a fresh read of the seed. Any
 * other failure throws.
 *
 * @param {{viewer: {ipAddress: string, serverName: string, serverPath: string, userAgent?: string}, password: string, trace: {challengeName?: string, totpRetry?: string}}} input
 * `trace` is filled in for the caller's log line: the challenge Cognito named and which retry ran.
 * @returns {Promise<{AccessToken: string, IdToken?: string, RefreshToken?: string, ExpiresIn: number}>}
 */
export async function signInReviewer({ viewer, password, trace }) {
  const seedName = process.env.MCP_REVIEWER_TOTP_SECRET_NAME;
  trace.totpRetry = "none";
  const seed = await readSecret(seedName);
  try {
    return await attempt({ viewer, password, seed, stepOffset: 0, trace });
  } catch (error) {
    if (error?.name === "UnexpectedChallenge" || error?.name === "NoAuthenticationResult") throw error;
    if (error?.name === "CodeMismatchException" && !USED_CODE_MESSAGE.test(error.message || "")) {
      trace.totpRetry = "fresh_seed";
      const freshSeed = await readSecret(seedName, { forceRefresh: true });
      return attempt({ viewer, password, seed: freshSeed, stepOffset: 0, trace });
    }
    if (USED_CODE_MESSAGE.test(error?.message || "")) {
      trace.totpRetry = "next_window";
      return attempt({ viewer, password, seed, stepOffset: 1, trace });
    }
    throw error;
  }
}
