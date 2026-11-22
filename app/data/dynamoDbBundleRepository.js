// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbBundleRepository.js

import { createLogger, context } from "../lib/logger.js";
import { hashSub, getSaltVersion, subHashCandidates } from "../services/subHasher.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { bundleRetention, isTestActor } from "../lib/recordRetention.js";
import { resolveActorClass } from "../lib/activityAlert.js";

const logger = createLogger({ source: "app/data/dynamoDbBundleRepository.js" });

/**
 * Finds the hash a user's existing bundle item sits under, so an in-place update lands on the
 * item during a salt rotation and does not create a partial item under the current hash.
 * Answers the current version when no item exists.
 */
async function locateBundleOwner(userId, bundleId) {
  const candidates = subHashCandidates(userId);
  if (candidates.length === 1) return candidates[0];
  const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
  for (const candidate of candidates) {
    const { Item } = await executeDynamoDbCommand(
      (module) => new module.GetCommand({ TableName: tableName, Key: { hashedSub: candidate.hashedSub, bundleId }, ConsistentRead: true }),
    );
    if (Item) return candidate;
  }
  return candidates[0];
}

// The user's account settings live in the user's own partition of this table, under this sort key.
// The sort key is not a bundle id, so a read of the user's bundles leaves the item out.
export const ACCOUNT_SETTINGS_ITEM_ID = "#account-settings";

/**
 * Set ttl on a new bundle item: two days for a test or synthetic owner, one month after the expiry
 * for any other owner, and none for another owner's bundle with no expiry.
 * The owner's class is the bundle's own actor, else the class of the current request.
 */
function stampBundleRetention(item, now) {
  const actor = item.actor || resolveActorClass(undefined, item.hashedSub);
  if (!item.expiry && !isTestActor(actor)) return;
  const expiry = item.expiry ? new Date(item.expiry) : now;
  const { ttl, ttl_datestamp } = bundleRetention({ actor }, expiry, now);
  item.ttl = ttl;
  item.ttl_datestamp = ttl_datestamp;
}

// The class of the signed-in caller, when the request carries the caller's email; null when it
// carries none, so a write made with no caller never names a class it cannot prove.
function signedInActorClass(hashedSub) {
  const email = context.get("userEmail");
  return email ? resolveActorClass(undefined, hashedSub, email) : null;
}

// Every new bundle item names its actor: the one the caller gave, else the signed-in caller's
// class, else "system" for a write that no signed-in caller made (a script or a scheduled job).
function stampBundleActor(item) {
  if (!item.actor) item.actor = signedInActorClass(item.hashedSub) || "system";
}

// An update fills the actor of an item written before items carried one, from the signed-in
// caller's class, and never changes an actor the item already has.
function actorFill(hashedSub) {
  const actor = signedInActorClass(hashedSub);
  return actor ? { expression: ", actor = if_not_exists(actor, :actor)", values: { ":actor": actor } } : { expression: "", values: {} };
}

export async function putBundle(userId, bundle) {
  logger.info({ message: `putBundle [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Storing bundle", hashedSub, userId, bundle });

    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    const now = new Date();
    const item = {
      ...bundle,
      hashedSub,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    // Add expiry with millisecond precision timestamp (ISO format)
    if (bundle.expiry) {
      const expiryDate = new Date(bundle.expiry);
      item.expiry = expiryDate.toISOString();
    } else {
      // A bundle with no expiry carries no expiry attribute at all: expiry is a key of the
      // bundleId-expiry-index and DynamoDB rejects an empty string in an index key, and a
      // missing key simply leaves the item out of that sparse index.
      delete item.expiry;
    }

    stampBundleActor(item);
    stampBundleRetention(item, now);

    logger.info({
      message: "Storing bundle in DynamoDB as item",
      hashedSub,
      item,
    });
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: item,
        }),
    );

    logger.info({
      message: "Bundle stored in DynamoDB as item",
      hashedSub,
      item,
    });
  } catch (error) {
    logger.error({
      message: `Error storing bundle in DynamoDB ${error.message}`,
      error,
      userId,
      bundle,
    });
    throw error;
  }
}

export async function putBundleByHashedSub(hashedSub, bundle) {
  logger.info({ message: `putBundleByHashedSub [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    const now = new Date();
    const item = {
      ...bundle,
      hashedSub,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    if (bundle.expiry) {
      const expiryDate = new Date(bundle.expiry);
      item.expiry = expiryDate.toISOString();
    } else {
      // A bundle with no expiry carries no expiry attribute at all: expiry is a key of the
      // bundleId-expiry-index and DynamoDB rejects an empty string in an index key, and a
      // missing key simply leaves the item out of that sparse index.
      delete item.expiry;
    }

    stampBundleActor(item);
    stampBundleRetention(item, now);

    logger.info({ message: "Storing bundle in DynamoDB by hashedSub", hashedSub, item });
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: item,
        }),
    );

    logger.info({ message: "Bundle stored in DynamoDB by hashedSub", hashedSub, item });
  } catch (error) {
    logger.error({
      message: `Error storing bundle by hashedSub in DynamoDB ${error.message}`,
      error,
      hashedSub,
      bundle,
    });
    throw error;
  }
}

export async function deleteBundle(userId, bundleId) {
  logger.info({ message: `deleteBundle [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const { hashedSub } = await locateBundleOwner(userId, bundleId);
    logger.info({ message: "Deleting bundle", hashedSub, userId, bundleId });
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    logger.info({
      message: "Deleting bundle from DynamoDB",
      hashedSub,
      bundleId,
    });
    await executeDynamoDbCommand(
      (module) =>
        new module.DeleteCommand({
          TableName: tableName,
          Key: {
            hashedSub,
            bundleId,
          },
        }),
    );

    logger.info({
      message: "Bundle deleted from DynamoDB",
      hashedSub,
      bundleId,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting bundle from DynamoDB",
      error: error.message,
      userId,
      bundleId,
    });
    throw error;
  }
}

// Removes the user's bundles. The account settings item is an account preference, not a bundle,
// and stays.
export async function deleteAllBundles(userId) {
  logger.info({ message: `deleteAllBundles [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Deleting all bundles for user", userId, hashedSub });
    const bundles = await getUserBundles(userId);

    // Delete bundles concurrently for better performance
    logger.info({
      message: "Deleting all bundles from DynamoDB",
      hashedSub,
      count: bundles.length,
    });
    const deleteResults = await Promise.allSettled(
      bundles.map(async (bundle) => {
        await deleteBundle(userId, bundle.bundleId);
      }),
    );

    // Log any failures from individual deletions
    const failures = deleteResults.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn({
        message: "Some bundle deletions failed",
        hashedSub,
        failureCount: failures.length,
        totalCount: bundles.length,
      });
    }

    logger.info({
      message: "All bundles deleted from DynamoDB",
      hashedSub,
      count: bundles.length,
      successCount: bundles.length - failures.length,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting all bundles from DynamoDB",
      error: error.message,
      userId,
    });
    throw error;
  }
}

// What an update of a bundle item answers when the item does not exist. An update never creates an item:
// an item built from one update alone holds only that update's fields.
export const BUNDLE_MISSING = "bundle-missing";

/**
 * Resets the tokens on an existing bundle item.
 * @returns {Promise<{updated: true} | {updated: false, reason: string}>} reason is BUNDLE_MISSING when no item exists
 */
export async function resetTokens(userId, bundleId, tokensGranted, nextResetAt) {
  logger.info({ message: `resetTokens [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const { hashedSub, version } = await locateBundleOwner(userId, bundleId);
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
    const fill = actorFill(hashedSub);

    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { hashedSub, bundleId },
          ConditionExpression: "attribute_exists(hashedSub)",
          UpdateExpression:
            "SET tokensConsumed = :zero, tokensGranted = :granted, tokenResetAt = :resetAt, saltVersion = :saltVersion" + fill.expression,
          ExpressionAttributeValues: {
            ":zero": 0,
            ":granted": tokensGranted,
            ":resetAt": nextResetAt,
            ":saltVersion": version,
            ...fill.values,
          },
        }),
    );

    logger.info({ message: "Tokens reset", hashedSub, bundleId, tokensGranted, nextResetAt });
    return { updated: true };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.warn({ message: "Tokens not reset: no bundle item", userId, bundleId });
      return { updated: false, reason: BUNDLE_MISSING };
    }
    logger.error({ message: "Error resetting tokens", error: error.message, userId, bundleId });
    throw error;
  }
}

/**
 * Resets the tokens on an existing bundle item.
 * @returns {Promise<{updated: true} | {updated: false, reason: string}>} reason is BUNDLE_MISSING when no item exists
 */
export async function resetTokensByHashedSub(hashedSub, bundleId, tokensGranted, nextResetAt) {
  logger.info({ message: `resetTokensByHashedSub [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { hashedSub, bundleId },
          ConditionExpression: "attribute_exists(hashedSub)",
          UpdateExpression: "SET tokensConsumed = :zero, tokensGranted = :granted, tokenResetAt = :resetAt, saltVersion = :saltVersion",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":granted": tokensGranted,
            ":resetAt": nextResetAt,
            ":saltVersion": getSaltVersion(),
          },
        }),
    );

    logger.info({ message: "Tokens reset by hashedSub", hashedSub, bundleId, tokensGranted, nextResetAt });
    return { updated: true };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.warn({ message: "Tokens not reset: no bundle item", hashedSub, bundleId });
      return { updated: false, reason: BUNDLE_MISSING };
    }
    logger.error({ message: "Error resetting tokens by hashedSub", error: error.message, hashedSub, bundleId });
    throw error;
  }
}

export async function consumeToken(userId, bundleId, count = 1) {
  logger.info({ message: `consumeToken [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId, count });

  try {
    const { hashedSub, version } = await locateBundleOwner(userId, bundleId);
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
    const fill = actorFill(hashedSub);

    const result = await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { hashedSub, bundleId },
          UpdateExpression:
            "SET tokensConsumed = if_not_exists(tokensConsumed, :zero) + :inc, saltVersion = :saltVersion" + fill.expression,
          ConditionExpression: "attribute_exists(hashedSub) AND (attribute_not_exists(tokensConsumed) OR tokensConsumed < tokensGranted)",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":inc": count,
            ":saltVersion": version,
            ...fill.values,
          },
          ReturnValues: "ALL_NEW",
        }),
    );

    const updated = result.Attributes;
    const tokensRemaining = Math.max(0, (updated.tokensGranted || 0) - (updated.tokensConsumed || 0));
    logger.info({ message: "Token consumed", hashedSub, bundleId, tokensRemaining });
    return { consumed: true, tokensRemaining, bundle: updated };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      // The one condition covers a missing item and an exhausted one; a read tells them apart.
      const { hashedSub } = await locateBundleOwner(userId, bundleId);
      const { Item } = await executeDynamoDbCommand(
        (module) =>
          new module.GetCommand({
            TableName: getResourceName("BUNDLE_DYNAMODB_TABLE_NAME"),
            Key: { hashedSub, bundleId },
            ConsistentRead: true,
          }),
      );
      if (!Item) {
        logger.warn({ message: "Token not consumed: no bundle item", userId, bundleId });
        return { consumed: false, reason: BUNDLE_MISSING, tokensRemaining: 0 };
      }
      logger.info({ message: "Token consumption blocked - tokens exhausted", userId, bundleId });
      return { consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 };
    }
    logger.error({ message: "Error consuming token", error: error.message, userId, bundleId });
    throw error;
  }
}

export async function recordTokenEvent(userId, bundleId, event) {
  logger.info({ message: `recordTokenEvent [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const { hashedSub, version } = await locateBundleOwner(userId, bundleId);
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    const tokenEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    const fill = actorFill(hashedSub);

    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { hashedSub, bundleId },
          ConditionExpression: "attribute_exists(hashedSub)",
          UpdateExpression:
            "SET tokenEvents = list_append(if_not_exists(tokenEvents, :empty), :event), saltVersion = :saltVersion" + fill.expression,
          ExpressionAttributeValues: {
            ":empty": [],
            ":event": [tokenEvent],
            ":saltVersion": version,
            ...fill.values,
          },
        }),
    );

    logger.info({ message: "Token event recorded", hashedSub, bundleId, event: tokenEvent });
    return { updated: true };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.warn({ message: "Token event not recorded: no bundle item", userId, bundleId });
      return { updated: false, reason: BUNDLE_MISSING };
    }
    logger.error({ message: "Error recording token event", error: error.message, userId, bundleId });
    throw error;
  }
}

/**
 * Updates fields on an existing bundle item. A new expiry moves ttl and ttl_datestamp with it, so
 * DynamoDB never deletes the item of a subscription that is still paid.
 * @returns {Promise<{updated: true} | {updated: false, reason: string}>} reason is BUNDLE_MISSING when no item exists
 */
export async function updateBundleSubscriptionFields(hashedSub, bundleId, fields) {
  logger.info({ message: `updateBundleSubscriptionFields [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    const expressions = [];
    const values = {};
    const names = {};

    const written = { ...fields };
    if (fields.expiry) {
      const { ttl, ttl_datestamp } = bundleRetention({ actor: fields.actor }, new Date(fields.expiry), new Date());
      written.ttl = ttl;
      written.ttl_datestamp = ttl_datestamp;
    }

    for (const [key, value] of Object.entries(written)) {
      const attrName = `#${key}`;
      const attrValue = `:${key}`;
      expressions.push(`${attrName} = ${attrValue}`);
      names[attrName] = key;
      values[attrValue] = value;
    }

    // Always write saltVersion
    expressions.push("#saltVersion = :saltVersion");
    names["#saltVersion"] = "saltVersion";
    values[":saltVersion"] = getSaltVersion();

    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { hashedSub, bundleId },
          ConditionExpression: "attribute_exists(hashedSub)",
          UpdateExpression: "SET " + expressions.join(", "),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }),
    );

    logger.info({ message: "Bundle subscription fields updated", hashedSub, bundleId, fields: written });
    return { updated: true };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.warn({ message: "Bundle subscription fields not updated: no bundle item", hashedSub, bundleId, fields });
      return { updated: false, reason: BUNDLE_MISSING };
    }
    logger.error({ message: "Error updating bundle subscription fields", error: error.message, hashedSub, bundleId });
    throw error;
  }
}

export async function countActiveAllocations(bundleId, nowIso) {
  logger.info({ message: `countActiveAllocations [table: ${getResourceName("BUNDLE_DYNAMODB_TABLE_NAME")}]`, bundleId });

  try {
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");

    let count = 0;
    let lastEvaluatedKey;
    do {
      const response = await executeDynamoDbCommand(
        (module) =>
          new module.QueryCommand({
            TableName: tableName,
            IndexName: "bundleId-expiry-index",
            KeyConditionExpression: "bundleId = :bundleId AND expiry > :now",
            ExpressionAttributeValues: { ":bundleId": bundleId, ":now": nowIso },
            Select: "COUNT",
            ExclusiveStartKey: lastEvaluatedKey,
          }),
      );
      count += response.Count || 0;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    logger.info({ message: "Counted active allocations", bundleId, count });
    return count;
  } catch (error) {
    logger.error({ message: "Error counting active allocations", error: error.message, bundleId });
    throw error;
  }
}

export async function getUserBundles(userId) {
  logger.info({ message: `getUserBundles [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, userId });

  try {
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
    const bundlesById = new Map();

    // During a salt rotation a user's bundles can sit under two hashes at once, so every version
    // is read and merged. The current version wins for a bundle held under both.
    for (const { version, hashedSub } of subHashCandidates(userId)) {
      const response = await executeDynamoDbCommand(
        (module) =>
          new module.QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "hashedSub = :hashedSub",
            ExpressionAttributeValues: {
              ":hashedSub": hashedSub,
            },
          }),
      );
      logger.info({ message: "Queried DynamoDB for user bundles", version, hashedSub, itemCount: response.Count });
      for (const item of response.Items ?? []) {
        if (item.bundleId !== ACCOUNT_SETTINGS_ITEM_ID && !bundlesById.has(item.bundleId)) bundlesById.set(item.bundleId, item);
      }
    }

    logger.info({ message: "Retrieved bundles from DynamoDB", userId, count: bundlesById.size });
    return [...bundlesById.values()];
  } catch (error) {
    logger.error({
      message: `Error retrieving bundles from DynamoDB table ${getResourceName("BUNDLE_DYNAMODB_TABLE_NAME")}`,
      error: error.message,
      userId,
    });
    throw error;
  }
}

export async function getAccountSettings(userId) {
  logger.info({ message: `getAccountSettings [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
    for (const { hashedSub } of subHashCandidates(userId)) {
      const response = await executeDynamoDbCommand(
        (module) =>
          new module.GetCommand({
            TableName: tableName,
            Key: { hashedSub, bundleId: ACCOUNT_SETTINGS_ITEM_ID },
          }),
      );
      if (response.Item) return response.Item.settings ?? {};
    }
    return {};
  } catch (error) {
    logger.error({ message: "Error retrieving account settings from DynamoDB", error: error.message, userId });
    throw error;
  }
}

// The settings item of the account under its current hashed sub, created when it does not exist
// yet with the settings found under an earlier salt, so a change made after a salt rotation keeps
// them. The creation is conditional, so two first changes at once create it once.
async function ensureAccountSettingsItem(userId) {
  const hashedSub = hashSub(userId);
  const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
  const now = new Date().toISOString();
  const earlierSettings = await getAccountSettings(userId);
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: {
            hashedSub,
            bundleId: ACCOUNT_SETTINGS_ITEM_ID,
            saltVersion: getSaltVersion(),
            settings: { ...earlierSettings },
            updatedAt: now,
          },
          ConditionExpression: "attribute_not_exists(bundleId)",
        }),
    );
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") throw error;
  }
}

function isConditionFailure(error) {
  return error?.name === "ConditionalCheckFailedException";
}

/**
 * Change named account settings. Each setting is written on its own path of the settings item, so a
 * change of one setting never writes another back, whatever changes at the same moment.
 * @param {string} userId
 * @param {object} settings - The settings to change, by name
 * @returns {Promise<object>} The settings as stored after the change
 */
export async function updateAccountSettings(userId, settings) {
  logger.info({ message: `updateAccountSettings [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, settings });
  const names = Object.keys(settings);
  const assignments = names.map((_, index) => "#settings.#name" + index + " = :value" + index).join(", ");
  const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
  const update = (module) =>
    new module.UpdateCommand({
      TableName: tableName,
      Key: { hashedSub: hashSub(userId), bundleId: ACCOUNT_SETTINGS_ITEM_ID },
      UpdateExpression: `SET ${assignments}, updatedAt = :now`,
      ConditionExpression: "attribute_exists(#settings)",
      ExpressionAttributeNames: { "#settings": "settings", ...Object.fromEntries(names.map((name, index) => [`#name${index}`, name])) },
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ...Object.fromEntries(names.map((name, index) => [`:value${index}`, settings[name]])),
      },
      ReturnValues: "ALL_NEW",
    });
  try {
    try {
      return (await executeDynamoDbCommand(update)).Attributes.settings;
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
      await ensureAccountSettingsItem(userId);
      return (await executeDynamoDbCommand(update)).Attributes.settings;
    }
  } catch (error) {
    logger.error({ message: "Error updating account settings in DynamoDB", error: error.message, userId });
    throw error;
  }
}

async function readOwnAccountSettings(userId) {
  const response = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: getResourceName("BUNDLE_DYNAMODB_TABLE_NAME"),
        Key: { hashedSub: hashSub(userId), bundleId: ACCOUNT_SETTINGS_ITEM_ID },
        ConsistentRead: true,
      }),
  );
  return response.Item?.settings;
}

// A watch list change whose condition failed because the list changed meanwhile is tried again,
// at most this many times in all.
const WATCH_LIST_ATTEMPTS = 5;

/**
 * Add a company number to the account's watch list in one conditional write: the write appends the
 * number only while the list holds fewer than cap numbers and does not hold it, so two changes at
 * once cannot lose either. Only the watch list's path of the settings item is written.
 * @param {string} userId
 * @param {string} companyNumber
 * @param {number} cap - The most numbers the list holds
 * @returns {Promise<{status: "added"|"unchanged"|"full", settings: object}>} The settings as stored
 */
export async function addToWatchedCompanies(userId, companyNumber, cap) {
  const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
  for (let attempt = 1; attempt <= WATCH_LIST_ATTEMPTS; attempt++) {
    try {
      const response = await executeDynamoDbCommand(
        (module) =>
          new module.UpdateCommand({
            TableName: tableName,
            Key: { hashedSub: hashSub(userId), bundleId: ACCOUNT_SETTINGS_ITEM_ID },
            UpdateExpression: "SET #settings.#watched = list_append(if_not_exists(#settings.#watched, :empty), :one), updatedAt = :now",
            ConditionExpression:
              "attribute_exists(#settings) AND (attribute_not_exists(#settings.#watched) OR (size(#settings.#watched) < :cap AND NOT contains(#settings.#watched, :number)))",
            ExpressionAttributeNames: { "#settings": "settings", "#watched": "watchedCompanies" },
            ExpressionAttributeValues: {
              ":empty": [],
              ":one": [companyNumber],
              ":number": companyNumber,
              ":cap": cap,
              ":now": new Date().toISOString(),
            },
            ReturnValues: "ALL_NEW",
          }),
      );
      return { status: "added", settings: response.Attributes.settings };
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
    }
    const settings = await readOwnAccountSettings(userId);
    if (!settings) {
      await ensureAccountSettingsItem(userId);
      continue;
    }
    const watched = Array.isArray(settings.watchedCompanies) ? settings.watchedCompanies : [];
    if (watched.includes(companyNumber)) return { status: "unchanged", settings };
    if (watched.length >= cap) return { status: "full", settings };
  }
  throw new Error("The watch list changed on every attempt to add to it");
}

/**
 * Remove a company number from the account's watch list in one conditional write: the write
 * removes the list entry at the number's place only while that entry still holds the number, so a
 * change made meanwhile is never undone. Only the watch list's path of the settings item is written.
 * @param {string} userId
 * @param {string} companyNumber
 * @returns {Promise<{status: "removed"|"unchanged", settings: object}>} The settings as stored
 */
export async function removeFromWatchedCompanies(userId, companyNumber) {
  const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
  for (let attempt = 1; attempt <= WATCH_LIST_ATTEMPTS; attempt++) {
    const settings = (await readOwnAccountSettings(userId)) ?? (await getAccountSettings(userId));
    const watched = Array.isArray(settings.watchedCompanies) ? settings.watchedCompanies : [];
    const index = watched.indexOf(companyNumber);
    if (index === -1) return { status: "unchanged", settings };
    await ensureAccountSettingsItem(userId);
    try {
      const response = await executeDynamoDbCommand(
        (module) =>
          new module.UpdateCommand({
            TableName: tableName,
            Key: { hashedSub: hashSub(userId), bundleId: ACCOUNT_SETTINGS_ITEM_ID },
            UpdateExpression: `REMOVE #settings.#watched[${index}] SET updatedAt = :now`,
            ConditionExpression: `#settings.#watched[${index}] = :number`,
            ExpressionAttributeNames: { "#settings": "settings", "#watched": "watchedCompanies" },
            ExpressionAttributeValues: { ":number": companyNumber, ":now": new Date().toISOString() },
            ReturnValues: "ALL_NEW",
          }),
      );
      return { status: "removed", settings: response.Attributes.settings };
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
    }
  }
  throw new Error("The watch list changed on every attempt to remove from it");
}

/** Every bundle item of one account, read by its hashed sub; the account settings item is left out. */
export async function getBundlesByHashedSub(hashedSub) {
  const tableName = getResourceName("BUNDLE_DYNAMODB_TABLE_NAME");
  const bundles = [];
  let startKey;
  do {
    const response = await executeDynamoDbCommand(
      (module) =>
        new module.QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "hashedSub = :hashedSub",
          ExpressionAttributeValues: { ":hashedSub": hashedSub },
          ExclusiveStartKey: startKey,
        }),
    );
    bundles.push(...(response.Items ?? []).filter((item) => item.bundleId !== ACCOUNT_SETTINGS_ITEM_ID));
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  return bundles;
}
