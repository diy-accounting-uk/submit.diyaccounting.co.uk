#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
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

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  AdminSetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";

const environmentName = process.argv[2];
const testLane = process.argv[3];

if (!environmentName || !testLane) {
  console.error("Usage: node scripts/ensure-cognito-test-user.js <environment-name> <test-lane>");
  process.exit(1);
}

function durableTestUserEmail(lane) {
  const slug = lane
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) throw new Error(`Test lane "${lane}" has no usable characters`);
  return `synthetic-${slug}@test.diyaccounting.co.uk`;
}

async function main() {
  const testEmail = durableTestUserEmail(testLane);

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

    // Cognito never hands back the secret of an enrolled TOTP device, so a reused user can only
    // be re-enrolled. Turning the software token off first lets the password login below return
    // tokens instead of an MFA challenge we have no code for.
    console.log("Clearing the previous TOTP device...");
    await cognitoClient.send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: userPoolId,
        Username: testEmail,
        SoftwareTokenMfaSettings: {
          Enabled: false,
          PreferredMfa: false,
        },
      }),
    );

    console.log("Enrolling TOTP MFA device...");

    // Uses InitiateAuth (not AdminInitiateAuth) because the User Pool Client has
    // ALLOW_USER_PASSWORD_AUTH enabled but not ALLOW_ADMIN_USER_PASSWORD_AUTH.
    const authResponse = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: userPoolClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: testEmail,
          PASSWORD: testPassword,
        },
      }),
    );

    if (!authResponse.AuthenticationResult?.AccessToken) {
      throw new Error(
        `Expected tokens but got challenge: ${authResponse.ChallengeName || "unknown"}. ` +
          `MFA enrollment requires an access token from a non-MFA login.`,
      );
    }

    const accessToken = authResponse.AuthenticationResult.AccessToken;
    console.log("Authenticated user for TOTP enrollment");

    const associateResponse = await cognitoClient.send(
      new AssociateSoftwareTokenCommand({
        AccessToken: accessToken,
      }),
    );

    const totpSecret = associateResponse.SecretCode;
    console.log(`TOTP secret received (${totpSecret.length} chars)`);

    const { TOTP, Secret } = await import("otpauth");
    const totp = new TOTP({
      secret: Secret.fromBase32(totpSecret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const totpCode = totp.generate();
    console.log("Generated TOTP verification code");

    const verifyResponse = await cognitoClient.send(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: totpCode,
        FriendlyDeviceName: "test-device",
      }),
    );

    if (verifyResponse.Status !== "SUCCESS") {
      throw new Error(`TOTP verification failed: ${verifyResponse.Status}`);
    }
    console.log("TOTP device verified successfully");

    await cognitoClient.send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: userPoolId,
        Username: testEmail,
        SoftwareTokenMfaSettings: {
          Enabled: true,
          PreferredMfa: true,
        },
      }),
    );
    console.log("TOTP set as preferred MFA method");

    // Wait for the next TOTP period so the behaviour test doesn't reuse the same code.
    // Cognito rejects a TOTP code that was already consumed (by VerifySoftwareToken above)
    // within the same 30-second window ("Your software token has already been used once").
    const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    console.log(`Waiting ${secondsRemaining}s for next TOTP period...`);
    await new Promise((resolve) => setTimeout(resolve, secondsRemaining * 1000));

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
    if (process.env.GITHUB_OUTPUT) {
      // Test system credentials - intentionally not masked so they appear in job summary
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `test-auth-username=${testEmail}\ntest-auth-password=${testPassword}\ntest-auth-totp-secret=${totpSecret}\n`,
      );
    }

    // Also output as simple key=value format for easy sourcing
    console.log(`TEST_AUTH_USERNAME=${testEmail}`);
    console.log(`TEST_AUTH_PASSWORD=${testPassword}`);
    console.log(`TOTP_SECRET=${totpSecret}`);
  } catch (error) {
    console.error(`ERROR: Failed to ensure Cognito test user: ${error.message}`);
    process.exit(1);
  }
}

main();
