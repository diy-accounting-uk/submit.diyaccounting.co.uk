#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/bin/dynamodb.js

import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import dynalite from "dynalite";

dotenvConfigIfNotBlank({ path: ".env" });

import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/bin/dynamodb.js" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read configuration from cdk.json
const cdkJsonPath = path.join(__dirname, "../../cdk-application/cdk.json");
logger.info(`Reading CDK configuration from ${cdkJsonPath}`);
const cdkConfig = JSON.parse(readFileSync(cdkJsonPath, "utf8"));
const context = cdkConfig.context || {};
logger.info("CDK context:", context);

function startDynaliteServer({ host = "127.0.0.1", port = 9000 } = {}) {
  const server = dynalite({ createTableMs: 0 });
  return new Promise((resolve, reject) => {
    server.listen(port, host, (err) => {
      if (err) return reject(err);
      // If using port 0, retrieve the actual bound port from server.address()
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr && "port" in addr ? addr.port : port;
      const endpoint = `http://${host}:${actualPort}`;
      resolve({ server, endpoint });
    });
  });
}

export async function startDynamoDB() {
  // Start a single, consistent local DynamoDB-like server (dynalite)
  const host = process.env.DYNAMODB_HOST || "127.0.0.1";
  // Allow tests to request a random free port with DYNAMODB_PORT=0
  const rawPort = process.env.DYNAMODB_PORT;
  const port = Number.isFinite(Number(rawPort)) ? Number(rawPort) : 9000;
  const { server, endpoint } = await startDynaliteServer({ host, port });
  const stop = async () => {
    try {
      server.close();
    } catch (error) {
      logger.error("Error stopping dynalite server:", error);
    }
  };
  return { endpoint, container: null, stop };
}

// Create bundle table if it doesn't exist
export async function ensureBundleTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring bundle table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "hashedSub", KeyType: "HASH" },
            { AttributeName: "bundleId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "hashedSub", AttributeType: "S" },
            { AttributeName: "bundleId", AttributeType: "S" },
            { AttributeName: "expiry", AttributeType: "S" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "bundleId-expiry-index",
              KeySchema: [
                { AttributeName: "bundleId", KeyType: "HASH" },
                { AttributeName: "expiry", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "KEYS_ONLY" },
            },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Create HMRC API requests table if it doesn't exist
export async function ensureHmrcApiRequestsTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring HMRC API requests table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "hashedSub", KeyType: "HASH" },
            { AttributeName: "id", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "hashedSub", AttributeType: "S" },
            { AttributeName: "id", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Create general async requests table if it doesn't exist
export async function ensureAsyncRequestsTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring async requests table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "hashedSub", KeyType: "HASH" },
            { AttributeName: "requestId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "hashedSub", AttributeType: "S" },
            { AttributeName: "requestId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Create receipts table if it doesn't exist
export async function ensureReceiptsTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring receipts table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "hashedSub", KeyType: "HASH" },
            { AttributeName: "receiptId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "hashedSub", AttributeType: "S" },
            { AttributeName: "receiptId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Create passes table if it doesn't exist
export async function ensurePassesTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring passes table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "issuedBy", AttributeType: "S" },
            { AttributeName: "createdAt", AttributeType: "S" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "issuedBy-index",
              KeySchema: [
                { AttributeName: "issuedBy", KeyType: "HASH" },
                { AttributeName: "createdAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Create bundle capacity counter table if it doesn't exist
export async function ensureCapacityTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring capacity table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [{ AttributeName: "bundleId", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "bundleId", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Only start the server if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bundleTableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  const receiptsTableName = process.env.RECEIPTS_DYNAMODB_TABLE_NAME;
  const hmrcApiRequestsTableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;

  let stop;

  try {
    logger.info("Starting local DynamoDB (dynalite) server...");
    const started = await startDynamoDB();
    stop = started.stop;
    const endpoint = started.endpoint;
    console.log(`DynamoDB started url=${endpoint}`);

    // Ensure tables exist
    if (bundleTableName) {
      await ensureBundleTableExists(bundleTableName, endpoint);
    }
    if (hmrcApiRequestsTableName) {
      await ensureHmrcApiRequestsTableExists(hmrcApiRequestsTableName, endpoint);
    }
    if (receiptsTableName) {
      await ensureReceiptsTableExists(receiptsTableName, endpoint);
    }
    const passesTableName = process.env.PASSES_DYNAMODB_TABLE_NAME;
    if (passesTableName) {
      await ensurePassesTableExists(passesTableName, endpoint);
    }
    const capacityTableName = process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME;
    if (capacityTableName) {
      await ensureCapacityTableExists(capacityTableName, endpoint);
    }
    const bundlePostAsyncRequestsTableName = process.env.BUNDLE_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (bundlePostAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(bundlePostAsyncRequestsTableName, endpoint);
    }
    const bundleDeleteAsyncRequestsTableName = process.env.BUNDLE_DELETE_ASYNC_REQUESTS_TABLE_NAME;
    if (bundleDeleteAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(bundleDeleteAsyncRequestsTableName, endpoint);
    }
    const hmrcVatReturnPostAsyncRequestsTableName = process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatReturnPostAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcVatReturnPostAsyncRequestsTableName, endpoint);
    }
    const hmrcVatReturnGetAsyncRequestsTableName = process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatReturnGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcVatReturnGetAsyncRequestsTableName, endpoint);
    }
    const hmrcVatObligationGetAsyncRequestsTableName = process.env.HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatObligationGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcVatObligationGetAsyncRequestsTableName, endpoint);
    }
    const hmrcVatLiabilitiesGetAsyncRequestsTableName = process.env.HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatLiabilitiesGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcVatLiabilitiesGetAsyncRequestsTableName, endpoint);
    }
    const hmrcVatPaymentsGetAsyncRequestsTableName = process.env.HMRC_VAT_PAYMENTS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatPaymentsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcVatPaymentsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcVatPenaltiesGetAsyncRequestsTableName = process.env.HMRC_VAT_PENALTIES_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatPenaltiesGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcVatPenaltiesGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaBusinessDetailsGetAsyncRequestsTableName = process.env.HMRC_ITSA_BUSINESS_DETAILS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaBusinessDetailsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaBusinessDetailsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaObligationsGetAsyncRequestsTableName = process.env.HMRC_ITSA_OBLIGATIONS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaObligationsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaObligationsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName =
      process.env.HMRC_ITSA_SELF_EMPLOYMENT_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName =
      process.env.HMRC_ITSA_SELF_EMPLOYMENT_PERIODS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName =
      process.env.HMRC_ITSA_SELF_EMPLOYMENT_PERIOD_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName =
      process.env.HMRC_ITSA_SELF_EMPLOYMENT_PERIOD_PUT_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName =
      process.env.HMRC_ITSA_SELF_EMPLOYMENT_ANNUAL_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName =
      process.env.HMRC_ITSA_SELF_EMPLOYMENT_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_PERIODS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_PERIOD_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_PERIOD_PUT_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_ANNUAL_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName = process.env.HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName = process.env.HMRC_ITSA_BSAS_SELF_EMPLOYMENT_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName =
      process.env.HMRC_ITSA_BSAS_SELF_EMPLOYMENT_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaBsasUkPropertyGetAsyncRequestsTableName = process.env.HMRC_ITSA_BSAS_UK_PROPERTY_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaBsasUkPropertyGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaBsasUkPropertyGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName =
      process.env.HMRC_ITSA_BSAS_UK_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaLossesAndClaimsGetAsyncRequestsTableName = process.env.HMRC_ITSA_LOSSES_AND_CLAIMS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaLossesAndClaimsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaLossesAndClaimsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaLossesAndClaimsPutAsyncRequestsTableName = process.env.HMRC_ITSA_LOSSES_AND_CLAIMS_PUT_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaLossesAndClaimsPutAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaLossesAndClaimsPutAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName = process.env.HMRC_ITSA_LOSSES_AND_CLAIMS_DELETE_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName =
      process.env.HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName =
      process.env.HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName, endpoint);
    }
    const hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName =
      process.env.HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_DELETE_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName, endpoint);
    }
    const companiesHouseAccountsAsyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
    if (companiesHouseAccountsAsyncRequestsTableName) {
      await ensureAsyncRequestsTableExists(companiesHouseAccountsAsyncRequestsTableName, endpoint);
    }

    logger.info("DynamoDB Local server is running. Press CTRL-C to stop.");

    // Handle graceful shutdown
    let isShuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`\nReceived ${signal}. Shutting down DynamoDB Local server...`);
      try {
        await stop?.();
        logger.info("DynamoDB Local server stopped successfully.");
      } catch (error) {
        logger.error("Error stopping DynamoDB Local server:", error);
      }
      process.exit(0);
    };

    // Listen for termination signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // This interval keeps the process running
    }, 1000);

    // Clean up interval on exit
    process.on("exit", () => {
      clearInterval(keepAlive);
    });
  } catch (error) {
    logger.error("Failed to start DynamoDB Local server:", error);
    process.exit(1);
  }
}
