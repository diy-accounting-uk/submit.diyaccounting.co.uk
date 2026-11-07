// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/recordRetention.js

import { calculateTtl, TTL_PRESETS } from "./dateUtils.js";

// A short ttl deletes the record later. A record gets one only when the code proves that a test or a
// synthetic caller wrote it. An unknown actor, an empty actor and a customer actor are all kept.
// Only "test-user" and "probe" prove a test actor: "system" is what a missing email gives, and
// "customer" is the fallback of resolveActorClass.
const TEST_ACTORS = ["test-user", "probe"];

/**
 * True when the actor class proves that a test or a synthetic caller acted.
 * @param {string|undefined|null} actor
 * @returns {boolean}
 */
export function isTestActor(actor) {
  return TEST_ACTORS.includes(actor);
}

/**
 * Retention of a pass. A test pass lives two days from creation. A pass with an end date lives
 * until thirty days after it. A pass with no end date has no ttl until its last use.
 * @param {{testPass?: boolean, actor?: string, validUntil?: string|null}} pass
 * @param {Date} now - Creation time
 * @returns {{ttl: number, ttl_datestamp: string}|null} null when the record keeps no ttl
 */
export function passRetention({ testPass, actor, validUntil }, now) {
  if (testPass === true || isTestActor(actor)) return calculateTtl(now, TTL_PRESETS.TWO_DAYS);
  if (validUntil) return calculateTtl(new Date(validUntil), TTL_PRESETS.THIRTY_DAYS);
  return null;
}

/**
 * Retention of a pass with no end date that has used its last use: thirty days from that use.
 * @param {{validUntil?: string, ttl?: number, maxUses?: number, useCount?: number}} pass - The pass after the use
 * @param {Date} now - Time of the use
 * @returns {{ttl: number, ttl_datestamp: string}|null} null when the pass is not in that state
 */
export function lastUseRetention(pass, now) {
  if (!pass || pass.validUntil || pass.ttl !== undefined) return null;
  if (typeof pass.maxUses !== "number" || typeof pass.useCount !== "number") return null;
  if (pass.useCount < pass.maxUses) return null;
  return calculateTtl(now, TTL_PRESETS.THIRTY_DAYS);
}

/**
 * Retention of a new subscription row. Only a test-mode Stripe event proves a test row, and a
 * live-mode row never has a ttl.
 * @param {{test?: boolean}} subscription - test is true only when the event has livemode false
 * @param {Date} now
 * @returns {{ttl: number, ttl_datestamp: string}|null}
 */
export function subscriptionRetention({ test }, now) {
  if (test !== true) return null;
  return calculateTtl(now, TTL_PRESETS.TWO_DAYS);
}

/**
 * Retention of an ended subscription row. A test-mode row lives two days. A live row lives 180
 * days from the end date.
 * @param {{test?: boolean}} subscription
 * @param {Date} endedAt
 * @param {Date} now
 * @returns {{ttl: number, ttl_datestamp: string}}
 */
export function endedSubscriptionRetention({ test }, endedAt, now) {
  if (test === true) return calculateTtl(now, TTL_PRESETS.TWO_DAYS);
  return calculateTtl(endedAt, TTL_PRESETS.ONE_HUNDRED_EIGHTY_DAYS);
}

/**
 * Retention of a receipt. A receipt keeps the seven-year tax record ttl unless a test or
 * synthetic caller filed it: the actor is a test actor and the flow is synthetic.
 * @param {{actor?: string, synthetic?: boolean}} receipt
 * @param {Date} now
 * @returns {{ttl: number, ttl_datestamp: string}}
 */
export function receiptRetention({ actor, synthetic }, now) {
  if (synthetic === true && isTestActor(actor)) return calculateTtl(now, TTL_PRESETS.TWO_DAYS);
  return calculateTtl(now, TTL_PRESETS.HMRC_TAX_RECORDS);
}

/**
 * Retention of a pass figures item: thirteen months from the computed time.
 * @param {Date} computedAt
 * @returns {{ttl: number, ttl_datestamp: string}}
 */
export function figuresRetention(computedAt) {
  return calculateTtl(computedAt, TTL_PRESETS.THIRTEEN_MONTHS);
}
