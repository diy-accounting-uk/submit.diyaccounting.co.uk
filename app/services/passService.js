// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/passService.js

import { createLogger } from "../lib/logger.js";
import { generatePassphrase } from "../lib/passphrase.js";
import { hashEmail, hashEmailWithEnvSecret } from "../lib/emailHash.js";
import { calculateTtl } from "../lib/dateUtils.js";
import * as passRepository from "../data/dynamoDbPassRepository.js";

const logger = createLogger({ source: "app/services/passService.js" });

/**
 * Parse an ISO 8601 duration and add it to a date.
 * Supports: PnD, PnM, PnY, and combinations like P1Y2M3D.
 *
 * @param {Date} date - The base date
 * @param {string} duration - ISO 8601 duration string
 * @returns {Date} The resulting date
 */
export function addDuration(date, duration) {
  const result = new Date(date.getTime());
  // eslint-disable-next-line security/detect-unsafe-regex
  const match = String(duration || "").match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (!match) throw new Error(`Invalid ISO 8601 duration: ${duration}`);

  const years = parseInt(match[1] || "0", 10);
  const months = parseInt(match[2] || "0", 10);
  const days = parseInt(match[3] || "0", 10);

  result.setFullYear(result.getFullYear() + years);
  result.setMonth(result.getMonth() + months);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Build a pass record from parameters.
 *
 * @param {Object} params
 * @param {string} params.passTypeId - Pass type identifier (e.g. "invited-guest")
 * @param {string} params.bundleId - Bundle to grant on redemption
 * @param {string} [params.validFrom] - ISO8601 start time (default: now)
 * @param {string} [params.validUntil] - ISO8601 end time (exclusive with validityPeriod)
 * @param {string} [params.validityPeriod] - ISO8601 duration (e.g. "P7D", "P1M")
 * @param {number} [params.maxUses] - Maximum redemptions (default: 1)
 * @param {string} [params.restrictedToEmail] - Email to restrict pass to (null = unrestricted)
 * @param {string} [params.emailHashSecret] - Secret for hashing email (if not using env secret)
 * @param {string} [params.createdBy] - Creator identifier
 * @param {string} [params.issuedBy] - User who spent tokens to issue (null for admin-created)
 * @param {string} [params.notes] - Optional admin notes
 * @returns {Object} The pass record ready for DynamoDB
 */
export function buildPassRecord({
  passTypeId,
  bundleId,
  testPass,
  validFrom,
  validUntil,
  validityPeriod,
  maxUses = 1,
  restrictedToEmail,
  emailHashSecret,
  createdBy,
  issuedBy,
  notes,
}) {
  const now = new Date().toISOString();
  const code = generatePassphrase(4);
  const effectiveValidFrom = validFrom || now;

  let effectiveValidUntil = validUntil || null;
  if (!effectiveValidUntil && validityPeriod) {
    effectiveValidUntil = addDuration(new Date(effectiveValidFrom), validityPeriod).toISOString();
  }

  // Calculate TTL: 30 days after validUntil, or 1 year + 30 days from creation if unlimited
  const ttlBaseDate = effectiveValidUntil ? new Date(effectiveValidUntil) : addDuration(new Date(now), "P1Y");
  const { ttl, ttl_datestamp } = calculateTtl(ttlBaseDate, { days: 30 });

  // Hash email if restricted
  let restrictedToEmailHash = null;
  let emailHashSecretVersion = null;
  if (restrictedToEmail) {
    if (emailHashSecret) {
      restrictedToEmailHash = hashEmail(restrictedToEmail, emailHashSecret);
      emailHashSecretVersion = "explicit";
    } else {
      const result = hashEmailWithEnvSecret(restrictedToEmail);
      restrictedToEmailHash = result.hash;
      emailHashSecretVersion = result.secretVersion;
    }
  }

  // Only include fields with values — omit null/undefined fields that participate
  // in DynamoDB ConditionExpressions (revokedAt, validUntil) so that
  // attribute_not_exists() evaluates correctly.
  const record = {
    pk: `pass#${code}`,
    code,
    bundleId,
    passTypeId,
    validFrom: effectiveValidFrom,
    ttl,
    ttl_datestamp,
    createdAt: now,
    updatedAt: now,
    maxUses,
    useCount: 0,
  };
  if (effectiveValidUntil) record.validUntil = effectiveValidUntil;
  if (restrictedToEmailHash) {
    record.restrictedToEmailHash = restrictedToEmailHash;
    record.emailHashSecretVersion = emailHashSecretVersion;
  }
  if (testPass) record.testPass = true;
  if (createdBy) record.createdBy = createdBy;
  if (issuedBy) record.issuedBy = issuedBy;
  if (notes) record.notes = notes;
  return record;
}

/**
 * Create and store a new pass.
 * Retries once on code collision.
 *
 * @param {Object} params - Same as buildPassRecord
 * @returns {Promise<Object>} The stored pass record
 */
export async function createPass(params) {
  let pass = buildPassRecord(params);

  try {
    await passRepository.putPass(pass);
    return pass;
  } catch (error) {
    if (error.message === "Pass code collision") {
      logger.info({ message: "Pass code collision, retrying with new code" });
      pass = buildPassRecord(params);
      await passRepository.putPass(pass);
      return pass;
    }
    throw error;
  }
}

/**
 * Check pass validity without consuming it (idempotent).
 *
 * @param {string} code - The passphrase code
 * @param {string} [userEmail] - The user's email (for email-restricted passes)
 * @param {string} [emailHashSecret] - Secret for hashing email
 * @returns {Promise<Object>} Validity result: { valid, reason?, bundleId?, usesRemaining? }
 */
export async function checkPass(code, userEmail, emailHashSecret) {
  const pass = await passRepository.getPass(code);

  if (!pass) {
    return { valid: false, reason: "not_found" };
  }

  const now = new Date().toISOString();
  return validatePass(pass, now, userEmail, emailHashSecret);
}

/**
 * Redeem a pass - validate and atomically increment useCount.
 *
 * @param {string} code - The passphrase code
 * @param {string} [userEmail] - The user's email (for email-restricted passes)
 * @param {string} [emailHashSecret] - Secret for hashing email
 * @returns {Promise<Object>} Redemption result: { valid, reason?, pass?, bundleId? }
 */
export async function redeemPass(code, userEmail, emailHashSecret) {
  const now = new Date().toISOString();

  // Try atomic redeem first (optimistic)
  const redeemed = await passRepository.redeemPass(code, now);

  if (redeemed) {
    // Atomic redeem succeeded, but still need to check email restriction
    if (redeemed.restrictedToEmailHash) {
      if (!userEmail) {
        return { valid: false, reason: "email_required", pass: redeemed };
      }

      let emailHash;
      if (emailHashSecret) {
        emailHash = hashEmail(userEmail, emailHashSecret);
      } else {
        emailHash = hashEmailWithEnvSecret(userEmail).hash;
      }

      if (redeemed.restrictedToEmailHash !== emailHash) {
        // Email doesn't match - we already incremented useCount, but this is acceptable
        // because the pass is email-restricted and the wrong person can't use the bundle
        return { valid: false, reason: "wrong_email", pass: redeemed };
      }
    }

    return {
      valid: true,
      pass: redeemed,
      bundleId: redeemed.bundleId,
      usesRemaining: redeemed.maxUses - redeemed.useCount,
    };
  }

  // Atomic redeem failed - diagnose why
  const reason = await diagnoseFailure(code);
  return { valid: false, reason };
}

/**
 * Validate a pass record against current time and optional email.
 */
function validatePass(pass, now, userEmail, emailHashSecret) {
  if (pass.revokedAt) return { valid: false, reason: "revoked", pass };
  if (pass.useCount >= pass.maxUses) return { valid: false, reason: "exhausted", pass };
  if (now < pass.validFrom) return { valid: false, reason: "not_yet_valid", pass };
  if (pass.validUntil && now > pass.validUntil) return { valid: false, reason: "expired", pass };

  if (pass.restrictedToEmailHash) {
    if (!userEmail) {
      return { valid: false, reason: "email_required", pass };
    }

    let emailHash;
    if (emailHashSecret) {
      emailHash = hashEmail(userEmail, emailHashSecret);
    } else {
      emailHash = hashEmailWithEnvSecret(userEmail).hash;
    }

    if (pass.restrictedToEmailHash !== emailHash) {
      return { valid: false, reason: "wrong_email", pass };
    }
  }

  return {
    valid: true,
    pass,
    bundleId: pass.bundleId,
    usesRemaining: pass.maxUses - pass.useCount,
  };
}

/**
 * Diagnose why a pass redemption failed by fetching and inspecting the record.
 *
 * @param {string} code - The passphrase code
 * @returns {Promise<string>} Machine-readable reason code
 */
export async function diagnoseFailure(code) {
  const pass = await passRepository.getPass(code);

  if (!pass) return "not_found";

  const now = new Date().toISOString();
  if (pass.revokedAt) return "revoked";
  if (pass.useCount >= pass.maxUses) return "exhausted";
  if (now < pass.validFrom) return "not_yet_valid";
  if (pass.validUntil && now > pass.validUntil) return "expired";
  return "unknown";
}
