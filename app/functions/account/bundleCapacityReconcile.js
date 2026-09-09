// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/bundleCapacityReconcile.js
//
// Scheduled Lambda (EventBridge, every hour) that queries the bundleId-expiry-index
// for each capped bundleId, counts active (non-expired) allocations, and writes
// the correct count to the capacity counter table.

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { loadCatalogFromRoot, getCappedBundleIds } from "../../services/productCatalog.js";
import { countActiveAllocations } from "../../data/dynamoDbBundleRepository.js";
import { putCounter } from "../../data/dynamoDbCapacityRepository.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/bundleCapacityReconcile.js" });

export async function handler(_event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME", "BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME"]);

  logger.info({ message: "Starting bundle capacity reconciliation" });

  let catalog;
  try {
    catalog = loadCatalogFromRoot();
  } catch (error) {
    logger.error({ message: "Failed to load catalogue", error: error.message });
    throw error;
  }

  const cappedBundleIds = getCappedBundleIds(catalog);
  if (cappedBundleIds.length === 0) {
    logger.info({ message: "No capped bundles in catalogue, nothing to reconcile" });
    return;
  }

  const now = new Date().toISOString();
  const failures = [];

  for (const bundleId of cappedBundleIds) {
    try {
      const activeCount = await countActiveAllocations(bundleId, now);
      await putCounter(bundleId, activeCount);
      emitActiveAllocationsMetric(bundleId, activeCount);
      logger.info({ message: "Reconciled bundle capacity", bundleId, activeCount });
    } catch (error) {
      logger.error({ message: "Error reconciling bundle capacity", bundleId, error: error.message });
      failures.push({ bundleId, error: error.message });
    }
  }

  if (failures.length > 0) {
    const failedBundleIds = failures.map((failure) => failure.bundleId).join(", ");
    throw new Error(`Bundle capacity reconciliation failed for: ${failedBundleIds}. First error: ${failures[0].error}`);
  }

  logger.info({ message: "Bundle capacity reconciliation complete", bundleCount: cappedBundleIds.length });
  await publishActivityEvent({
    event: "capacity-reconciled",
    summary: "Capacity reconciled",
    flow: "operational",
  });
}

function emitActiveAllocationsMetric(bundleId, activeCount) {
  try {
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "Submit/BundleCapacity",
              Dimensions: [["bundleId"]],
              Metrics: [{ Name: "BundleActiveAllocations", Unit: "Count" }],
            },
          ],
        },
        bundleId,
        BundleActiveAllocations: activeCount,
      }),
    );
  } catch {
    // EMF emission is best-effort
  }
}
