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
