// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/searchConsolePull.js
//
// Pulls Search Console search analytics for the two domain properties and writes one gzipped
// NDJSON object per property and day under curated/searchconsole/report=queries/dt=<day>/.
// A day's object is replaced on every run, so the window of three days never doubles a row.
// Search Console data lags about two days: the window is the three days that ended two days
// before the run date.

import { gzipSync } from "zlib";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { federationSettings, createFederatedGoogleAuth } from "./googleWorkloadIdentity.js";

export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SEARCH_ANALYTICS_URL = "https://www.googleapis.com/webmasters/v3/sites";
const DIMENSIONS = ["date", "page", "query", "country", "device"];
// The domains in infra/google/searchconsole/searchconsole.toml.
export const PROPERTIES = ["sc-domain:diyaccounting.co.uk", "sc-domain:diya-gl.co.uk"];
export const ROW_LIMIT = 25000;
const WINDOW_DAYS = 3;
const LAG_DAYS = 2;

/**
 * The days a run pulls: the three days that end two days before the run date, oldest first.
 *
 * @param {Date} [now]
 * @returns {string[]} "YYYY-MM-DD"
 */
export function searchConsolePullDays(now = new Date()) {
  return Array.from({ length: WINDOW_DAYS }, (_, index) => LAG_DAYS + WINDOW_DAYS - 1 - index).map((daysBack) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)).toISOString().slice(0, 10),
  );
}

/**
 * One searchAnalytics row as a flat record. `property` is the domain without the `sc-domain:`
 * prefix, so the table can tell the two properties apart.
 */
export function rowToRecord(property, row) {
  const [date, page, query, country, device] = row.keys;
  return {
    property: property.replace(/^sc-domain:/, ""),
    date,
    page,
    query,
    country,
    device,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

let cachedAuth = null;
let cachedFederationKey = null;

function getAuth() {
  const settings = federationSettings();
  const federationKey = JSON.stringify(settings);
  if (!cachedAuth || cachedFederationKey !== federationKey) {
    cachedAuth = createFederatedGoogleAuth({ ...settings, scopes: [SEARCH_CONSOLE_SCOPE] });
    cachedFederationKey = federationKey;
  }
  return cachedAuth;
}

async function getAccessToken() {
  // getClient returns the federated client as given, so no project lookup happens; a lookup
  // fails with a scope-limited token.
  const client = await getAuth().getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Google auth client returned no access token");
  return token;
}

async function queryPage(token, property, day, startRow) {
  const response = await fetch(`${SEARCH_ANALYTICS_URL}/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: day,
      endDate: day,
      dimensions: DIMENSIONS,
      dataState: "final",
      rowLimit: ROW_LIMIT,
      startRow,
    }),
  });
  if (!response.ok) {
    throw new Error(`Search Console ${property} ${day} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return (await response.json()).rows ?? [];
}

/**
 * Every row of one property and day, paged with startRow until a page is short.
 */
export async function pullPropertyDay(token, property, day) {
  const records = [];
  for (let startRow = 0; ; startRow += ROW_LIMIT) {
    const rows = await queryPage(token, property, day, startRow);
    for (const row of rows) records.push(rowToRecord(property, row));
    if (rows.length < ROW_LIMIT) return records;
  }
}

export function searchConsoleObjectKey(property, day) {
  return `curated/searchconsole/report=queries/dt=${day}/${property.replace(/^sc-domain:/, "")}.json.gz`;
}

function toNdjsonGzip(records) {
  const ndjson = records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  return gzipSync(Buffer.from(ndjson, "utf8"));
}

/**
 * Pull the window for both properties and write each property and day. A failure on one
 * property and day does not stop the others; the errors come back for the caller to raise.
 *
 * @param {{s3Client: {send: Function}, bucket: string, days: string[]}} options
 * @returns {Promise<{written: Array<{key: string, rows: number}>, errors: string[]}>}
 */
export async function pullSearchConsole({ s3Client, bucket, days }) {
  const token = await getAccessToken();
  const written = [];
  const errors = [];
  for (const day of days) {
    for (const property of PROPERTIES) {
      try {
        const records = await pullPropertyDay(token, property, day);
        const key = searchConsoleObjectKey(property, day);
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: toNdjsonGzip(records),
            ContentType: "application/json",
            ContentEncoding: "gzip",
          }),
        );
        written.push({ key, rows: records.length });
      } catch (error) {
        errors.push(`${property} ${day}: ${error.message}`);
      }
    }
  }
  return { written, errors };
}
