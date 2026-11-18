// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCollabRelayRepository.js
//
// The one table of the collaboration relay (CollabRelayStack, ci only). Partition key `pk`, sort
// key `sk`, TTL attribute `expiresAt` (epoch seconds):
//   party#<party> / key          the party's OpenSSH public key
//   party#<party> / seq          the highest message seq accepted from the party
//   inbox#<party> / msg#<id>     a stored message, until the party acknowledges it or it expires
//   connections   / <id>         an open WebSocket connection and the party it belongs to

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const TABLE_ENV = "COLLAB_RELAY_DYNAMODB_TABLE_NAME";
const MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60;
// API Gateway closes a WebSocket connection after two hours, so a row older than that is stale.
const CONNECTION_TTL_SECONDS = 3 * 60 * 60;

const table = () => getResourceName(TABLE_ENV, true);
const epochSeconds = (nowMs) => Math.floor(nowMs / 1000);
const live = (item, nowMs) => !item.expiresAt || item.expiresAt > epochSeconds(nowMs);

async function queryAll(input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await executeDynamoDbCommand((mod) => new mod.QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * The OpenSSH public key registered for a party, or null.
 *
 * @param {string} party
 * @returns {Promise<string|null>}
 */
export async function getPartyKey(party) {
  const result = await executeDynamoDbCommand(
    (mod) => new mod.GetCommand({ TableName: table(), Key: { pk: `party#${party}`, sk: "key" } }),
  );
  return result.Item?.publicKey ?? null;
}

/**
 * Registers a party's public key. A new key also clears the party's seq, because a new VM starts
 * its sequence again; the same key again changes nothing, so a replayed registration cannot reset
 * the sequence.
 *
 * @returns {Promise<{changed: boolean}>}
 */
export async function putPartyKey(party, publicKey, nowMs) {
  const result = await executeDynamoDbCommand(
    (mod) =>
      new mod.PutCommand({
        TableName: table(),
        Item: { pk: `party#${party}`, sk: "key", publicKey, registeredAt: new Date(nowMs).toISOString() },
        ReturnValues: "ALL_OLD",
      }),
  );
  const changed = result.Attributes?.publicKey !== publicKey;
  if (changed) {
    await executeDynamoDbCommand((mod) => new mod.DeleteCommand({ TableName: table(), Key: { pk: `party#${party}`, sk: "seq" } }));
  }
  return { changed };
}

/**
 * Records `seq` as the party's highest accepted seq when it is higher than the stored one. One
 * conditional write, so two requests with the same seq cannot both pass.
 *
 * @returns {Promise<boolean>} false when seq is not newer than the stored one
 */
export async function advanceSeq(party, seq) {
  try {
    await executeDynamoDbCommand(
      (mod) =>
        new mod.UpdateCommand({
          TableName: table(),
          Key: { pk: `party#${party}`, sk: "seq" },
          UpdateExpression: "SET lastSeq = :seq",
          ConditionExpression: "attribute_not_exists(lastSeq) OR lastSeq < :seq",
          ExpressionAttributeValues: { ":seq": seq },
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

/**
 * The id of a message: its seq, zero padded so ids sort in seq order, then its sender.
 */
export function messageId(from, seq) {
  return `${String(seq).padStart(16, "0")}.${from}`;
}

/**
 * Stores a message for its recipient for seven days.
 *
 * @returns {Promise<string>} the message id
 */
export async function putMessage({ from, to, seq, ts, sig, body }, nowMs) {
  const id = messageId(from, seq);
  await executeDynamoDbCommand(
    (mod) =>
      new mod.PutCommand({
        TableName: table(),
        Item: {
          pk: `inbox#${to}`,
          sk: `msg#${id}`,
          id,
          from,
          to,
          seq,
          ts,
          sig,
          body,
          receivedAt: new Date(nowMs).toISOString(),
          expiresAt: epochSeconds(nowMs) + MESSAGE_TTL_SECONDS,
        },
      }),
  );
  return id;
}

/**
 * The party's stored messages that are not yet acknowledged, oldest seq first.
 */
export async function listMessages(party, nowMs) {
  const items = await queryAll({
    TableName: table(),
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `inbox#${party}`, ":prefix": "msg#" },
  });
  return items.filter((item) => live(item, nowMs)).map(({ id, from, to, seq, ts, sig, body }) => ({ id, from, to, seq, ts, sig, body }));
}

export async function deleteMessage(party, id) {
  await executeDynamoDbCommand((mod) => new mod.DeleteCommand({ TableName: table(), Key: { pk: `inbox#${party}`, sk: `msg#${id}` } }));
}

export async function putConnection(connectionId, party, nowMs) {
  await executeDynamoDbCommand(
    (mod) =>
      new mod.PutCommand({
        TableName: table(),
        Item: {
          pk: "connections",
          sk: connectionId,
          party,
          connectedAt: new Date(nowMs).toISOString(),
          expiresAt: epochSeconds(nowMs) + CONNECTION_TTL_SECONDS,
        },
      }),
  );
}

export async function deleteConnection(connectionId) {
  await executeDynamoDbCommand((mod) => new mod.DeleteCommand({ TableName: table(), Key: { pk: "connections", sk: connectionId } }));
}

/**
 * The open connections, of one party when `party` is given, else of every party.
 *
 * @returns {Promise<Array<{connectionId: string, party: string}>>}
 */
export async function listConnections(party, nowMs) {
  const items = await queryAll({
    TableName: table(),
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": "connections" },
  });
  return items
    .filter((item) => live(item, nowMs) && (!party || item.party === party))
    .map((item) => ({ connectionId: item.sk, party: item.party }));
}
