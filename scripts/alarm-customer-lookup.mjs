#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/alarm-customer-lookup.mjs
//
// From a prod submission-failure alarm, finds the customer behind each failed submission in the
// alarm's window and writes the result to one Markdown file. The file holds personal data, so the
// caller commits it to the private repository and never to the issue or the run summary: this
// script prints counts only.
//
// Every read is a Query on a known key. Nothing here scans a customer table: activity events come
// from Athena, the HMRC exchanges and bundles from DynamoDB Query on the hashed sub, and the
// account from Cognito ListUsers filtered by sub.
//
//   node scripts/alarm-customer-lookup.mjs --alarm-name prod-env-hmrc-submission-failure \
//     --timestamp 2026-09-03T21:50:23.618Z --issue-number 301 --issue-url <url> --out /tmp/lookup.md

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CognitoIdentityProviderClient, ListUserPoolsCommand, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

const WINDOW_BEFORE_MS = 60 * 60 * 1000;
const WINDOW_AFTER_MS = 5 * 60 * 1000;
const MAX_CUSTOMERS = 5;
const QUERY_POLL_MS = 2000;
const QUERY_TIMEOUT_MS = 120000;

export function parseArgs(argv) {
  const opts = { alarmName: "", timestamp: "", issueNumber: "", issueUrl: "", out: "", region: "eu-west-2" };
  const names = {
    "--alarm-name": "alarmName",
    "--timestamp": "timestamp",
    "--issue-number": "issueNumber",
    "--issue-url": "issueUrl",
    "--out": "out",
    "--region": "region",
  };
  for (let i = 0; i < argv.length; i++) {
    const key = names[argv[i]];
    if (!key) throw new Error(`unknown argument: ${argv[i]}`);
    opts[key] = argv[++i] ?? "";
  }
  if (!opts.alarmName || !opts.timestamp || !opts.out) throw new Error("--alarm-name, --timestamp and --out are required");
  return opts;
}

export function envPrefixOf(alarmName) {
  const match = /^(prod|ci)-env-/.exec(alarmName);
  if (!match) throw new Error(`alarm name has no env prefix: ${alarmName}`);
  return `${match[1]}-env`;
}

export function windowOf(timestamp) {
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) throw new Error(`unparseable timestamp: ${timestamp}`);
  return { start: new Date(at - WINDOW_BEFORE_MS), end: new Date(at + WINDOW_AFTER_MS) };
}

export function athenaTimestamp(date) {
  return date.toISOString().replace("T", " ").replace("Z", "").slice(0, 19);
}

// The failure events each alarm's metric counts, as the writers in app/functions/hmrc emit them.
const FAILURE_EVENTS = {
  "hmrc-submission-failure": ["vat-return-failed"],
  "itsa-submission-failure": [
    "itsa-annual-submission-failed",
    "itsa-final-declaration-failed",
    "itsa-losses-and-claims-deletion-failed",
    "itsa-losses-and-claims-failed",
    "itsa-self-employment-period-failed",
    "itsa-tax-liability-adjustments-deletion-failed",
    "itsa-tax-liability-adjustments-failed",
    "itsa-uk-property-annual-submission-failed",
    "itsa-uk-property-period-failed",
  ],
};

export function failureEventsOf(alarmName) {
  const events = FAILURE_EVENTS[alarmName.replace(/^(prod|ci)-env-/, "")];
  if (!events) throw new Error(`no failure events known for alarm: ${alarmName}`);
  return events;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function activityQuery(start, end, events) {
  const names = events.map((name) => `'${name}'`).join(", ");
  return `SELECT CAST(event_ts AS varchar) AS event_ts, event, actor, flow, outcome, failure, hashed_sub, bundle_id, hmrc_status, request_id, summary
FROM activity_events_all
WHERE dt BETWEEN DATE '${isoDay(start)}' AND DATE '${isoDay(end)}'
  AND event_ts BETWEEN TIMESTAMP '${athenaTimestamp(start)}' AND TIMESTAMP '${athenaTimestamp(end)}'
  AND actor <> 'test-user' AND hashed_sub IS NOT NULL AND hashed_sub <> ''
  AND event IN (${names})
ORDER BY event_ts`;
}

export function cognitoSubOf(hmrcItems) {
  for (const item of hmrcItems) {
    const header = item?.httpRequest?.headers?.["Gov-Client-User-IDs"];
    const match = typeof header === "string" ? /cognito=([^&,\s]+)/.exec(header) : null;
    if (match) return match[1];
  }
  return "";
}

function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function table(headers, rows) {
  if (rows.length === 0) return "None.\n";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
    "",
  ].join("\n");
}

/**
 * Renders the per-alarm file. `customers` is a list of
 * { hashedSub, events, hmrcExchanges, account, bundles }, already read from AWS.
 */
export function formatLookupFile({ alarmName, issueNumber, issueUrl, timestamp, window, customers }) {
  const lines = [
    `# ${alarmName} #${issueNumber || "n/a"}`,
    "",
    `- Issue: ${issueUrl || "n/a"}`,
    `- Alarm timestamp: ${timestamp}`,
    `- Window: ${window.start.toISOString()} to ${window.end.toISOString()}`,
    `- Customers with a failed submission in the window: ${customers.length}`,
    "",
    "This file holds personal data. It lives in the private repository only.",
    "",
  ];
  if (customers.length === 0) {
    lines.push("No non-test activity event with a failure was found in the window.", "");
  }
  for (const customer of customers) {
    lines.push(`## Customer ${customer.hashedSub}`, "");
    const account = customer.account;
    if (account) {
      lines.push(
        `- Email: ${account.email || "not on the account"}`,
        `- Username: ${account.username}`,
        `- Status: ${account.status}`,
        `- Account created: ${account.created}`,
        "",
      );
    } else {
      lines.push("- Account: not found in Cognito from the request headers", "");
    }
    lines.push("### Failed events", "");
    lines.push(
      table(
        ["Time", "Event", "Failure", "HMRC status", "Request id", "Summary"],
        customer.events.map((e) => [e.event_ts, e.event, e.failure, e.hmrc_status, e.request_id, e.summary]),
      ),
    );
    lines.push("### What HMRC answered", "");
    lines.push(
      table(
        ["Time", "Method", "Status", "Request id", "Message"],
        customer.hmrcExchanges.map((x) => [x.createdAt, x.method, x.status, x.requestId, x.message]),
      ),
    );
    lines.push("### Entitlement", "");
    lines.push(
      table(
        ["Bundle", "Tokens consumed"],
        customer.bundles.map((b) => [b.bundleId, b.tokensConsumed]),
      ),
    );
    lines.push(
      "### Did they write to support",
      "",
      account?.email
        ? `Not searched here. Search both mailboxes for ${account.email}: corpus-loom search, sources mail-support and mail-antony, lexical.`
        : "No email to search for.",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function runAthena(athena, sql, region) {
  const started = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      WorkGroup: `${process.env.LOOKUP_ENV_PREFIX}-analytics`,
      QueryExecutionContext: { Database: `${process.env.LOOKUP_ENV_PREFIX.replace("-", "_")}_analytics` },
    }),
  );
  const id = started.QueryExecutionId;
  const deadline = Date.now() + QUERY_TIMEOUT_MS;
  for (;;) {
    const status = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    const state = status.QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") throw new Error(`athena query ${state} in ${region}`);
    if (Date.now() > deadline) throw new Error("athena query timed out");
    await new Promise((resolve) => setTimeout(resolve, QUERY_POLL_MS));
  }
  const rows = [];
  let nextToken;
  do {
    const page = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: id, NextToken: nextToken }));
    rows.push(...(page.ResultSet?.Rows ?? []));
    nextToken = page.NextToken;
  } while (nextToken);
  if (rows.length === 0) return [];
  const header = rows[0].Data.map((d) => d.VarCharValue);
  return rows.slice(1).map((row) => Object.fromEntries(row.Data.map((d, i) => [header[i], d.VarCharValue ?? ""])));
}

async function queryByHashedSub(dynamo, table, hashedSub) {
  const items = [];
  let lastKey;
  do {
    const page = await dynamo.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "hashedSub = :h",
        ExpressionAttributeValues: { ":h": { S: hashedSub } },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(page.Items ?? []).map((item) => unmarshall(item)));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function lookupAccount(cognito, envPrefix, sub) {
  if (!sub) return undefined;
  const pools = await cognito.send(new ListUserPoolsCommand({ MaxResults: 60 }));
  const pool = (pools.UserPools ?? []).find((p) => p.Name === `${envPrefix}-user-pool`);
  if (!pool) return undefined;
  const result = await cognito.send(new ListUsersCommand({ UserPoolId: pool.Id, Filter: `sub = "${sub}"`, Limit: 1 }));
  const user = result.Users?.[0];
  if (!user) return undefined;
  return {
    username: user.Username,
    status: user.UserStatus,
    created: user.UserCreateDate?.toISOString() ?? "",
    email: user.Attributes?.find((a) => a.Name === "email")?.Value ?? "",
  };
}

export async function collectCustomers({ envPrefix, alarmName, window, region }) {
  process.env.LOOKUP_ENV_PREFIX = envPrefix;
  const athena = new AthenaClient({ region });
  const dynamo = new DynamoDBClient({ region });
  const cognito = new CognitoIdentityProviderClient({ region });
  const events = await runAthena(athena, activityQuery(window.start, window.end, failureEventsOf(alarmName)), region);
  const bySub = new Map();
  for (const event of events) {
    if (!bySub.has(event.hashed_sub)) bySub.set(event.hashed_sub, []);
    bySub.get(event.hashed_sub).push(event);
  }
  const customers = [];
  for (const [hashedSub, subEvents] of [...bySub].slice(0, MAX_CUSTOMERS)) {
    const hmrcItems = (await queryByHashedSub(dynamo, `${envPrefix}-hmrc-api-requests`, hashedSub)).filter(
      (item) => item.createdAt >= window.start.toISOString() && item.createdAt <= window.end.toISOString(),
    );
    hmrcItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const bundles = await queryByHashedSub(dynamo, `${envPrefix}-bundles`, hashedSub);
    const account = await lookupAccount(cognito, envPrefix, cognitoSubOf(hmrcItems));
    customers.push({
      hashedSub,
      events: subEvents,
      hmrcExchanges: hmrcItems.map((item) => {
        const body = item.httpResponse?.body;
        const parsed = typeof body === "string" ? safeParse(body) : body;
        return {
          createdAt: item.createdAt,
          method: item.method,
          status: item.httpResponse?.statusCode,
          requestId: item.requestId,
          message: parsed?.message ?? "",
        };
      }),
      account,
      bundles: bundles.map((b) => ({ bundleId: b.bundleId, tokensConsumed: b.tokensConsumed })),
    });
  }
  return customers;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const envPrefix = envPrefixOf(opts.alarmName);
  const window = windowOf(opts.timestamp);
  const customers = await collectCustomers({ envPrefix, alarmName: opts.alarmName, window, region: opts.region });
  writeFileSync(
    opts.out,
    formatLookupFile({
      alarmName: opts.alarmName,
      issueNumber: opts.issueNumber,
      issueUrl: opts.issueUrl,
      timestamp: opts.timestamp,
      window,
      customers,
    }),
  );
  console.log(`wrote ${opts.out}: ${customers.length} customer(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`alarm customer lookup failed: ${error.message}`);
    process.exit(1);
  });
}
