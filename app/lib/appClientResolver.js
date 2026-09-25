// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/appClientResolver.js
//
// Maps a Cognito app client id to its name ("submit" | "books" | "mcp") from the SSM
// parameters IdentityStack writes. Shared by every handler that needs to know which client a
// verified token belongs to: the Pre Token Generation trigger's enrichment Lambda, the sign-out
// route, and the DIYA-GL book handlers.

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/appClientResolver.js" });

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });

// test, simulator and proxy run against a local Express server with no IdentityStack and no
// SSM to read from -- every GetParameterCommand there fails, every call, the same way. ci and
// prod are the only ENVIRONMENT_NAME values IdentityStack actually deploys the parameters for.
const LOCAL_ENVIRONMENT_NAMES = new Set(["test", "simulator", "proxy"]);

/**
 * Build the app-client-id map from the client ids a local lane already has in its own
 * environment, the same ones customAuthorizer.js accepts (COGNITO_CLIENT_ID for submit,
 * COGNITO_MCP_CLIENT_ID for mcp). No local lane carries a books client id.
 *
 * @returns {Object<string, string>} clientId -> "submit" | "books" | "mcp"
 */
function localAppClientIdMap() {
  const map = {};
  if (process.env.COGNITO_CLIENT_ID) map[process.env.COGNITO_CLIENT_ID] = "submit";
  if (process.env.COGNITO_MCP_CLIENT_ID) map[process.env.COGNITO_MCP_CLIENT_ID] = "mcp";
  return map;
}

/**
 * Read the three app-client-id SSM parameters IdentityStack writes and build a map from
 * Cognito app client id to the app client name. Read at invocation time rather than cached in
 * an environment variable: a trigger environment variable holding client ids would make a
 * CloudFormation cycle (the trigger's own function is created before the clients it would need
 * to name).
 *
 * @returns {Promise<Object<string, string>>} clientId -> "submit" | "books" | "mcp"
 */
export async function loadAppClientIdMap() {
  const envName = process.env.ENVIRONMENT_NAME;
  if (LOCAL_ENVIRONMENT_NAMES.has(envName)) {
    return localAppClientIdMap();
  }

  const parameterNames = {
    submit: `/submit/${envName}/submit-app-client-id`,
    books: `/submit/${envName}/spreadsheets-diya-gl-app-client-id`,
    mcp: `/submit/${envName}/mcp-app-client-id`,
  };

  const map = {};
  await Promise.all(
    Object.entries(parameterNames).map(async ([appClient, parameterName]) => {
      try {
        const result = await ssmClient.send(new GetParameterCommand({ Name: parameterName }));
        if (result.Parameter?.Value) map[result.Parameter.Value] = appClient;
      } catch (error) {
        logger.warn({ message: "Failed to read app client id parameter", parameterName, error: error.message });
      }
    }),
  );
  return map;
}

/**
 * Resolve the Cognito app client id to the app client name. A client id this map doesn't
 * recognise (a new client added since the parameters were last read, or a stale cache) is
 * reported as-is, so it stays visible rather than silently dropped.
 *
 * @param {string} [clientId]
 * @returns {Promise<string|undefined>}
 */
export async function resolveAppClient(clientId) {
  if (!clientId) return undefined;
  const map = await loadAppClientIdMap();
  return map[clientId] || clientId;
}
