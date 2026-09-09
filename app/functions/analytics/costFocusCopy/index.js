// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Nightly copy of new FOCUS 1.2 export objects from the management account's cost bucket into
// this account's own analytics lake, at curated/cost/focus/dt=<today>/<basename>. A zip Lambda of
// its own rather than a fourth branch on IngestionStack's Docker-bundled jobs, so this stays
// independent of that image's build and the nightly Step Functions chain it feeds: a missed or
// failed cost copy should never stop the Stripe, GA4 or data-quality jobs that chain invokes.
//
// The export bucket lives in a different account. Its bucket policy names this Lambda's own
// execution role by ARN, so a plain cross-account CopyObjectCommand works with no assumed role:
// s3:GetObject on the source is granted there, s3:PutObject on the destination is granted here.

// A self-contained zip Lambda (Code.fromAsset zips only this directory), so it logs with plain
// console.* rather than the shared app/lib/logger.js: that module lives outside this directory
// and a relative import to it would not exist in the deployed package.
import { S3Client, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });

/** Required environment configuration, read once so a missing variable fails fast. */
export function readConfig() {
  const sourceBucket = process.env.FOCUS_EXPORT_BUCKET_NAME;
  const sourcePrefix = process.env.FOCUS_EXPORT_S3_PREFIX || "focus";
  const destinationBucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  const destinationPrefix = process.env.COST_FOCUS_CURATED_PREFIX || "curated/cost/focus";

  const missing = Object.entries({ sourceBucket, destinationBucket })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for costFocusCopy: ${missing.join(", ")}`);
  }

  return { sourceBucket, sourcePrefix, destinationBucket, destinationPrefix };
}

/**
 * Objects modified within this window get copied on every run, so a run that missed a delivery
 * (a cold start, a throttle, a skipped schedule) still picks it up the next night rather than
 * losing that day permanently.
 */
const LOOKBACK_HOURS = 48;

/**
 * @param {import("@aws-sdk/client-s3").S3Client} client
 * @param {{sourceBucket: string, sourcePrefix: string}} config
 * @param {Date} now
 * @returns {Promise<{key: string, basename: string}[]>}
 */
export async function listRecentExportObjects(client, config, now) {
  const cutoff = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const recent = [];
  let continuationToken;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.sourceBucket,
        Prefix: `${config.sourcePrefix}/`,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of response.Contents || []) {
      if (!object.Key.endsWith(".parquet")) continue;
      if (object.LastModified && new Date(object.LastModified) < cutoff) continue;
      recent.push({ key: object.Key, basename: object.Key.split("/").pop() });
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return recent;
}

/** Today's dt=YYYY-MM-DD partition value, in UTC. */
export function todayPartition(now) {
  return now.toISOString().slice(0, 10);
}

export async function handler(event) {
  const config = readConfig();
  const now = event?.now ? new Date(event.now) : new Date();
  const partition = todayPartition(now);

  const objects = await listRecentExportObjects(s3Client, config, now);
  console.log(
    JSON.stringify({
      message: "Listed FOCUS export objects to copy",
      sourceBucket: config.sourceBucket,
      count: objects.length,
    }),
  );

  let copied = 0;
  for (const object of objects) {
    const destinationKey = `${config.destinationPrefix}/dt=${partition}/${object.basename}`;
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: config.destinationBucket,
        Key: destinationKey,
        CopySource: `/${config.sourceBucket}/${object.key}`,
      }),
    );
    copied += 1;
  }

  console.log(
    JSON.stringify({ message: "Copied FOCUS export objects into the analytics lake", copied, partition }),
  );
  return { copied, partition };
}
