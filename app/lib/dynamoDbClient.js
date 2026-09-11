// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/dynamoDbClient.js
// Shared DynamoDB client with caching and endpoint switching support for tests

let __dynamoDbModule = null;
let __dynamoDbDocClient = null;
let __dynamoEndpointUsed = null;

/**
 * Get a cached DynamoDB DocumentClient instance.
 * The client is recreated if the endpoint changes (common in tests switching between dynalite instances).
 *
 * @param {Object} options - Optional configuration
 * @param {Object} options.marshallOptions - DynamoDB marshall options (e.g., { removeUndefinedValues: true })
 * @returns {Promise<{docClient: DynamoDBDocumentClient, module: Object}>} The document client and module reference
 */
export async function getDynamoDbDocClient(options = {}) {
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL;
  const currentEndpoint = endpoint || "";

  // Recreate client if endpoint changes after first import (common in tests)
  if (!__dynamoDbDocClient || __dynamoEndpointUsed !== currentEndpoint) {
    __dynamoDbModule = await import("@aws-sdk/lib-dynamodb");
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");

    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "eu-west-2",
      ...(endpoint ? { endpoint } : {}),
    });

    // Always use removeUndefinedValues to prevent "Cannot convert undefined" errors
    const defaultMarshallOptions = { removeUndefinedValues: true };
    const marshallOptions = options.marshallOptions ? { ...defaultMarshallOptions, ...options.marshallOptions } : defaultMarshallOptions;

    __dynamoDbDocClient = __dynamoDbModule.DynamoDBDocumentClient.from(client, { marshallOptions });
    __dynamoEndpointUsed = currentEndpoint;
  }

  return {
    docClient: __dynamoDbDocClient,
    module: __dynamoDbModule,
  };
}

/**
 * Reset the cached client (useful for testing)
 */
export function resetDynamoDbClient() {
  __dynamoDbModule = null;
  __dynamoDbDocClient = null;
  __dynamoEndpointUsed = null;
}

/**
 * Execute a DynamoDB command using the shared client
 *
 * @param {Function} commandBuilder - Function that receives the module and returns a command
 * @param {Object} options - Optional client configuration
 * @returns {Promise<any>} The command result
 *
 * @example
 * await executeDynamoDbCommand(
 *   (mod) => new mod.PutCommand({ TableName: 'table', Item: item }),
 *   { marshallOptions: { removeUndefinedValues: true } }
 * );
 */
export async function executeDynamoDbCommand(commandBuilder, options = {}) {
  const { docClient, module } = await getDynamoDbDocClient(options);
  const command = commandBuilder(module);
  return docClient.send(command);
}

/**
 * Get a resource name (table, bucket, etc.) from an environment variable
 * Reads at call time, not at module load time (important for tests that set env vars in beforeEach)
 *
 * @param {string} envVarName - The environment variable name
 * @param {boolean} throwIfMissing - If true, throw an error if the env var is not set
 * @returns {string} The environment variable value or empty string if not set
 *
 * @example
 * const tableName = getResourceName('BUNDLE_DYNAMODB_TABLE_NAME');
 * const bucket = getResourceName('DIYA_GL_BUCKET_NAME', true); // throws if not set
 */
export function getResourceName(envVarName, throwIfMissing = false) {
  const value = process.env[envVarName];
  if (!value && throwIfMissing) {
    throw new Error(`${envVarName} environment variable is required`);
  }
  return value || "";
}
