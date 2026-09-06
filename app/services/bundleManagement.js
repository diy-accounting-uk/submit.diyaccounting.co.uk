// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/bundleEnforcement.js

import { createLogger } from "../lib/logger.js";
import { extractRequest, extractUserFromAuthorizerContext } from "../lib/httpResponseHelper.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "./productCatalog.js";
import * as dynamoDbBundleStore from "../data/dynamoDbBundleRepository.js";
import { getUserBundles } from "../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/services/bundleEnforcement.js" });

export class BundleAuthorizationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BundleAuthorizationError";
    this.details = details;
  }
}

export class BundleEntitlementError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BundleEntitlementError";
    this.details = details;
  }
}

// Note: getUserBundles is exported above as a direct reference to repository
// function for test mocking compatibility.

export async function updateUserBundles(userId, bundles) {
  logger.info({ message: `Updating bundles for user ${userId} with ${bundles.length}`, bundles });

  // Update DynamoDB - this requires removing old bundles and adding new ones
  // Get current bundles to determine what to remove
  const currentBundles = await getUserBundles(userId);

  logger.info({ message: `Current bundles for user ${userId} in DynamoDB count: ${currentBundles.length}`, currentBundles });

  // Parse bundle IDs from current bundles
  const currentBundleIds = new Set(currentBundles.map((b) => b.bundleId));
  logger.info({ message: `Current bundle IDs for user ${userId} in DynamoDB count: ${currentBundleIds.length}`, currentBundleIds });

  // Parse bundle IDs from new bundles
  const newBundleIds = new Set(bundles.map((b) => b.bundleId));
  logger.info({ message: `New bundle IDs for user ${userId} count: ${newBundleIds.length}`, newBundleIds });

  // Remove bundles that are no longer in the new list
  const bundlesToRemove = [...currentBundleIds].filter((id) => !newBundleIds.has(id));
  logger.info({ message: `Bundles to remove for user ${userId} in DynamoDB`, bundlesToRemove });
  for (const bundleId of bundlesToRemove) {
    await dynamoDbBundleStore.deleteBundle(userId, bundleId);
  }

  // Add new bundles
  for (const bundle of bundles) {
    logger.info({ message: `Checking if bundle ${bundle.bundleId} needs adding for user ${userId} in DynamoDB`, bundle });
    if (bundle.bundleId && !currentBundleIds.has(bundle.bundleId)) {
      logger.info({ message: `Adding new bundle ${bundle.bundleId} for user ${userId} in DynamoDB`, bundle });
      await dynamoDbBundleStore.putBundle(userId, bundle);
    }
  }

  logger.info({ message: `Updated bundles for user ${userId} in DynamoDB`, bundles });
}

async function getUserBundlesFromStorage(userSub) {
  logger.info({ message: "Fetching user bundles from storage", userSub });
  const bundles = await getUserBundles(userSub);
  logger.info({ message: "User bundles retrieved", userSub, bundles, bundleCount: bundles.length });
  return bundles;
}

export async function addBundles(userId, bundlesToAdd) {
  logger.info({ message: "addBundles called", userId, bundlesToAdd });

  const currentBundles = await getUserBundles(userId);
  const newBundles = [...currentBundles];

  for (const bundle of bundlesToAdd) {
    if (!newBundles.some((b) => b.startsWith(bundle) || b === bundle)) {
      newBundles.push(bundle);
    }
  }

  await updateUserBundles(userId, newBundles);

  logger.info({
    message: "Bundles added successfully",
    userId,
    addedBundles: bundlesToAdd,
    previousCount: currentBundles.length,
    newCount: newBundles.length,
  });

  return newBundles;
}

export async function removeBundles(userId, bundlesToRemove) {
  logger.info({ message: "removeBundles called", userId, bundlesToRemove });

  const currentBundles = await getUserBundles(userId);
  const newBundles = currentBundles.filter((bundle) => {
    return !bundlesToRemove.some((toRemove) => bundle === toRemove || bundle.startsWith(`${toRemove}|`));
  });

  await updateUserBundles(userId, newBundles);

  logger.info({
    message: "Bundles removed successfully",
    userId,
    removedBundles: bundlesToRemove,
    previousCount: currentBundles.length,
    newCount: newBundles.length,
  });

  return newBundles;
}

export async function enforceBundles(event, options = {}) {
  const { hmrcBase = process.env.HMRC_BASE_URI } = options;

  logger.info({
    message: "enforceBundles called",
    hmrcBase,
  });

  const userSub = extractUserInfo(event);
  const { request } = extractRequest(event);
  const requestPath = request?.pathname || "";
  const catalog = loadCatalogFromRoot();
  const matchedActivities = findMatchingActivitiesForUrlPath(catalog, requestPath);
  const requiredBundleIds = requiredBundleIdsFromActivities(matchedActivities);
  if (requiredBundleIds.length === 0) {
    logger.info({ message: "No required bundles for request path - unrestricted", requestPath });
  }

  const environmentName = process.env.ENVIRONMENT_NAME;
  const environmentRestrictedActivity = matchedActivities.find(
    (activity) => !isActivityListedInEnvironment(activity, environmentName),
  );
  if (environmentRestrictedActivity) {
    const errorDetails = {
      code: "ACTIVITY_ENVIRONMENT_RESTRICTED",
      activityId: environmentRestrictedActivity.id,
      environments: environmentRestrictedActivity.environments,
      environmentName,
      path: requestPath,
    };
    const message = `Forbidden: ${environmentRestrictedActivity.id} is not available in the ${environmentName || "current"} environment`;
    logger.warn({ message, ...errorDetails });
    throw new BundleEntitlementError(message, errorDetails);
  }

  // Automatic bundles that everyone has implicitly
  const automaticBundleIds = getAutomaticBundles(catalog);
  const subscribedBundles = await getUserBundlesFromStorage(userSub);
  const subscribedBundleIds = subscribedBundles.map((b) => b.bundleId);
  const currentBundleIds = new Set([...(automaticBundleIds || []), ...(subscribedBundleIds || [])]);

  logger.info({
    message: "Checking bundle entitlements",
    userSub,
    path: requestPath,
    requiredBundleIds: requiredBundleIds,
    currentBundleIds: currentBundleIds,
  });

  const hasAnyRequired = requiredBundleIds.length === 0 || requiredBundleIds.some((req) => currentBundleIds.has(req));
  if (!hasAnyRequired) {
    const errorDetails = {
      code: "BUNDLE_FORBIDDEN",
      requiredBundleIds,
      currentBundleIds,
      userSub,
      path: requestPath,
    };

    const message = `Forbidden: Activity requires ${requiredBundleIds.join(" or ")} bundle`;
    logger.warn({ message, ...errorDetails });
    throw new BundleEntitlementError(message, errorDetails);
  }

  // Collect the user's matched bundle IDs for downstream use (e.g. Gov-Vendor-License-IDs)
  const matchedBundleIds = requiredBundleIds.filter((id) => currentBundleIds.has(id));

  logger.info({
    message: "Bundle entitlement check passed",
    userSub,
    path: requestPath,
    matchedBundleIds,
  });

  return { userSub, bundleIds: matchedBundleIds };
}

function extractUserInfo(event) {
  logger.info({ message: "Extracting user information from event" });

  // Try to get user from authorizer context
  const userInfo = extractUserFromAuthorizerContext(event);
  if (!userInfo) {
    logger.warn({ message: "No authorization token found in event" });
    throw new BundleAuthorizationError("Missing Authorization Bearer token", {
      code: "MISSING_AUTH_TOKEN",
    });
  } else if (!userInfo?.sub) {
    logger.warn({ message: "Invalid authorization token - missing sub claim" });
    throw new BundleAuthorizationError("Invalid Authorization token", {
      code: "INVALID_AUTH_TOKEN",
    });
  } else {
    const userSub = userInfo.sub;
    logger.info({
      message: "User info extracted from authorizer context",
      sub: userSub,
      username: userInfo.username,
      claims: Object.keys(userInfo),
    });
    return userSub;
  }
}

// Calculate required bundles by seeing which activities in the catalog match this events URL path and require bundles
// We'll first determine the required bundles for this path. If only automatic bundles are required,
// we allow access without requiring authentication. Only when non-automatic bundles are required
// do we extract the user and fetch their bundles from storage.
// Helper: derive bundle ID from stored string (which may include metadata like EXPIRY)
// const toBundleId = (b) => (typeof b === "string" ? b.split("|")[0] : String(b || ""));

// Helper: match activity by path (mirrors web/public/widgets/entitlement-status.js)
function matchesRegexPattern(pattern, normalizedPath) {
  try {
    const regex = new RegExp(pattern);
    return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
  } catch (err) {
    logger.warn({ message: "Invalid regex pattern in catalog", pattern, err: String(err) });
    return false;
  }
}

function matchesSimplePath(path, normalizedPath) {
  const normalizedActivityPath = (path || "").replace(/^\//, "");
  return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
}

function findMatchingActivitiesForUrlPath(catalog, currentPath) {
  if (!catalog?.activities) return [];

  // Keep both variants: with and without query
  const pathWithQuery = String(currentPath || "").replace(/^\//, "");
  const pathNoQuery = pathWithQuery.split("?")[0];

  const matched = [];

  for (const activity of catalog.activities) {
    const paths = activity.paths || (activity.path ? [activity.path] : []);

    for (const pRaw of paths) {
      const p = String(pRaw);

      // Regex paths start with "^" (same convention as before)
      const isMatch = p.startsWith("^")
        ? // Try matching both with and without query; helper already checks with and without leading slash
          matchesRegexPattern(p, pathNoQuery) || matchesRegexPattern(p, pathWithQuery)
        : // For simple paths, match against the variant that makes sense:
          // - If the activity path contains a query, preserve it when comparing
          // - Otherwise compare without the query string
          // eslint-disable-next-line sonarjs/no-nested-conditional
          p.includes("?")
          ? matchesSimplePath(p, pathWithQuery)
          : matchesSimplePath(p, pathNoQuery);

      if (isMatch) {
        matched.push(activity);
        // No need to test other patterns for this activity once matched
        break;
      }
    }
  }

  return matched;
}

function requiredBundleIdsFromActivities(activities) {
  const required = new Set();
  for (const activity of activities) {
    const bundles = Array.isArray(activity.bundles) ? activity.bundles : [];
    for (const b of bundles) required.add(b);
  }
  return Array.from(required);
}

function getAutomaticBundles(catalog) {
  if (!catalog?.bundles) return [];
  return catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
}
