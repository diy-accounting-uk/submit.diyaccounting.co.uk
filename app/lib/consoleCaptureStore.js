// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/consoleCaptureStore.js
//
// Where the console capture keeps its output in the analytics lake, and how the API routes read
// it back. One index.json lists every item of the last run; each image is one PNG beside it.
// Each run overwrites the last run.

export function consoleIndexKey(envName) {
  return `snapshots/${envName}/console/index.json`;
}

export function consoleImageKey(envName, targetKey, captureId) {
  return `snapshots/${envName}/console/${targetKey}/${captureId}.png`;
}

let cachedS3Client = null;

async function getS3Client() {
  if (!cachedS3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function requireLakeEnvironment() {
  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  const envName = process.env.ENVIRONMENT_NAME;
  if (!bucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");
  return { bucket, envName };
}

async function getObjectOrNull(key) {
  const { bucket } = requireLakeEnvironment();
  const client = await getS3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    return await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (error.name === "NoSuchKey") return null;
    throw error;
  }
}

/**
 * Reads `snapshots/<env>/console/index.json`.
 *
 * @returns {Promise<object|null>} the index, or null when no capture has run yet
 */
export async function readConsoleIndex() {
  const { envName } = requireLakeEnvironment();
  const response = await getObjectOrNull(consoleIndexKey(envName));
  if (!response) return null;
  return JSON.parse(await response.Body.transformToString("utf8"));
}

/**
 * Reads one captured PNG by the key the index holds.
 *
 * @returns {Promise<Buffer|null>} the image, or null when the object is missing
 */
export async function readConsoleImage(imageKey) {
  const response = await getObjectOrNull(imageKey);
  if (!response) return null;
  return Buffer.from(await response.Body.transformToByteArray());
}
