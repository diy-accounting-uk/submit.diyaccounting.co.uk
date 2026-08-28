// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/dynamoStreamToFirehose.js
//
// One Lambda, four DynamoDB Streams event source mappings (receipts, bundles, subscriptions,
// passes). Each stream record is redacted down to a per-table whitelist and forwarded to that
// table's own Firehose delivery stream.
//
// This is a whitelist, not a blacklist: only the fields named in PROJECTORS below leave the
// table. Nothing here spreads an image onto the output row, so an attribute added to a table
// later needs a deliberate line here before it reaches the lake.

import { unmarshall } from "@aws-sdk/util-dynamodb";
import { FirehoseClient, PutRecordBatchCommand } from "@aws-sdk/client-firehose";
import { hashSub, initializeSalt } from "../../services/subHasher.js";
import { toParquetTimestamp } from "./activityEventTransform.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/dynamoStreamToFirehose.js" });

const firehoseClient = new FirehoseClient({});

// Firehose's own batch ceiling.
const PUT_RECORD_BATCH_LIMIT = 500;

const STRIPE_SUBSCRIPTION_PK_PREFIX = "stripe#";

/**
 * The receipt item stores HMRC's submission *response*, never the request body that carries
 * the nine VAT box values or the VRN, so nothing box-shaped needs excluding here — it was never
 * on this table to begin with.
 */
function projectReceipt(image) {
  const receipt = image.receipt ?? {};
  return {
    hashed_sub: image.hashedSub ?? null,
    receipt_id: image.receiptId ?? null,
    created_at: image.createdAt ?? null,
    actor: image.actor ?? null,
    form_bundle_number: receipt.formBundleNumber ?? null,
    processing_date: receipt.processingDate ?? null,
    charge_ref_number: receipt.chargeRefNumber ?? null,
  };
}

function projectBundle(image) {
  return {
    hashed_sub: image.hashedSub ?? null,
    bundle_id: image.bundleId ?? null,
    granted_at: image.createdAt ?? null,
    expires_at: image.expiry ?? null,
    ttl: image.ttl ?? null,
  };
}

/**
 * The subscriptions table's partition key is "stripe#<subscriptionId>", not a sub of any kind,
 * so the subscription id is recovered by stripping that prefix rather than by hashing. The
 * user's hashed sub is already a plain attribute on the item.
 */
function projectSubscription(image) {
  return {
    hashed_sub: image.hashedSub ?? null,
    bundle_id: image.bundleId ?? null,
    subscription_id: stripSubscriptionPrefix(image.pk),
    status: image.status ?? null,
    current_period_end: image.currentPeriodEnd ?? null,
    cancel_at_period_end: image.cancelAtPeriodEnd ?? null,
  };
}

function stripSubscriptionPrefix(pk) {
  if (typeof pk !== "string") return null;
  return pk.startsWith(STRIPE_SUBSCRIPTION_PK_PREFIX) ? pk.slice(STRIPE_SUBSCRIPTION_PK_PREFIX.length) : pk;
}

/**
 * The passes table's partition key is "pass#<redemption code>": a secret that unlocks the
 * bundle, not a user identifier. It is hashed with the same HMAC helper the app uses for subs
 * so a raw redeemable code never leaves the table, while still leaving a stable join key behind.
 * `issuedBy` is already a hashed sub by the time it lands on the item, so it passes through as-is.
 */
function projectPass(image) {
  return {
    pass_id: typeof image.pk === "string" ? hashSub(image.pk) : null,
    pass_type_id: image.passTypeId ?? null,
    bundle_id: image.bundleId ?? null,
    issued_by: image.issuedBy ?? null,
    created_at: image.createdAt ?? null,
    updated_at: image.updatedAt ?? null,
    use_count: image.useCount ?? null,
    revoked_at: image.revokedAt ?? null,
  };
}

const PROJECTORS = {
  receipts: projectReceipt,
  bundles: projectBundle,
  subscriptions: projectSubscription,
  passes: projectPass,
};

/**
 * Resolve the whitelist key ("receipts", "bundles", ...) for a physical table name such as
 * "ci-env-receipts". Throws rather than falling back to any kind of pass-through, because a
 * table this function does not recognise is a table this function has no whitelist for.
 *
 * @param {string} tableName
 * @returns {string}
 */
export function resolveTableKind(tableName) {
  const kind = Object.keys(PROJECTORS).find((candidate) => tableName?.endsWith(`-${candidate}`));
  if (!kind) {
    throw new Error(`No redaction whitelist for DynamoDB table: ${tableName}`);
  }
  return kind;
}

/**
 * Project one DynamoDB Streams record down to its table's whitelist.
 *
 * A REMOVE event carries no NewImage, so it projects from OldImage; INSERT and MODIFY always
 * carry a NewImage and project from that.
 *
 * @param {string} tableKind - one of the PROJECTORS keys
 * @param {object|null} newImage - unmarshalled NewImage, or null
 * @param {object|null} oldImage - unmarshalled OldImage, or null
 * @param {string} eventName - INSERT | MODIFY | REMOVE
 * @returns {object}
 */
export function projectFields(tableKind, newImage, oldImage, eventName) {
  const projector = PROJECTORS[tableKind];
  if (!projector) {
    throw new Error(`No redaction whitelist for DynamoDB table kind: ${tableKind}`);
  }
  const image = eventName === "REMOVE" ? oldImage : newImage;
  return projector(image ?? {});
}

/**
 * Resolve the physical table name from a DynamoDB Streams event source ARN, e.g.
 * "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-receipts/stream/2026-01-01T00:00:00.000"
 * yields "ci-env-receipts".
 *
 * @param {string} eventSourceArn
 * @returns {string}
 */
export function resolveTableName(eventSourceArn) {
  const match = /table\/([^/]+)\//.exec(eventSourceArn ?? "");
  if (!match) {
    throw new Error(`Cannot resolve a table name from eventSourceARN: ${eventSourceArn}`);
  }
  return match[1];
}

/**
 * Build one flat lake row from a single DynamoDB Streams record.
 *
 * @param {string} tableKind
 * @param {object} record - one entry of event.Records
 * @returns {object}
 */
export function buildRow(tableKind, record) {
  const eventName = record.eventName;
  const newImage = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
  const oldImage = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage) : null;
  const approximateCreationDateTime = record.dynamodb?.ApproximateCreationDateTime;
  const changeTs =
    typeof approximateCreationDateTime === "number"
      ? toParquetTimestamp(new Date(approximateCreationDateTime * 1000).toISOString())
      : null;

  return {
    change_ts: changeTs,
    change_type: eventName ?? null,
    source_table: tableKind,
    env: process.env.ENVIRONMENT_NAME ?? null,
    ...projectFields(tableKind, newImage, oldImage, eventName),
  };
}

/**
 * Send up to PUT_RECORD_BATCH_LIMIT rows to one delivery stream, returning the sequence numbers
 * of any row Firehose itself rejected.
 *
 * @param {string} deliveryStreamName
 * @param {Array<{row: object, sequenceNumber: string}>} entries
 * @returns {Promise<string[]>} failed sequence numbers
 */
async function putRecordBatch(deliveryStreamName, entries) {
  const failedSequenceNumbers = [];
  for (let offset = 0; offset < entries.length; offset += PUT_RECORD_BATCH_LIMIT) {
    const chunk = entries.slice(offset, offset + PUT_RECORD_BATCH_LIMIT);
    try {
      const response = await firehoseClient.send(
        new PutRecordBatchCommand({
          DeliveryStreamName: deliveryStreamName,
          Records: chunk.map(({ row }) => ({ Data: Buffer.from(JSON.stringify(row) + "\n", "utf8") })),
        }),
      );
      if (response.FailedPutCount > 0) {
        (response.RequestResponses ?? []).forEach((result, index) => {
          if (result.ErrorCode) {
            failedSequenceNumbers.push(chunk[index].sequenceNumber);
          }
        });
      }
    } catch (err) {
      logger.error({
        message: "PutRecordBatch call failed for delivery stream",
        deliveryStreamName,
        error: err.message,
      });
      chunk.forEach(({ sequenceNumber }) => failedSequenceNumbers.push(sequenceNumber));
    }
  }
  return failedSequenceNumbers;
}

/**
 * DynamoDB Streams handler: four event source mappings share this one function.
 *
 * `STREAM_TARGETS` is a JSON map of physical table name to delivery stream name, so the same
 * code serves all four tables without a table-specific Lambda each.
 *
 * A record that fails to project (unrecognised table, bad image) or fails to deliver comes back
 * in `batchItemFailures` by its stream sequence number, which tells the event source mapping to
 * retry only that record onward, per `bisectBatchOnError`.
 *
 * @param {object} event - {Records: [...]}
 * @returns {Promise<{batchItemFailures: Array<{itemIdentifier: string}>}>}
 */
export async function handler(event) {
  await initializeSalt();

  const streamTargets = JSON.parse(process.env.STREAM_TARGETS ?? "{}");
  const batchItemFailures = [];
  const entriesByStream = new Map();

  for (const record of event?.Records ?? []) {
    const sequenceNumber = record.dynamodb?.SequenceNumber;
    try {
      const tableName = resolveTableName(record.eventSourceARN);
      const deliveryStreamName = streamTargets[tableName];
      if (!deliveryStreamName) {
        throw new Error(`No delivery stream configured for table: ${tableName}`);
      }
      const tableKind = resolveTableKind(tableName);
      const row = buildRow(tableKind, record);
      if (!entriesByStream.has(deliveryStreamName)) {
        entriesByStream.set(deliveryStreamName, []);
      }
      entriesByStream.get(deliveryStreamName).push({ row, sequenceNumber });
    } catch (err) {
      logger.error({
        message: "DynamoDB stream record could not be projected",
        eventSourceARN: record.eventSourceARN,
        sequenceNumber,
        error: err.message,
      });
      if (sequenceNumber) {
        batchItemFailures.push({ itemIdentifier: sequenceNumber });
      }
    }
  }

  for (const [deliveryStreamName, entries] of entriesByStream) {
    const failedSequenceNumbers = await putRecordBatch(deliveryStreamName, entries);
    failedSequenceNumbers.forEach((sequenceNumber) => batchItemFailures.push({ itemIdentifier: sequenceNumber }));
  }

  logger.info({
    message: "Processed DynamoDB stream batch",
    recordCount: event?.Records?.length ?? 0,
    failedCount: batchItemFailures.length,
  });

  return { batchItemFailures };
}
