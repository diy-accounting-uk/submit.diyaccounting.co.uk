#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Ensure the durable Cognito test user for a test lane exists, and rotate its credentials
//
// Usage: node scripts/ensure-cognito-test-user.js <environment-name> <test-lane>
// Example: node scripts/ensure-cognito-test-user.js ci submitVatBehaviour
//
// Each test lane keeps one durable user in the environment's user pool. The user is created
// once and reused, so a run costs no new monthly active user. Every run rotates the password,
// re-enrols the TOTP device and purges the user's DynamoDB data, so credentials never outlive
// the run that issued them and a run never inherits the previous run's bundles or receipts.
//
// Lanes that run in parallel need separate users: the behaviour suites clear and re-grant
// bundles for whoever they log in as, and a rotation from one lane would invalidate another
// lane's password mid-run.
//
// The user pool has Mfa.REQUIRED: every sign-in is challenged for a software token, whether or
// not the caller cleared AdminSetUserMFAPreference first, and Cognito never hands back the
// secret of an already-enrolled device. So a rotation cannot log in "clean" to re-enrol; it has
// to answer whatever challenge the pool actually issues:
//   - no challenge: the user has no device yet and the client allows it through. Enrol one.
//   - MFA_SETUP: the user has no device yet and the pool is demanding one before it will issue
//     tokens. Enrol one as part of answering the challenge.
//   - SOFTWARE_TOKEN_MFA: the user already has a device. Answer with a code from the secret this
//     script stored on its own previous run, then enrol a fresh device to rotate it. If no
//     stored secret exists (the first run against a pool with MFA required, or a user created
//     before this script kept secrets), the code has no way to answer the challenge, so the user
//     is deleted and recreated from scratch.

// The spreadsheets repository runs this file. One step in its deploy.yml fetches it from our
// main branch by raw URL during a CI run and executes it, then masks what it prints into a
// behaviour test. Nothing in this repository records that: there is no import to grep, no test
// that fails, and no reference a rename would break.
//
// So changing the argument order, adding a required argument, or changing the shape of what
// this prints breaks a caller you cannot see from here. Give the old form a window first;
// scripts/toggle-cognito-native-auth.js has a live example of one.
//
// They have agreed to pin their fetch to a commit rather than track our main, but until that
// lands on THEIR main every merge here still reaches their runners immediately. Check which is
// true before you rely on either. Once pinned, a change here reaches them only when they bump
// that SHA, which turns a surprise into a silence — so a change worth their having needs telling
// them.
//
// The role the spreadsheets repository assumes to run this script (spreadsheetsBehaviourRole in
// IdentityStack.java) enumerates the exact Cognito and Secrets Manager actions this file calls.
// A new AWS call added here needs the matching grant added there too.

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  AdminSetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, PutSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "node:url";

const environmentName = process.argv[2];
const testLane = process.argv[3];

export function laneSlug(lane) {
  const slug = lane
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) throw new Error(`Test lane "${lane}" has no usable characters`);
  return slug;
}

export function durableTestUserEmail(lane) {
  return `synthetic-${laneSlug(lane)}@test.diyaccounting.co.uk`;
}

// Named to match scripts/put-secret-with-rotation-tag.sh's naming convention
// (<environment>/submit/<service>/<key>), so this secret sits alongside the others a person
// would find while looking for what's stored per environment. Deliberately outside
// secrets-rotation.toml: that file tracks secrets sourced from a console and rotated by hand or
// by manage-secrets.yml, and this one rotates every run this script makes.
export function totpSecretName(environment, lane) {
  return `${environment}/submit/test/${laneSlug(lane)}/totp-secret`;
}

export async function getStoredTotpSecret(secretsClient, secretName) {
  try {
    const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretName }));
    return response.SecretString;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") return undefined;
    throw error;
  }
}

export async function storeTotpSecret(secretsClient, secretName, totpSecret) {
  try {
    await secretsClient.send(new PutSecretValueCommand({ SecretId: secretName, SecretString: totpSecret }));
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
    await secretsClient.send(new CreateSecretCommand({ Name: secretName, SecretString: totpSecret }));
  }
}

async function generateTotpCode(totpSecretBase32) {
  const { TOTP, Secret } = await import("otpauth");
  const totp = new TOTP({
    secret: Secret.fromBase32(totpSecretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

// Waits for the next TOTP period so a caller that immediately uses the returned secret to
// generate a fresh code doesn't reuse the one this function already consumed to verify the
// device. Cognito rejects a code already consumed within the same 30-second window ("Your
// software token has already been used once").
async function waitForNextTotpPeriod() {
  const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  console.log(`Waiting ${secondsRemaining}s for next TOTP period...`);
  await new Promise((resolve) => setTimeout(resolve, secondsRemaining * 1000));
}

// Enrols a fresh TOTP device on an already-authenticated session (an access token, or a
// challenge session mid MFA_SETUP) and returns its secret. Does not set the device as
// preferred; the caller decides whether that step still makes sense for its branch.
async function enrolTotpDevice(cognitoClient, associateInput, verifyInputWithoutCode) {
  const associateResponse = await cognitoClient.send(new AssociateSoftwareTokenCommand(associateInput));
  const totpSecret = associateResponse.SecretCode;
  console.log(`TOTP secret received (${totpSecret.length} chars)`);

  const totpCode = await generateTotpCode(totpSecret);
  console.log("Generated TOTP verification code");

  const verifyResponse = await cognitoClient.send(
    new VerifySoftwareTokenCommand({
      ...verifyInputWithoutCode,
      Session: associateResponse.Session ?? verifyInputWithoutCode.Session,
      UserCode: totpCode,
      FriendlyDeviceName: "test-device",
    }),
  );

  if (verifyResponse.Status !== "SUCCESS") {
    throw new Error(`TOTP verification failed: ${verifyResponse.Status}`);
  }
  console.log("TOTP device verified successfully");

  return { totpSecret, session: verifyResponse.Session };
}

// Logs the user in and returns an access token and an ID token plus, when this call is the one
// that enrolled the device (no stored secret existed yet, so there was nothing to answer a
// SOFTWARE_TOKEN_MFA challenge with), the new TOTP secret. When the user already had a device
// and this call answered the challenge with it, totpSecret is undefined and the caller enrols a
// fresh one to rotate. The ID token carries the claims a real sign-in's ID token would -
// custom:mfa_method and auth_time - so a caller that only needs to sign in, not rotate the
// device, can build the same Gov-Client-Multi-Factor header a live customer's request would.
//
// Returns { needsRecreate: true } when the pool challenges SOFTWARE_TOKEN_MFA and no stored
// secret exists for this lane: the existing device cannot be answered or removed, so the caller
// must delete and recreate the user.
export async function logInAndAnswerChallenge(cognitoClient, secretsClient, { userPoolClientId, testEmail, testPassword, secretName }) {
  const authResponse = await cognitoClient.send(
    new InitiateAuthCommand({
      ClientId: userPoolClientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: testEmail, PASSWORD: testPassword },
    }),
  );

  if (authResponse.AuthenticationResult?.AccessToken) {
    console.log("Authenticated with no MFA challenge (no device enrolled yet)");
    return {
      accessToken: authResponse.AuthenticationResult.AccessToken,
      idToken: authResponse.AuthenticationResult.IdToken,
    };
  }

  if (authResponse.ChallengeName === "MFA_SETUP") {
    console.log("Challenged for MFA_SETUP: enrolling the first TOTP device");
    const { totpSecret, session } = await enrolTotpDevice(
      cognitoClient,
      { Session: authResponse.Session },
      { Session: authResponse.Session },
    );

    const respondResponse = await cognitoClient.send(
      new RespondToAuthChallengeCommand({
        ClientId: userPoolClientId,
        ChallengeName: "MFA_SETUP",
        Session: session,
        ChallengeResponses: { USERNAME: testEmail },
      }),
    );

    if (!respondResponse.AuthenticationResult?.AccessToken) {
      throw new Error(
        `Expected tokens after completing MFA_SETUP but got: ${respondResponse.ChallengeName || "no challenge and no tokens"}`,
      );
    }

    return {
      accessToken: respondResponse.AuthenticationResult.AccessToken,
      idToken: respondResponse.AuthenticationResult.IdToken,
      totpSecret,
    };
  }

  if (authResponse.ChallengeName === "SOFTWARE_TOKEN_MFA") {
    const storedSecret = await getStoredTotpSecret(secretsClient, secretName);
    if (!storedSecret) {
      console.log("Challenged for SOFTWARE_TOKEN_MFA but no stored TOTP secret for this lane: recreating the user");
      return { needsRecreate: true };
    }

    console.log("Challenged for SOFTWARE_TOKEN_MFA: answering with the stored device");
    const code = await generateTotpCode(storedSecret);
    const respondResponse = await cognitoClient.send(
      new RespondToAuthChallengeCommand({
        ClientId: userPoolClientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: authResponse.Session,
        ChallengeResponses: { USERNAME: testEmail, SOFTWARE_TOKEN_MFA_CODE: code },
      }),
    );

    if (!respondResponse.AuthenticationResult?.AccessToken) {
      throw new Error(
        `Expected tokens after answering SOFTWARE_TOKEN_MFA but got: ${respondResponse.ChallengeName || "no challenge and no tokens"}`,
      );
    }

    return {
      accessToken: respondResponse.AuthenticationResult.AccessToken,
      idToken: respondResponse.AuthenticationResult.IdToken,
    };
  }

  throw new Error(`Expected tokens but got unhandled challenge: ${authResponse.ChallengeName || "unknown"}`);
}

// Logs in, answers whatever MFA challenge the pool issues, rotates the TOTP device when the
// login didn't already enrol a fresh one, sets it preferred, and stores its secret for next
// run. Returns { totpSecret } or { needsRecreate: true } (see logInAndAnswerChallenge).
export async function rotateTestUserMfa(
  cognitoClient,
  secretsClient,
  { userPoolId, userPoolClientId, testEmail, testPassword, secretName },
) {
  const loginResult = await logInAndAnswerChallenge(cognitoClient, secretsClient, {
    userPoolClientId,
    testEmail,
    testPassword,
    secretName,
  });

  if (loginResult.needsRecreate) return { needsRecreate: true };

  let totpSecret = loginResult.totpSecret;
  if (!totpSecret) {
    console.log("Enrolling a fresh TOTP device to rotate the one just used to log in...");
    ({ totpSecret } = await enrolTotpDevice(
      cognitoClient,
      { AccessToken: loginResult.accessToken },
      { AccessToken: loginResult.accessToken },
    ));
  }

  await cognitoClient.send(
    new AdminSetUserMFAPreferenceCommand({
      UserPoolId: userPoolId,
      Username: testEmail,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    }),
  );
  console.log("TOTP set as preferred MFA method");

  await storeTotpSecret(secretsClient, secretName, totpSecret);

  return { totpSecret };
}

// GitHub does not mask a step's outputs by default, so a caller that reads
// steps.<id>.outputs.test-auth-password or .test-auth-totp-secret into an env: block prints
// them unmasked wherever that block's values reach the log. Register both as masked secrets
// before writing them out, so every later log line in this job replaces them with ***. The
// username is not a secret and stays visible.
export function writeGithubOutputCredentials(testEmail, testPassword, totpSecret, githubOutputPath = process.env.GITHUB_OUTPUT) {
  if (!githubOutputPath) return;
  console.log(`::add-mask::${testPassword}`);
  console.log(`::add-mask::${totpSecret}`);
  fs.appendFileSync(
    githubOutputPath,
    `test-auth-username=${testEmail}\ntest-auth-password=${testPassword}\ntest-auth-totp-secret=${totpSecret}\n`,
  );
}

export async function main() {
  if (!environmentName || !testLane) {
    console.error("Usage: node scripts/ensure-cognito-test-user.js <environment-name> <test-lane>");
    process.exit(1);
  }

  const testEmail = durableTestUserEmail(testLane);
  const secretName = totpSecretName(environmentName, testLane);

  console.log("=== Ensuring Cognito Test User ===");
  console.log(`Environment: ${environmentName}`);
  console.log(`Test lane: ${testLane}`);
  console.log(`Username: ${testEmail}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "not set"}`);
  console.log("");

  // Get the Cognito User Pool ID and Client ID from CloudFormation stack outputs
  const stackName = `${environmentName}-env-IdentityStack`;
  console.log(`Looking up stack: ${stackName}`);

  const cfnClient = new CloudFormationClient({});
  let userPoolId;
  let userPoolClientId;

  try {
    const response = await cfnClient.send(new DescribeStacksCommand({ StackName: stackName }));

    const stack = response.Stacks?.[0];
    if (!stack) {
      throw new Error(`Stack ${stackName} not found`);
    }

    const userPoolIdOutput = stack.Outputs?.find((o) => o.OutputKey === "UserPoolId");
    if (!userPoolIdOutput?.OutputValue) {
      throw new Error(`UserPoolId output not found in stack ${stackName}`);
    }
    userPoolId = userPoolIdOutput.OutputValue;

    const clientIdOutput = stack.Outputs?.find((o) => o.OutputKey === "UserPoolClientId");
    if (!clientIdOutput?.OutputValue) {
      throw new Error(`UserPoolClientId output not found in stack ${stackName}`);
    }
    userPoolClientId = clientIdOutput.OutputValue;

    console.log(`User Pool ID: ${userPoolId}`);
    console.log(`Client ID: ${userPoolClientId}`);
  } catch (error) {
    console.error(`ERROR: Could not find Cognito User Pool ID for environment: ${environmentName}`);
    console.error(`Looking for stack: ${stackName}, output: UserPoolId`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  const testPassword = `Test${crypto.randomBytes(8).toString("hex")}Aa1#`;
  const cognitoClient = new CognitoIdentityProviderClient({});
  const secretsClient = new SecretsManagerClient({});

  try {
    try {
      await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: testEmail,
          UserAttributes: [
            { Name: "email", Value: testEmail },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS",
        }),
      );
      console.log("Created the durable test user");
    } catch (error) {
      if (error.name !== "UsernameExistsException") throw error;
      console.log("Reusing the existing durable test user");
    }

    const user = await cognitoClient.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: testEmail }));
    const userSub = user.UserAttributes?.find((a) => a.Name === "sub")?.Value;
    if (!userSub) throw new Error(`No sub attribute on ${testEmail}`);

    console.log("Purging the user's data from the previous run...");
    execFileSync("node", ["scripts/delete-user-data.js", environmentName, "--user-sub", userSub, "--confirm"], {
      stdio: "inherit",
    });

    console.log("Rotating password...");
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: testEmail,
        Password: testPassword,
        Permanent: true,
      }),
    );

    let rotateResult = await rotateTestUserMfa(cognitoClient, secretsClient, {
      userPoolId,
      userPoolClientId,
      testEmail,
      testPassword,
      secretName,
    });

    if (rotateResult.needsRecreate) {
      // The user already has a device enrolled but this script has no stored secret to answer
      // its challenge with, and Cognito has no API to remove or replace a device it didn't just
      // associate itself. Delete and recreate the user, which is a first-run path only: every
      // later run rotates through the stored secret instead.
      console.log(`Recreating the durable test user ${testEmail} because no stored TOTP secret exists for lane "${testLane}"`);
      await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: testEmail }));
      await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: testEmail,
          UserAttributes: [
            { Name: "email", Value: testEmail },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS",
        }),
      );
      await cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: testEmail,
          Password: testPassword,
          Permanent: true,
        }),
      );

      rotateResult = await rotateTestUserMfa(cognitoClient, secretsClient, {
        userPoolId,
        userPoolClientId,
        testEmail,
        testPassword,
        secretName,
      });

      if (rotateResult.needsRecreate) {
        throw new Error(`Still challenged for a device this script cannot answer after recreating ${testEmail}`);
      }
    }

    const totpSecret = rotateResult.totpSecret;

    await waitForNextTotpPeriod();

    console.log("");
    console.log("=== Test User Ready (with TOTP MFA) ===");
    console.log("");
    console.log("Use these environment variables for behavior tests:");
    console.log("");
    console.log(`export TEST_AUTH_USERNAME='${testEmail}'`);
    console.log(`export TEST_AUTH_PASSWORD='${testPassword}'`);
    console.log(`export TEST_AUTH_TOTP_SECRET='${totpSecret}'`);
    console.log("");

    // Output for GitHub Actions
    writeGithubOutputCredentials(testEmail, testPassword, totpSecret);

    // Also output as simple key=value format for easy sourcing
    console.log(`TEST_AUTH_USERNAME=${testEmail}`);
    console.log(`TEST_AUTH_PASSWORD=${testPassword}`);
    console.log(`TOTP_SECRET=${totpSecret}`);
  } catch (error) {
    console.error(`ERROR: Failed to ensure Cognito test user: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
