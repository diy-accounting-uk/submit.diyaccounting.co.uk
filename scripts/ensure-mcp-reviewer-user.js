#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-26 Seed the demo reviewer user and its two sample books
// - **Use when:** a directory reviewer's sign-in on the MCP consent page needs its user, its one-time code seed or its sample books to exist, or the weekly seed run needs tracing.
// - **Does:** ensure-mcp-reviewer-user.js creates the user mcp-reviewer@test.diyaccounting.co.uk with no email, sets the password from the secret `<env>/submit/mcp/reviewer-password`, adds the user to the `mcp-reviewer` group and enrols one one-time code device whose seed it stores in `<env>/submit/mcp/reviewer-totp-seed`. It then signs the user in through app/lib/mcpReviewerSignIn.js and saves two sample books through mcp/lib/book-tools.js, which refreshes their 35 day expiry. A second run changes nothing but the books' versions. The user holds no bundle and no HMRC or Companies House grant. mcp-reviewer-seed.yml runs it weekly for ci and prod and on dispatch. It prints no password, seed or token.
// - **Run:** `gh workflow run mcp-reviewer-seed.yml -f environment=<ci|prod>`; `DIYA_SUBMIT_BASE_URL=<base url> node scripts/ensure-mcp-reviewer-user.js <ci|prod>`
// - **Entry:** `scripts/ensure-mcp-reviewer-user.js`; `.github/workflows/mcp-reviewer-seed.yml`
// - **Files:** scripts/ensure-mcp-reviewer-user.js, .github/workflows/mcp-reviewer-seed.yml, app/lib/mcpReviewerSignIn.js, app/lib/totp.js, app/unit-tests/scripts/ensure-mcp-reviewer-user.test.js
// - **Keywords:** mcp reviewer, demo user, directory reviewer, reviewer sign-in, sample books, totp seed, mcp-reviewer-seed
// - **Related:** MCP-18, DEV-16
// @end-capability

//
// Ensure the demo reviewer user, its code seed and its two sample books exist in one environment
//
// Usage: DIYA_SUBMIT_BASE_URL=<base url> node scripts/ensure-mcp-reviewer-user.js <environment-name>
//
// The sign-in on the MCP consent page (app/functions/mcp/mcpOauth.js) signs this one user in with
// the admin password flow and answers the one-time code challenge from the stored seed. This script
// makes that possible: the user, the group that gives its token prod's tool set, a device whose
// seed only the secret holds, and two saved books so "List my books" has an answer.
//
// A user that has a device but no stored seed cannot be answered or repaired, so it is deleted and
// created again. Its books go with it and the run saves them again.

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminSetUserPasswordCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateSecretCommand, GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { totpCode } from "../app/lib/totp.js";
import { signInReviewer } from "../app/lib/mcpReviewerSignIn.js";
import { createSession, listBooks, openBook, saveBook } from "../mcp/lib/book-tools.js";

export const REVIEWER_USERNAME = "mcp-reviewer@test.diyaccounting.co.uk";
export const REVIEWER_GROUP = "mcp-reviewer";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "..", "mcp", "test", "fixtures");

// Fixed ids, so a second run replaces the same two books. A VAT-registered company for the VAT
// return, and a company whose accounts derive as micro-entity accounts.
export const SAMPLE_BOOKS = [
  { bookId: "6f1c1f0a-3b52-4c6e-9a41-1d0c5e7a2b01", path: join(FIXTURES, "brickwork-pro-ltd-vat") },
  { bookId: "6f1c1f0a-3b52-4c6e-9a41-1d0c5e7a2b02", path: join(FIXTURES, "precision-code-ltd-full") },
];

export function secretNames(environmentName) {
  return {
    password: `${environmentName}/submit/mcp/reviewer-password`,
    totpSeed: `${environmentName}/submit/mcp/reviewer-totp-seed`,
  };
}

async function readSecretOrUndefined(secrets, secretName) {
  try {
    return (await secrets.send(new GetSecretValueCommand({ SecretId: secretName }))).SecretString;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") return undefined;
    throw error;
  }
}

async function storeSecret(secrets, secretName, value) {
  try {
    await secrets.send(new PutSecretValueCommand({ SecretId: secretName, SecretString: value }));
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
    await secrets.send(new CreateSecretCommand({ Name: secretName, SecretString: value }));
  }
}

async function createUser(cognito, userPoolId, password) {
  let created = true;
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: REVIEWER_USERNAME,
        UserAttributes: [
          { Name: "email", Value: REVIEWER_USERNAME },
          { Name: "email_verified", Value: "true" },
        ],
        MessageAction: "SUPPRESS",
      }),
    );
  } catch (error) {
    if (error.name !== "UsernameExistsException") throw error;
    created = false;
  }
  await cognito.send(
    new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: REVIEWER_USERNAME, Password: password, Permanent: true }),
  );
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: REVIEWER_USERNAME, GroupName: REVIEWER_GROUP }));
  return created;
}

// Enrols the first device through the pool's MFA setup challenge, which answers tokens once the
// device is verified. The seed is stored only after Cognito accepts the device.
async function enrolDevice({ cognito, secrets, userPoolId, userPoolClientId, password, seedSecretName, now }) {
  const base = { UserPoolId: userPoolId, ClientId: userPoolClientId };
  const started = await cognito.send(
    new AdminInitiateAuthCommand({
      ...base,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: REVIEWER_USERNAME, PASSWORD: password },
    }),
  );
  const setupChallenge = started.ChallengeName === "MFA_SETUP";
  if (!setupChallenge && !started.AuthenticationResult) {
    throw new Error(`Expected the MFA setup challenge but got: ${started.ChallengeName || "nothing"}`);
  }
  const associated = await cognito.send(
    new AssociateSoftwareTokenCommand(
      setupChallenge ? { Session: started.Session } : { AccessToken: started.AuthenticationResult.AccessToken },
    ),
  );
  const seed = associated.SecretCode;
  const verified = await cognito.send(
    new VerifySoftwareTokenCommand({
      ...(setupChallenge ? { Session: associated.Session ?? started.Session } : { AccessToken: started.AuthenticationResult.AccessToken }),
      UserCode: totpCode(seed, { now }),
      FriendlyDeviceName: "mcp-reviewer",
    }),
  );
  if (verified.Status !== "SUCCESS") throw new Error(`The one-time code device was not accepted: ${verified.Status}`);

  let tokens = started.AuthenticationResult;
  if (setupChallenge) {
    const answered = await cognito.send(
      new AdminRespondToAuthChallengeCommand({
        ...base,
        ChallengeName: "MFA_SETUP",
        Session: verified.Session,
        ChallengeResponses: { USERNAME: REVIEWER_USERNAME },
      }),
    );
    tokens = answered.AuthenticationResult;
    if (!tokens?.AccessToken) throw new Error(`Expected tokens after the MFA setup but got: ${answered.ChallengeName || "nothing"}`);
  }
  await cognito.send(
    new AdminSetUserMFAPreferenceCommand({
      UserPoolId: userPoolId,
      Username: REVIEWER_USERNAME,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    }),
  );
  await storeSecret(secrets, seedSecretName, seed);
  return tokens;
}

/**
 * Makes the user, its group membership and its one device exist, and answers an access token.
 * @returns {Promise<{userCreated: boolean, deviceEnrolled: boolean, accessToken: string}>}
 */
export async function ensureUser({
  cognito,
  secrets,
  userPoolId,
  userPoolClientId,
  environmentName,
  signIn,
  now = Date.now(),
  log = console.log,
}) {
  const names = secretNames(environmentName);
  const password = await readSecretOrUndefined(secrets, names.password);
  if (!password) throw new Error(`The secret ${names.password} is empty or missing`);

  let userCreated = await createUser(cognito, userPoolId, password);
  log(userCreated ? "Created the reviewer user" : "The reviewer user exists");

  const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: REVIEWER_USERNAME }));
  const hasDevice = (user.UserMFASettingList ?? []).includes("SOFTWARE_TOKEN_MFA");
  const storedSeed = await readSecretOrUndefined(secrets, names.totpSeed);

  if (hasDevice && storedSeed) {
    log("The reviewer user has its device and a stored seed");
    return { userCreated, deviceEnrolled: false, accessToken: (await signIn({ password })).AccessToken };
  }
  if (hasDevice) {
    log("The reviewer user has a device with no stored seed: deleting and creating the user again");
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: REVIEWER_USERNAME }));
    userCreated = await createUser(cognito, userPoolId, password);
  }
  const tokens = await enrolDevice({ cognito, secrets, userPoolId, userPoolClientId, password, seedSecretName: names.totpSeed, now });
  log("Enrolled the reviewer user's device and stored its seed");
  return { userCreated, deviceEnrolled: true, accessToken: tokens.AccessToken };
}

/**
 * Saves the two sample books for the signed-in user. A book that exists is replaced with its
 * current etag, which writes a new version and refreshes its expiry.
 * @returns {Promise<string[]>} the saved book ids
 */
export async function saveSampleBooks({ accessToken, books = SAMPLE_BOOKS, log = console.log }) {
  const session = createSession({ credentials: { accessToken: async () => accessToken, idToken: async () => null } });
  const existing = new Map((await listBooks(session)).books.map((book) => [book.bookId, book]));
  const saved = [];
  for (const { bookId, path } of books) {
    await openBook(session, { path });
    session.cloud = existing.has(bookId) ? { bookId, clientId: null, etag: existing.get(bookId).latestETag } : null;
    await saveBook(session, { cloud: true, bookId });
    log(`${existing.has(bookId) ? "Replaced" : "Saved"} the sample book ${bookId}`);
    saved.push(bookId);
  }
  return saved;
}

async function stackOutputs(environmentName) {
  const stackName = `${environmentName}-env-IdentityStack`;
  const response = await new CloudFormationClient({}).send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = response.Stacks?.[0]?.Outputs ?? [];
  const valueOf = (key) => {
    const value = outputs.find((output) => output.OutputKey === key)?.OutputValue;
    if (!value) throw new Error(`Output ${key} not found in stack ${stackName}`);
    return value;
  };
  return { userPoolId: valueOf("UserPoolId"), userPoolClientId: valueOf("McpUserPoolClientId") };
}

export async function main(environmentName = process.argv[2]) {
  if (!environmentName) throw new Error("Usage: node scripts/ensure-mcp-reviewer-user.js <environment-name>");
  if (!process.env.DIYA_SUBMIT_BASE_URL) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  const { userPoolId, userPoolClientId } = await stackOutputs(environmentName);
  const names = secretNames(environmentName);

  // The sign-in module reads these, as the OAuth Lambda's environment gives them.
  process.env.MCP_USER_POOL_ID = userPoolId;
  process.env.MCP_UPSTREAM_CLIENT_ID = userPoolClientId;
  process.env.MCP_REVIEWER_USERNAME = REVIEWER_USERNAME;
  process.env.MCP_REVIEWER_TOTP_SECRET_NAME = names.totpSeed;

  const result = await ensureUser({
    cognito: new CognitoIdentityProviderClient({}),
    secrets: new SecretsManagerClient({}),
    userPoolId,
    userPoolClientId,
    environmentName,
    signIn: ({ password }) =>
      signInReviewer({
        viewer: { ipAddress: "127.0.0.1", serverName: "mcp-reviewer-seed", serverPath: "/seed", userAgent: "mcp-reviewer-seed" },
        password,
        trace: {},
      }),
  });
  await saveSampleBooks({ accessToken: result.accessToken });
  console.log(`Reviewer user ready in ${environmentName}: created=${result.userCreated} deviceEnrolled=${result.deviceEnrolled}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.name}: ${error.message}`);
    process.exit(1);
  });
}
