#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Toggle native Cognito authentication on/off for the Hosted UI
//
// Usage: node scripts/toggle-cognito-native-auth.js <enable|disable> <environment-name> [--client app|diya-gl|both]
// Example: node scripts/toggle-cognito-native-auth.js enable ci
// Example: node scripts/toggle-cognito-native-auth.js enable prod --client diya-gl
//
// This script adds or removes COGNITO from one or both UserPoolClient's SupportedIdentityProviders:
// - UserPoolClient (submit app): native email/password login
// - BooksUserPoolClient (DIYA-GL pages): native email/password login
//
// --client selects which client to change (default: both). The spreadsheets repository's ci
// behaviour run uses --client diya-gl to toggle only the DIYA-GL client, against submit's prod
// environment, without touching the submit app client's own sign-in state. "books" is still
// accepted as an alias for "diya-gl" for the spreadsheets repository's existing call, until it
// switches over.
//
// When COGNITO is present, the Hosted UI shows the native email/password login form.
// When absent, only federated providers (Google, etc.) are shown.
//
// The script is idempotent: enabling when already enabled or disabling when already
// disabled is a no-op for each client.
//
// IMPORTANT: UpdateUserPoolClient replaces ALL settings, not just the ones you specify.
// This script reads the current config and replays it with only SupportedIdentityProviders modified.

import { fileURLToPath } from "node:url";

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const USAGE = "Usage: node scripts/toggle-cognito-native-auth.js <enable|disable> <environment-name> [--client app|diya-gl|both]";

export function parseArgs(argv) {
  const positional = [];
  let client = "both";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--client") {
      client = argv[i + 1];
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  // "books" is the spreadsheets repository's existing spelling; normalise it to "diya-gl" so the
  // rest of the script only ever deals with one name for the client.
  if (client === "books") {
    client = "diya-gl";
  }
  return { action: positional[0], environmentName: positional[1] || "ci", client };
}

// probe-test.yml runs several behaviour-test suites in parallel, and every suite calls this
// script against the same shared UserPoolClient at roughly the same moment. Cognito serialises
// UpdateUserPoolClient calls and rejects the losers with ConcurrentModificationException
// ("Only one request to update this ... can be processed at a time"), so a losing suite must
// retry rather than fail outright. Re-describing on each attempt also means a retry that lands
// after the winner's update sees COGNITO already in the desired state and exits as a no-op.
const concurrentUpdateMaxAttempts = 5;
const concurrentUpdateBaseDelayMs = 500;

function isConcurrentModification(error) {
  return error.name === "ConcurrentModificationException" || /only one request/i.test(error.message || "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function updateClient(cognitoClient, userPoolId, clientId, clientName, action) {
  for (let attempt = 1; attempt <= concurrentUpdateMaxAttempts; attempt++) {
    // Describe the current UserPoolClient to get all settings
    console.log(`Describing current ${clientName} configuration...`);
    let clientConfig;
    try {
      const describeResponse = await cognitoClient.send(
        new DescribeUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
        }),
      );
      clientConfig = describeResponse.UserPoolClient;
    } catch (error) {
      console.error(`ERROR: Failed to describe ${clientName}: ${error.message}`);
      throw error;
    }

    const currentProviders = clientConfig.SupportedIdentityProviders || [];
    console.log(`  Current SupportedIdentityProviders: [${currentProviders.join(", ")}]`);

    const hasCognito = currentProviders.includes("COGNITO");

    if (action === "enable" && hasCognito) {
      console.log(`  COGNITO is already enabled. No changes needed.`);
      return;
    }

    if (action === "disable" && !hasCognito) {
      console.log(`  COGNITO is already disabled. No changes needed.`);
      return;
    }

    // Build the new provider list
    let newProviders;
    if (action === "enable") {
      newProviders = [...currentProviders, "COGNITO"];
    } else {
      newProviders = currentProviders.filter((p) => p !== "COGNITO");
    }

    console.log(`  New SupportedIdentityProviders: [${newProviders.join(", ")}]`);

    // UpdateUserPoolClient requires ALL parameters — omitted ones reset to defaults.
    // We replay the current config with only SupportedIdentityProviders changed.
    try {
      await cognitoClient.send(
        new UpdateUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          ClientName: clientConfig.ClientName,
          RefreshTokenValidity: clientConfig.RefreshTokenValidity,
          AccessTokenValidity: clientConfig.AccessTokenValidity,
          IdTokenValidity: clientConfig.IdTokenValidity,
          TokenValidityUnits: clientConfig.TokenValidityUnits,
          ReadAttributes: clientConfig.ReadAttributes,
          WriteAttributes: clientConfig.WriteAttributes,
          ExplicitAuthFlows: clientConfig.ExplicitAuthFlows,
          SupportedIdentityProviders: newProviders,
          CallbackURLs: clientConfig.CallbackURLs,
          LogoutURLs: clientConfig.LogoutURLs,
          AllowedOAuthFlows: clientConfig.AllowedOAuthFlows,
          AllowedOAuthScopes: clientConfig.AllowedOAuthScopes,
          AllowedOAuthFlowsUserPoolClient: clientConfig.AllowedOAuthFlowsUserPoolClient,
          PreventUserExistenceErrors: clientConfig.PreventUserExistenceErrors,
          EnableTokenRevocation: clientConfig.EnableTokenRevocation,
          EnablePropagateAdditionalUserContextData: clientConfig.EnablePropagateAdditionalUserContextData,
        }),
      );

      console.log(`  ✓ ${clientName} ${action === "enable" ? "enabled" : "disabled"}`);
      return;
    } catch (error) {
      if (isConcurrentModification(error) && attempt < concurrentUpdateMaxAttempts) {
        const delayMs = concurrentUpdateBaseDelayMs * attempt + Math.floor(Math.random() * concurrentUpdateBaseDelayMs);
        console.log(
          `  ${clientName}: another caller is updating this client (attempt ${attempt}/${concurrentUpdateMaxAttempts}), retrying in ${delayMs}ms...`,
        );
        await sleep(delayMs);
        continue;
      }
      console.error(`ERROR: Failed to update ${clientName}: ${error.message}`);
      throw error;
    }
  }
}

export async function main() {
  const { action, environmentName, client } = parseArgs(process.argv.slice(2));

  if (!action || !["enable", "disable"].includes(action)) {
    console.error(USAGE);
    process.exit(1);
  }

  if (!["app", "diya-gl", "both"].includes(client)) {
    console.error(USAGE);
    console.error(`Invalid --client value: ${client}`);
    process.exit(1);
  }

  console.log(`=== ${action === "enable" ? "Enabling" : "Disabling"} Native Auth on Hosted UI ===`);
  console.log(`Environment: ${environmentName}`);
  console.log(`Client: ${client}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "not set"}`);
  console.log("");

  // Look up UserPoolId and client IDs from CloudFormation stack outputs
  const stackName = `${environmentName}-env-IdentityStack`;
  console.log(`Looking up stack: ${stackName}`);

  const cfnClient = new CloudFormationClient({});
  let userPoolId;
  let clientId;
  let diyaGlClientId;

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
    clientId = clientIdOutput.OutputValue;

    // The stack still emits this output under its old key; that key only renames once the stack
    // side of the DIYA-GL naming work reaches this environment.
    const diyaGlClientIdOutput = stack.Outputs?.find((o) => o.OutputKey === "BooksUserPoolClientId");
    if (!diyaGlClientIdOutput?.OutputValue) {
      throw new Error(`BooksUserPoolClientId output not found in stack ${stackName}`);
    }
    diyaGlClientId = diyaGlClientIdOutput.OutputValue;

    console.log(`User Pool ID: ${userPoolId}`);
    console.log(`Submit Client ID: ${clientId}`);
    console.log(`DIYA-GL Client ID: ${diyaGlClientId}`);
  } catch (error) {
    console.error(`ERROR: Could not find Cognito config for environment: ${environmentName}`);
    console.error(`Looking for stack: ${stackName}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  const cognitoClient = new CognitoIdentityProviderClient({});

  const updateApp = client === "app" || client === "both";
  const updateDiyaGl = client === "diya-gl" || client === "both";

  try {
    console.log("");
    if (updateApp) {
      await updateClient(cognitoClient, userPoolId, clientId, "UserPoolClient (submit app)", action);
      console.log("");
    }
    if (updateDiyaGl) {
      if (action === "disable" && environmentName === "ci") {
        // The spreadsheets ci behaviour case signs in on the DIYA-GL client outside this repo's
        // test window, so ci's DIYA-GL client keeps native sign-in on; prod toggles both clients.
        console.log("  BooksUserPoolClient (DIYA-GL) on ci keeps native sign-in enabled");
      } else {
        await updateClient(cognitoClient, userPoolId, diyaGlClientId, "BooksUserPoolClient (DIYA-GL)", action);
      }
    }

    console.log("");
    console.log(`=== Native Auth ${action === "enable" ? "Enabled" : "Disabled"} Successfully ===`);
  } catch (error) {
    console.error(`ERROR: Failed to update clients: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
