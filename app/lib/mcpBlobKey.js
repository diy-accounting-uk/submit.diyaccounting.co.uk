// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpBlobKey.js
// The key the MCP facade signs its state blobs with and the codes entries seal their codes with.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { validateEnv } from "./env.js";

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
let blobKeyPromise = null;

/**
 * The blob key, read once per container: `MCP_OAUTH_BLOB_KEY` on local lanes, otherwise the
 * Secrets Manager secret named by `MCP_OAUTH_BLOB_KEY_SECRET_ARN`.
 */
export function loadBlobKey() {
  if (!blobKeyPromise) {
    blobKeyPromise = (async () => {
      if (process.env.MCP_OAUTH_BLOB_KEY) return process.env.MCP_OAUTH_BLOB_KEY;
      validateEnv(["MCP_OAUTH_BLOB_KEY_SECRET_ARN"]);
      const result = await smClient.send(new GetSecretValueCommand({ SecretId: process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN }));
      if (!result.SecretString) throw new Error("MCP OAuth blob key secret has no SecretString");
      return result.SecretString;
    })().catch((error) => {
      blobKeyPromise = null;
      throw error;
    });
  }
  return blobKeyPromise;
}

export function resetBlobKeyCache() {
  blobKeyPromise = null;
}
