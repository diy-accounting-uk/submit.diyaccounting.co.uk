// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/fxRatePull.js
//
// Nightly job that pulls the European Central Bank's euro reference rates for the last 90
// working days and writes one gzipped NDJSON object per rate date under the lake's curated/fx/
// prefix: the dollars and the pounds one euro buys, and the pounds one dollar buys (the cross
// rate). The operator dashboard converts the dollar AWS bill to pounds with it. The ECB
// publishes no rate for a weekend or a TARGET holiday, so those days have no object, and
// v_usd_gbp_daily carries the last rate forward over them. The feed needs no credential.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import { toNdjsonGzip } from "./paypalDonationsPull.js";

const logger = createLogger({ source: "app/functions/analytics/fxRatePull.js" });

export const ECB_NINETY_DAY_FEED_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

/**
 * The USD and GBP rates of each date in an ECB eurofxref feed. A date whose block lacks either
 * currency is left out.
 *
 * @param {string} xml - the feed body
 * @returns {Array<{date: string, usd_per_eur: number, gbp_per_eur: number, gbp_per_usd: number}>}
 */
export function parseEcbRates(xml) {
  const rows = [];
  for (const [, date, body] of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)) {
    const rateOf = (currency) => {
      const match = body.match(new RegExp(`currency=['"]${currency}['"]\\s+rate=['"]([0-9.]+)['"]`));
      return match ? Number(match[1]) : null;
    };
    const usdPerEur = rateOf("USD");
    const gbpPerEur = rateOf("GBP");
    if (!usdPerEur || !gbpPerEur) continue;
    rows.push({ date, usd_per_eur: usdPerEur, gbp_per_eur: gbpPerEur, gbp_per_usd: gbpPerEur / usdPerEur });
  }
  return rows;
}

export function objectKey(dateStr) {
  return `curated/fx/fx_rates/dt=${dateStr}/fx_rates.json.gz`;
}

/**
 * Pull the ECB reference rates into the lake, one object per rate date. Re-running rewrites the
 * same objects.
 *
 * @returns {Promise<{days: number}>}
 */
export async function handler() {
  const bucket = requireEnv("ANALYTICS_LAKE_BUCKET_NAME");
  const response = await fetch(ECB_NINETY_DAY_FEED_URL);
  if (!response.ok) throw new Error(`${response.status} from the ECB reference rate feed`);
  const rows = parseEcbRates(await response.text());
  if (rows.length === 0) throw new Error("The ECB reference rate feed held no USD and GBP rates");

  for (const row of rows) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey(row.date),
        Body: toNdjsonGzip([row]),
        ContentType: "application/json",
        ContentEncoding: "gzip",
      }),
    );
  }
  logger.info({ message: "FX rate pull complete", days: rows.length, latest: rows[0].date });
  return { days: rows.length };
}
