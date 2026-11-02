// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-65 Capture AWS console figures as images for the operator dashboard
// - **Use when:** a figure the operator dashboard links to in the AWS console (a metric search, the web vitals, the alarms, the Bedrock counts, the X-Ray services, a sibling site's RUM) must be readable on the dashboard itself.
// - **Does:** consoleCapturePublish.js renders each entry of app/services/consoleCaptureCatalogue.js through read APIs only: GetMetricWidgetImage for the metric graphs, DescribeAlarms, one fixed Logs Insights query over the Bedrock invocation log group, and the X-Ray service graph. It writes one PNG per graph and one index.json to s3://<lake>/snapshots/<env>/console/. The prod run also reads ci, spreadsheets and gateway through sts:AssumeRole. One failed item records its error in the index and the others continue.
// - **Run:** `aws stepfunctions start-execution --state-machine-arn <env>-env-analytics-nightly`; the prod run captures at 02:15 UTC, the ci run on every execution
// - **Entry:** `app/functions/analytics/consoleCapturePublish.js:handler`
// - **Files:** app/functions/analytics/consoleCapturePublish.js, app/services/consoleCaptureCatalogue.js, app/lib/consoleCaptureStore.js, app/unit-tests/analytics/consoleCapturePublish.test.js, app/unit-tests/services/consoleCaptureCatalogue.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/ConsoleCapturePublish.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/ConsoleCapturePublishTest.java
// - **Keywords:** console capture, GetMetricWidgetImage, cloudwatch widget image, alarms table, x-ray service graph, bedrock invocations, cross-account read role, external id, operator dashboard images
// - **Related:** DATA-18, DATA-19, DATA-66
// @end-capability

// app/functions/analytics/consoleCapturePublish.js
//
// Runs inside the nightly state machine, after the pass figures publish: once a day in prod (the
// 02:15 UTC execution) and on every ci execution. It reads CloudWatch, CloudWatch Logs and X-Ray
// and writes what it reads to the analytics lake. It holds no write permission outside the lake's
// console prefix, reads no DynamoDB item, no secret and no customer object, and stores no log
// line: the Bedrock query keeps counts only.

import { CloudWatchClient, GetMetricWidgetImageCommand, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { XRayClient, GetServiceGraphCommand } from "@aws-sdk/client-xray";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import { consoleImageKey, consoleIndexKey } from "../../lib/consoleCaptureStore.js";
import {
  BEDROCK_QUERY,
  buildMetricWidget,
  itemsForTarget,
  regionForTarget,
  targetsForRun,
} from "../../services/consoleCaptureCatalogue.js";

const logger = createLogger({ source: "app/functions/analytics/consoleCapturePublish.js" });

export const ASSUMED_SESSION_SECONDS = 900;
const ALARM_ROW_LIMIT = 200;
const ALARM_REASON_LIMIT = 300;
const ERROR_TEXT_LIMIT = 300;
const QUERY_POLL_MILLISECONDS = 2000;
const QUERY_POLL_LIMIT = 30;

const ALARM_STATE_ORDER = { ALARM: 0, INSUFFICIENT_DATA: 1, OK: 2 };

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

function readRoleArns() {
  const raw = process.env.CONSOLE_CAPTURE_ROLE_ARNS;
  return raw ? JSON.parse(raw) : {};
}

function errorText(error) {
  const text = `${error?.name || "Error"}: ${error?.message || String(error)}`;
  return text.length > ERROR_TEXT_LIMIT ? text.slice(0, ERROR_TEXT_LIMIT) + "..." : text;
}

function clientsFor(region, credentials) {
  const config = credentials ? { region, credentials } : { region };
  return {
    cloudWatch: new CloudWatchClient(config),
    logs: new CloudWatchLogsClient(config),
    xray: new XRayClient(config),
  };
}

async function clientsForTarget({ targetKey, envName, roleArns, externalId, stsClient }) {
  const region = regionForTarget(targetKey);
  if (targetKey === envName) return clientsFor(region, undefined);
  const roleArn = roleArns[targetKey];
  if (!roleArn) throw new Error(`No read role is configured for ${targetKey}`);
  if (!externalId) throw new Error("CONSOLE_CAPTURE_EXTERNAL_ID is required to read another account");
  const assumed = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `console-capture-${targetKey}`,
      ExternalId: externalId,
      DurationSeconds: ASSUMED_SESSION_SECONDS,
    }),
  );
  return clientsFor(region, {
    accessKeyId: assumed.Credentials.AccessKeyId,
    secretAccessKey: assumed.Credentials.SecretAccessKey,
    sessionToken: assumed.Credentials.SessionToken,
  });
}

async function renderMetricImage({ item, clients, region }) {
  const widget = buildMetricWidget(item, region);
  const response = await clients.cloudWatch.send(
    new GetMetricWidgetImageCommand({ MetricWidget: JSON.stringify(widget), OutputFormat: "png" }),
  );
  if (!response.MetricWidgetImage || response.MetricWidgetImage.length === 0) {
    throw new Error("GetMetricWidgetImage returned no image");
  }
  return Buffer.from(response.MetricWidgetImage);
}

async function readAlarms({ item, clients }) {
  const alarms = [];
  let nextToken;
  do {
    const page = await clients.cloudWatch.send(
      new DescribeAlarmsCommand({
        AlarmNamePrefix: item.alarmNamePrefix,
        AlarmTypes: ["MetricAlarm", "CompositeAlarm"],
        NextToken: nextToken,
      }),
    );
    alarms.push(...(page.MetricAlarms || []), ...(page.CompositeAlarms || []));
    nextToken = page.NextToken;
  } while (nextToken);
  return alarms
    .map((alarm) => ({
      name: alarm.AlarmName,
      state: alarm.StateValue,
      reason: (alarm.StateReason || "").slice(0, ALARM_REASON_LIMIT),
      stateUpdatedAt: alarm.StateUpdatedTimestamp ? new Date(alarm.StateUpdatedTimestamp).toISOString() : null,
    }))
    .sort((a, b) => (ALARM_STATE_ORDER[a.state] ?? 3) - (ALARM_STATE_ORDER[b.state] ?? 3) || a.name.localeCompare(b.name))
    .slice(0, ALARM_ROW_LIMIT);
}

async function readBedrockCounts({ item, clients, now, sleep }) {
  const endTime = Math.floor(now.getTime() / 1000);
  const started = await clients.logs.send(
    new StartQueryCommand({
      logGroupName: item.logGroupName,
      startTime: endTime - item.windowHours * 3600,
      endTime,
      queryString: BEDROCK_QUERY,
      limit: 1000,
    }),
  );
  for (let attempt = 0; attempt < QUERY_POLL_LIMIT; attempt += 1) {
    const result = await clients.logs.send(new GetQueryResultsCommand({ queryId: started.queryId }));
    if (result.status === "Complete") {
      return (result.results || []).map((fields) => {
        const row = Object.fromEntries(fields.map((field) => [field.field, field.value]));
        return {
          bin: row["bin(1h)"],
          modelId: row.modelId,
          invocations: Number(row.invocations),
          inputTokens: Number(row.inputTokens),
          outputTokens: Number(row.outputTokens),
        };
      });
    }
    if (["Failed", "Cancelled", "Timeout"].includes(result.status)) {
      throw new Error(`The Bedrock query ended ${result.status}`);
    }
    await sleep(QUERY_POLL_MILLISECONDS);
  }
  throw new Error("The Bedrock query did not finish in time");
}

async function readServiceGraph({ item, clients, now }) {
  const services = [];
  let nextToken;
  do {
    const page = await clients.xray.send(
      new GetServiceGraphCommand({
        StartTime: new Date(now.getTime() - item.windowHours * 3600 * 1000),
        EndTime: now,
        NextToken: nextToken,
      }),
    );
    for (const node of page.Services || []) {
      const summary = node.SummaryStatistics || {};
      const requests = summary.TotalCount || 0;
      services.push({
        name: node.Name,
        type: node.Type || null,
        requests,
        errors: summary.ErrorStatistics?.TotalCount || 0,
        faults: summary.FaultStatistics?.TotalCount || 0,
        throttles: summary.ErrorStatistics?.ThrottleCount || 0,
        averageResponseMilliseconds: requests > 0 ? Math.round(((summary.TotalResponseTime || 0) / requests) * 1000) : null,
      });
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return services.sort((a, b) => b.faults - a.faults || b.errors - a.errors || b.requests - a.requests || a.name.localeCompare(b.name));
}

/**
 * Captures one catalogue entry. Never throws: a failure becomes an entry whose `error` names it.
 */
async function captureItem({ item, clients, region, envName, writeImage, now, sleep }) {
  const entry = {
    id: item.id,
    target: item.target,
    env: item.env,
    group: item.group,
    title: item.title,
    kind: item.kind,
    capturedAt: now.toISOString(),
  };
  try {
    if (item.kind === "metric-search" || item.kind === "rum") {
      const image = await renderMetricImage({ item, clients, region });
      const imageKey = consoleImageKey(envName, item.target, item.id);
      await writeImage(imageKey, image);
      logger.info({ message: "Captured widget image", id: item.id, bytes: image.length });
      return { ...entry, kind: "image", imageKey };
    }
    if (item.kind === "alarms") return { ...entry, rows: await readAlarms({ item, clients }) };
    if (item.kind === "bedrock") return { ...entry, rows: await readBedrockCounts({ item, clients, now, sleep }) };
    if (item.kind === "service-graph") return { ...entry, rows: await readServiceGraph({ item, clients, now }) };
    throw new Error(`Unknown item kind ${item.kind}`);
  } catch (error) {
    logger.warn({ message: "Console capture item failed", id: item.id, error: errorText(error) });
    return { ...entry, error: errorText(error) };
  }
}

/**
 * Runs the capture for the environment this Lambda is deployed in.
 *
 * @param {object} [dependencies] test seams: `s3Client`, `stsClient`, `clientsFor`, `now`, `sleep`
 */
export async function handler(_event, dependencies = {}) {
  const envName = requireEnvironment("ENVIRONMENT_NAME");
  const bucket = requireEnvironment("ANALYTICS_LAKE_BUCKET_NAME");
  const targetKeys = targetsForRun(envName);
  const roleArns = readRoleArns();
  const externalId = process.env.CONSOLE_CAPTURE_EXTERNAL_ID;
  const now = dependencies.now || new Date();
  const sleep = dependencies.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const s3Client = dependencies.s3Client || new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  const stsClient = dependencies.stsClient || new STSClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const buildClients = dependencies.clientsForTarget || clientsForTarget;

  const put = (key, body, contentType) =>
    s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  const writeImage = (key, image) => put(key, image, "image/png");

  const items = {};
  for (const targetKey of targetKeys) {
    const targetItems = itemsForTarget(targetKey);
    let clients;
    try {
      clients = await buildClients({ targetKey, envName, roleArns, externalId, stsClient });
    } catch (error) {
      logger.warn({ message: "Console capture could not reach a target", targetKey, error: errorText(error) });
      for (const item of targetItems) {
        items[item.id] = {
          id: item.id,
          target: item.target,
          env: item.env,
          group: item.group,
          title: item.title,
          kind: item.kind,
          capturedAt: now.toISOString(),
          error: errorText(error),
        };
      }
      continue;
    }
    const region = regionForTarget(targetKey);
    for (const item of targetItems) {
      items[item.id] = await captureItem({ item, clients, region, envName, writeImage, now, sleep });
    }
  }

  const index = { generatedAt: now.toISOString(), environment: envName, items };
  await put(consoleIndexKey(envName), JSON.stringify(index), "application/json");

  const failed = Object.values(items).filter((entry) => entry.error).length;
  logger.info({ message: "Console capture published", environment: envName, items: Object.keys(items).length, failed });
  return { items: Object.keys(items).length, failed };
}
