// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCommissionRepository.js

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbCommissionRepository.js" });

const TABLE_ENV = "COMMISSIONS_DYNAMODB_TABLE_NAME";

export const commissionPk = (referrerHash) => `commission#${referrerHash}`;
export const lineSk = (invoiceId) => `line#${invoiceId}`;
export const reversalSk = (invoiceId) => `line#${invoiceId}#reversal`;
export const anchorSk = (redeemerHash) => `redeemer#${redeemerHash}`;
export const conversionsSk = (code, day) => `conversions#${code}#${day}`;
export const heldSk = (releaseAt, referrerHash, invoiceId) => `${releaseAt}#${referrerHash}#${invoiceId}`;
export const payableSk = (referrerHash, lineSortKey) => `${referrerHash}#${lineSortKey}`;

function payablePointerItem(tableName, line) {
  const referrerHash = line.pk.slice("commission#".length);
  return {
    TableName: tableName,
    Item: { pk: "payable", sk: payableSk(referrerHash, line.sk), linePk: line.pk, lineSk: line.sk },
  };
}

function table() {
  return getResourceName(TABLE_ENV);
}

function isCancelled(error) {
  return error?.name === "TransactionCanceledException";
}

/** The index of the first cancelled item of a transaction, or -1. */
export function cancelledIndex(error) {
  const reasons = error?.CancellationReasons;
  if (!Array.isArray(reasons)) return -1;
  return reasons.findIndex((reason) => reason && reason.Code && reason.Code !== "None");
}

async function getItem(pk, sk) {
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: table(),
        Key: { pk, sk },
      }),
  );
  return result.Item || null;
}

export async function getLine(referrerHash, invoiceId) {
  return getItem(commissionPk(referrerHash), lineSk(invoiceId));
}

export async function getLineByKey(pk, sk) {
  return getItem(pk, sk);
}

export async function getAnchor(referrerHash, redeemerHash) {
  return getItem(commissionPk(referrerHash), anchorSk(redeemerHash));
}

export async function getChargePointer(chargeId) {
  return getItem(`charge#${chargeId}`, "line");
}

/**
 * Write the anchor of a referred account and count the conversion in one transaction.
 * Returns true when this call wrote the anchor, false when another delivery did.
 */
export async function putAnchorWithConversion({ referrerHash, redeemerHash, anchor, referralCode, day }) {
  const tableName = table();
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: { pk: commissionPk(referrerHash), sk: anchorSk(redeemerHash), ...anchor },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: { pk: commissionPk(referrerHash), sk: conversionsSk(referralCode, day) },
                UpdateExpression: "ADD conversions :one",
                ExpressionAttributeValues: { ":one": 1 },
              },
            },
          ],
        }),
    );
    return true;
  } catch (error) {
    if (isCancelled(error)) {
      logger.info({ message: "Commission anchor already written by another delivery" });
      return false;
    }
    logger.error({ message: "Error writing commission anchor", error: error.message });
    throw error;
  }
}

/**
 * Write a line, its charge pointer and (when held) its held pointer in one transaction.
 * Returns true when written, false when the line already exists.
 */
export async function putLineWithPointers(line) {
  const tableName = table();
  const pk = commissionPk(line.referrerHash);
  const { referrerHash, ...item } = line;
  const items = [
    {
      Put: {
        TableName: tableName,
        Item: { pk, sk: lineSk(line.invoiceId), ...item },
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: { pk: `charge#${line.chargeId}`, sk: "line", linePk: pk, lineSk: lineSk(line.invoiceId) },
      },
    },
  ];
  if (line.state === "held") {
    items.push({
      Put: {
        TableName: tableName,
        Item: {
          pk: "held",
          sk: heldSk(line.releaseAt, referrerHash, line.invoiceId),
          linePk: pk,
          lineSk: lineSk(line.invoiceId),
        },
      },
    });
  }
  try {
    await executeDynamoDbCommand((module) => new module.TransactWriteCommand({ TransactItems: items }));
    return true;
  } catch (error) {
    if (isCancelled(error) && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
      logger.info({ message: "Commission line already recorded", invoiceId: line.invoiceId });
      return false;
    }
    logger.error({ message: "Error writing commission line", error: error.message });
    throw error;
  }
}

/** Record that an account paid with a card; the first sighting is kept. */
export async function putCardPayer(fingerprint, hashedSub, now) {
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: table(),
        Key: { pk: `card#${fingerprint}`, sk: `payer#${hashedSub}` },
        UpdateExpression: "SET firstSeenAt = if_not_exists(firstSeenAt, :now), lastSeenAt = :now",
        ExpressionAttributeValues: { ":now": now },
      }),
  );
}

async function queryAll(buildParams) {
  const items = [];
  let startKey;
  do {
    const result = await executeDynamoDbCommand((module) => new module.QueryCommand({ TableName: table(), ...buildParams(startKey) }));
    items.push(...(result.Items || []));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/** Held pointers whose release time has passed, oldest first. */
export async function queryDueHeldPointers(nowIso) {
  return queryAll((startKey) => ({
    KeyConditionExpression: "pk = :held AND sk <= :upper",
    ExpressionAttributeValues: { ":held": "held", ":upper": `${nowIso}~` },
    ExclusiveStartKey: startKey,
  }));
}

export async function deleteHeldPointer(sk) {
  await executeDynamoDbCommand(
    (module) =>
      new module.DeleteCommand({
        TableName: table(),
        Key: { pk: "held", sk },
      }),
  );
}

/** The daily conversion counters of one referrer and code. */
export async function queryConversions(referrerHash, code) {
  return queryAll((startKey) => ({
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": commissionPk(referrerHash), ":prefix": `conversions#${code}#` },
    ExclusiveStartKey: startKey,
  }));
}

/** The accounts seen paying with one card fingerprint. */
export async function queryCardPayers(fingerprint) {
  return queryAll((startKey) => ({
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": `card#${fingerprint}` },
    ExclusiveStartKey: startKey,
  }));
}

/** Replace a held line's hold reasons. Returns false when the line is no longer held. */
export async function setHoldReasons(line, reasons, now) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: table(),
          Key: { pk: line.pk, sk: line.sk },
          UpdateExpression: "SET holdReasons = :reasons, updatedAt = :now",
          ConditionExpression: "#state = :held",
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: { ":reasons": reasons, ":now": now, ":held": "held" },
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

/**
 * Move a held line to payable, delete its held pointer and add its amount to the cap totals, in one
 * transaction. `totals` lists { sk, field, cap } entries; a cap of null counts without a limit.
 * Returns { released: true } or { released: false, cancelledIndex, totalsIndex } where totalsIndex
 * is the index into `totals` of the cap that refused, or -1 when the line itself changed.
 */
export async function releaseLine(line, { now, payableMonth, payableTaxYear, totals }) {
  const tableName = table();
  const items = [
    {
      Update: {
        TableName: tableName,
        Key: { pk: line.pk, sk: line.sk },
        UpdateExpression:
          "SET #state = :payable, payableAt = :now, payableMonth = :month, payableTaxYear = :taxYear, updatedAt = :now REMOVE holdReasons",
        ConditionExpression: "#state = :held",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: {
          ":payable": "payable",
          ":held": "held",
          ":now": now,
          ":month": payableMonth,
          ":taxYear": payableTaxYear,
        },
      },
    },
    {
      Delete: {
        TableName: tableName,
        Key: { pk: "held", sk: heldSk(line.releaseAt, line.pk.slice("commission#".length), line.invoiceId) },
      },
    },
  ];
  for (const total of totals) {
    const update = {
      TableName: tableName,
      Key: { pk: line.pk, sk: total.sk },
      UpdateExpression: `ADD ${total.field} :amt`,
      ExpressionAttributeValues: { ":amt": line.amountPence },
    };
    if (total.cap !== null && total.cap !== undefined) {
      update.ConditionExpression = `attribute_not_exists(${total.field}) OR ${total.field} <= :capMinusAmt`;
      update.ExpressionAttributeValues[":capMinusAmt"] = total.cap - line.amountPence;
    }
    items.push({ Update: update });
  }
  if (line.form === "credit") items.push({ Put: payablePointerItem(tableName, line) });
  try {
    await executeDynamoDbCommand((module) => new module.TransactWriteCommand({ TransactItems: items }));
    return { released: true };
  } catch (error) {
    if (isCancelled(error)) {
      const index = cancelledIndex(error);
      return { released: false, cancelledIndex: index, totalsIndex: index >= 2 ? index - 2 : -1 };
    }
    throw error;
  }
}

/**
 * Reverse a held line: mark it reversed and delete its held pointer. Returns false when the line
 * is no longer held.
 */
export async function reverseHeldLine(line, { reason, now }) {
  const tableName = table();
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: { pk: line.pk, sk: line.sk },
                UpdateExpression:
                  "SET #state = :reversed, reversedAt = :now, reversalReason = :reason, updatedAt = :now REMOVE holdReasons",
                ConditionExpression: "#state = :held",
                ExpressionAttributeNames: { "#state": "state" },
                ExpressionAttributeValues: { ":reversed": "reversed", ":held": "held", ":now": now, ":reason": reason },
              },
            },
            {
              Delete: {
                TableName: tableName,
                Key: { pk: "held", sk: heldSk(line.releaseAt, line.pk.slice("commission#".length), line.invoiceId) },
              },
            },
          ],
        }),
    );
    return true;
  } catch (error) {
    if (isCancelled(error)) return false;
    throw error;
  }
}

/**
 * Reverse a payable line and take its amount out of the cap totals it was counted in.
 * `totals` lists { sk, field } entries. Returns false when the line is no longer payable.
 */
export async function reversePayableLine(line, { reason, now, totals }) {
  const tableName = table();
  const items = [
    {
      Update: {
        TableName: tableName,
        Key: { pk: line.pk, sk: line.sk },
        UpdateExpression: "SET #state = :reversed, reversedAt = :now, reversalReason = :reason, updatedAt = :now",
        ConditionExpression: "#state = :payable",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":reversed": "reversed", ":payable": "payable", ":now": now, ":reason": reason },
      },
    },
    ...totals.map((total) => ({
      Update: {
        TableName: tableName,
        Key: { pk: line.pk, sk: total.sk },
        UpdateExpression: `ADD ${total.field} :amt`,
        ExpressionAttributeValues: { ":amt": -line.amountPence },
      },
    })),
  ];
  if (line.form === "credit") {
    items.push({
      Delete: { TableName: tableName, Key: { pk: "payable", sk: payableSk(line.pk.slice("commission#".length), line.sk) } },
    });
  }
  try {
    await executeDynamoDbCommand((module) => new module.TransactWriteCommand({ TransactItems: items }));
    return true;
  } catch (error) {
    if (isCancelled(error)) return false;
    throw error;
  }
}

/**
 * Write the negative line that offsets a paid line, with its payable pointer when it is a credit
 * line. Returns false when it already exists.
 */
export async function putReversalLine(reversal) {
  const tableName = table();
  const items = [{ Put: { TableName: tableName, Item: reversal, ConditionExpression: "attribute_not_exists(pk)" } }];
  if (reversal.form === "credit") items.push({ Put: payablePointerItem(tableName, reversal) });
  try {
    await executeDynamoDbCommand((module) => new module.TransactWriteCommand({ TransactItems: items }));
    return true;
  } catch (error) {
    if (isCancelled(error) && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") return false;
    throw error;
  }
}

/** The pointers of credit lines that are payable, in one Query on the payable partition. */
export async function queryPayablePointers() {
  return queryAll((startKey) => ({
    KeyConditionExpression: "pk = :payable",
    ExpressionAttributeValues: { ":payable": "payable" },
    ExclusiveStartKey: startKey,
  }));
}

/**
 * Mark a payable line paid and delete its payable pointer, in one transaction. `fields` are extra
 * attributes to record (the balance transaction id, a shortfall). Returns false when the line is
 * no longer payable, which means another run already paid it.
 */
export async function markLinePaid(line, { now, fields = {} }) {
  const tableName = table();
  const names = { "#state": "state" };
  const values = { ":paid": "paid", ":payable": "payable", ":now": now };
  const sets = ["#state = :paid", "paidAt = :now", "updatedAt = :now"];
  Object.entries(fields).forEach(([name, value], index) => {
    names[`#f${index}`] = name;
    values[`:f${index}`] = value;
    sets.push(`#f${index} = :f${index}`);
  });
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: { pk: line.pk, sk: line.sk },
                UpdateExpression: `SET ${sets.join(", ")}`,
                ConditionExpression: "#state = :payable",
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
              },
            },
            {
              Delete: {
                TableName: tableName,
                Key: { pk: "payable", sk: payableSk(line.pk.slice("commission#".length), line.sk) },
              },
            },
          ],
        }),
    );
    return true;
  } catch (error) {
    if (isCancelled(error)) return false;
    throw error;
  }
}
