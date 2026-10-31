// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-04 Stream DynamoDB table changes into the lake
// - **Use when:** a DynamoDB table's inserts/updates/deletes must be redacted and streamed into the lake.
// - **Does:** dynamoStreamToFirehose.js serves five DynamoDB Streams event source mappings for receipts, bundles, subscriptions, passes and commissions. Its handler redacts each record through a per-table field whitelist and forwards it by Firehose PutRecordBatch. A record that fails to project or deliver returns a batchItemFailure by sequence number.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/analytics/dynamoStreamToFirehose.js:handler`
// - **Files:** app/functions/analytics/dynamoStreamToFirehose.js, app/unit-tests/analytics/dynamoStreamToFirehose.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/TableChangeDelivery.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/TableChangeDeliveryTest.java
// - **Keywords:** dynamodb streams, table change, firehose putrecordbatch, redaction, field whitelist, batchitemfailure, receipts, bundles, subscriptions, passes, commissions
// @end-capability

// app/functions/analytics/dynamoStreamToFirehose.js
//
// One Lambda, five DynamoDB Streams event source mappings (receipts, bundles, subscriptions,
// passes, commissions). Each stream record is redacted down to a per-table whitelist and forwarded to that
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
const REDEMPTION_PK_PREFIX = "redemption#";
// Items the passes table holds that the app derives from pass items: the held-for-review pointer
// and the nightly figures. They are not passes, so they do not leave the table.
const DERIVED_PASS_PK_PREFIXES = ["held#", "figures#"];
const COMMISSION_PK_PREFIX = "commission#";
const COMMISSION_LINE_SK_PREFIX = "line#";

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
  const acquisition = image.acquisition ?? {};
  return {
    hashed_sub: image.hashedSub ?? null,
    bundle_id: image.bundleId ?? null,
    granted_at: image.createdAt ?? null,
    expires_at: image.expiry ?? null,
    ttl: image.ttl ?? null,
    actor: image.actor ?? null,
    acq_utm_source: acquisition.utmSource ?? null,
    acq_utm_medium: acquisition.utmMedium ?? null,
    acq_utm_campaign: acquisition.utmCampaign ?? null,
    acq_utm_content: acquisition.utmContent ?? null,
    acq_utm_term: acquisition.utmTerm ?? null,
    acq_gclid: acquisition.gclid ?? null,
    acq_msclkid: acquisition.msclkid ?? null,
    acq_ref: acquisition.ref ?? null,
    acq_landed_at: acquisition.landedAt ?? null,
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
    actor: image.actor ?? null,
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
 *
 * A redemption item ("redemption#<code>#<hashedSub>") also carries the code, which is already
 * the redeemer's acquisition ref in the bundles stream, and the redeemer's hashed sub. The code
 * on a pass item stays out: only a redemption item projects it.
 */
function projectPass(image) {
  if (typeof image.pk === "string" && DERIVED_PASS_PK_PREFIXES.some((prefix) => image.pk.startsWith(prefix))) return null;
  const isRedemption = typeof image.pk === "string" && image.pk.startsWith(REDEMPTION_PK_PREFIX);
  return {
    pass_id: typeof image.pk === "string" ? hashSub(image.pk) : null,
    pass_type_id: image.passTypeId ?? null,
    bundle_id: image.bundleId ?? null,
    issued_by: image.issuedBy ?? null,
    created_at: image.createdAt ?? null,
    updated_at: image.updatedAt ?? null,
    use_count: image.useCount ?? null,
    revoked_at: image.revokedAt ?? null,
    actor: image.actor ?? null,
    redeemed_by: isRedemption ? (image.redeemedBy ?? null) : null,
    redeemed_at: isRedemption ? (image.redeemedAt ?? null) : null,
    redemption_code: isRedemption ? (image.code ?? null) : null,
  };
}

/**
 * The commissions table holds several item kinds. Only a ledger line ("commission#<referrerHash>"
 * with sort key "line#<invoiceId>", or its "#reversal" twin) reaches the lake; anchors, counters,
 * totals and pointer items project to null and the handler skips them. The card fingerprint, the
 * customer's creation time and the redemption time stay in the table.
 */
function projectCommission(image) {
  const pk = image.pk;
  const sk = image.sk;
  if (typeof pk !== "string" || !pk.startsWith(COMMISSION_PK_PREFIX)) return null;
  if (typeof sk !== "string" || !sk.startsWith(COMMISSION_LINE_SK_PREFIX)) return null;
  const holdReasons = Array.isArray(image.holdReasons) && image.holdReasons.length > 0 ? image.holdReasons.join(",") : null;
  return {
    referrer_hash: pk.slice(COMMISSION_PK_PREFIX.length),
    line_id: sk,
    invoice_id: image.invoiceId ?? null,
    charge_id: image.chargeId ?? null,
    subscription_id: image.subscriptionId ?? null,
    redeemer_hash: image.redeemerHash ?? null,
    referral_code: image.referralCode ?? null,
    tier: image.tier ?? null,
    form: image.form ?? null,
    payout: image.payout ?? null,
    rate_bps: image.rateBps ?? null,
    gross_pence: image.grossPence ?? null,
    net_pence: image.netPence ?? null,
    amount_pence: image.amountPence ?? null,
    currency: image.currency ?? null,
    eligible_months: image.eligibleMonths ?? null,
    line_months: image.lineMonths ?? null,
    state: image.state ?? null,
    hold_reasons: holdReasons,
    charged_at: image.chargedAt ?? null,
    release_at: image.releaseAt ?? null,
    payable_at: image.payableAt ?? null,
    paid_at: image.paidAt ?? null,
    reversed_at: image.reversedAt ?? null,
    reversal_reason: image.reversalReason ?? null,
    reversal_of: image.reversalOf ?? null,
    livemode: image.livemode ?? null,
  };
}

const PROJECTORS = {
  receipts: projectReceipt,
  bundles: projectBundle,
  subscriptions: projectSubscription,
  passes: projectPass,
  commissions: projectCommission,
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
 * @returns {object|null}
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
 * @returns {object|null} null when the record's item is not one the table projects
 */
export function buildRow(tableKind, record) {
  const eventName = record.eventName;
  const newImage = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
  const oldImage = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage) : null;
  const approximateCreationDateTime = record.dynamodb?.ApproximateCreationDateTime;
  const changeTs =
    typeof approximateCreationDateTime === "number" ? toParquetTimestamp(new Date(approximateCreationDateTime * 1000).toISOString()) : null;

  const projected = projectFields(tableKind, newImage, oldImage, eventName);
  if (projected === null) return null;

  return {
    change_ts: changeTs,
    change_type: eventName ?? null,
    source_table: tableKind,
    env: process.env.ENVIRONMENT_NAME ?? null,
    ...projected,
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
 * DynamoDB Streams handler: five event source mappings share this one function.
 *
 * `STREAM_TARGETS` is a JSON map of physical table name to delivery stream name, so the same
 * code serves all five tables without a table-specific Lambda each.
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
      if (row === null) continue;
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
