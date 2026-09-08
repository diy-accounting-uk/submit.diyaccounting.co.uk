#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Toggle native Cognito authentication on/off for the Hosted UI
//
// Usage: node scripts/toggle-cognito-native-auth.js <enable|disable> <environment-name>
// Example: node scripts/toggle-cognito-native-auth.js enable ci
//
// This script adds or removes COGNITO from both UserPoolClient's SupportedIdentityProviders:
// - UserPoolClient (submit app): native email/password login
// - BooksUserPoolClient (DIYA-GL pages): native email/password login
//
// When COGNITO is present, the Hosted UI shows the native email/password login form.
// When absent, only federated providers (Google, etc.) are shown.
//
// The script is idempotent: enabling when already enabled or disabling when already
// disabled is a no-op for each client.
//
// IMPORTANT: UpdateUserPoolClient replaces ALL settings, not just the ones you specify.
// This script reads the current config and replays it with only SupportedIdentityProviders modified.

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const action = process.argv[2];
const environmentName = process.argv[3] || "ci";

if (!action || !["enable", "disable"].includes(action)) {
  console.error("Usage: node scripts/toggle-cognito-native-auth.js <enable|disable> <environment-name>");
  process.exit(1);
}

async function updateClient(cognitoClient, userPoolId, clientId, clientName, action) {
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
  } catch (error) {
    console.error(`ERROR: Failed to update ${clientName}: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log(`=== ${action === "enable" ? "Enabling" : "Disabling"} Native Auth on Hosted UI ===`);
  console.log(`Environment: ${environmentName}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "not set"}`);
  console.log("");

  // Look up UserPoolId and client IDs from CloudFormation stack outputs
  const stackName = `${environmentName}-env-IdentityStack`;
  console.log(`Looking up stack: ${stackName}`);

  const cfnClient = new CloudFormationClient({});
  let userPoolId;
  let clientId;
  let booksClientId;

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

    const booksClientIdOutput = stack.Outputs?.find((o) => o.OutputKey === "BooksUserPoolClientId");
    if (!booksClientIdOutput?.OutputValue) {
      throw new Error(`BooksUserPoolClientId output not found in stack ${stackName}`);
    }
    booksClientId = booksClientIdOutput.OutputValue;

    console.log(`User Pool ID: ${userPoolId}`);
    console.log(`Submit Client ID: ${clientId}`);
    console.log(`DIYA-GL Client ID: ${booksClientId}`);
  } catch (error) {
    console.error(`ERROR: Could not find Cognito config for environment: ${environmentName}`);
    console.error(`Looking for stack: ${stackName}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  const cognitoClient = new CognitoIdentityProviderClient({});

  try {
    console.log("");
    await updateClient(cognitoClient, userPoolId, clientId, "UserPoolClient (submit app)", action);
    console.log("");
    await updateClient(cognitoClient, userPoolId, booksClientId, "BooksUserPoolClient (DIYA-GL)", action);

    console.log("");
    console.log(`=== Native Auth ${action === "enable" ? "Enabled" : "Disabled"} Successfully ===`);
  } catch (error) {
    console.error(`ERROR: Failed to update clients: ${error.message}`);
    process.exit(1);
  }
}

main();
