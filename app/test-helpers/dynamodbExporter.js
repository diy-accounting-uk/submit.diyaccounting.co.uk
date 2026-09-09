// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/dynamodbExporter.js

import fs from "fs";
import path from "path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { hashSub } from "../services/subHasher.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "behaviour-tests/helpers/dynamodb-export.js" });

/**
 * Creates a DynamoDB Document Client based on environment configuration
 * @returns {DynamoDBDocumentClient}
 */
function makeDocClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL;
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
    },
  });
  return DynamoDBDocumentClient.from(client);
}

/**
 * Scans a DynamoDB table and returns items filtered by hashed subs
 * @param {string} tableName - The DynamoDB table name
 * @param {string[]} hashedSubs - Array of hashed subs to filter by
 * @returns {Promise<Array>} - Array of items from the table
 */
async function scanTableForHashedSubs(tableName, hashedSubs) {
  if (!tableName) {
    return [];
  }

  const doc = makeDocClient();
  const allItems = [];
  let lastEvaluatedKey = undefined;

  try {
    do {
      const params = {
        TableName: tableName,
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      };

      const response = await doc.send(new ScanCommand(params));
      const items = response.Items || [];

      // Filter items by hashedSub
      const filteredItems = items.filter((item) => item.hashedSub && hashedSubs.includes(item.hashedSub));
      allItems.push(...filteredItems);

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems;
  } catch (error) {
    logger.warn(`Failed to scan table ${tableName}:`, error.message);
    return [];
  }
}

/**
 * Exports DynamoDB data for the given users from all configured tables
 * @param {string[]} userSubs - Array of user subs used in tests
 * @param {string} testFileName - The test file name for generating the export file name
 * @returns {Promise<void>}
 */
export async function exportDynamoDBDataForUsers(userSubs, testFileName) {
  if (!userSubs || userSubs.length === 0) {
    logger.info("No user subs provided for DynamoDB export");
    return;
  }

  // Hash all user subs
  const hashedSubs = userSubs.map((sub) => hashSub(sub));

  // Collect table names from environment
  const tableNames = [
    process.env.BUNDLE_DYNAMODB_TABLE_NAME,
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME,
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME,
  ].filter(Boolean);

  if (tableNames.length === 0) {
    logger.info("No DynamoDB tables configured for export");
    return;
  }

  // Collect all data from all tables
  const allData = [];
  for (const tableName of tableNames) {
    const items = await scanTableForHashedSubs(tableName, hashedSubs);
    for (const item of items) {
      allData.push({
        tableName,
        ...item,
      });
    }
  }

  if (allData.length === 0) {
    logger.info("No data found in DynamoDB tables for the specified users");
    return;
  }

  // Ensure target directory exists
  const targetDir = "./target";
  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    logger.error("Failed to create target directory:", error);
    return;
  }

  // Generate output file name based on test file name
  const baseFileName = testFileName.replace(/\.system\.test\.js$/, "").replace(/[^a-zA-Z0-9-]/g, "_");
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  const outputFileName = `${baseFileName}-dynamodb-export-${timestamp}.jsonl`;
  const outputFilePath = path.join(targetDir, outputFileName);

  // Write data in JSON lines format
  try {
    const jsonLines = allData.map((item) => JSON.stringify(item)).join("\n");
    fs.writeFileSync(outputFilePath, jsonLines, "utf8");

    logger.info(`DynamoDB export completed: ${outputFilePath}`);
    logger.info(`Exported ${allData.length} items from ${tableNames.length} tables for ${userSubs.length} users`);

    // Log the contents
    logger.info(`Contents of ${outputFileName}:`);
    logger.info(jsonLines);
  } catch (error) {
    logger.error("Failed to write DynamoDB export file:", error);
  }
}
