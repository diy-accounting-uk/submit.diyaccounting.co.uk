#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/customer-email-proof-receipt.mjs
//
// Writes and deletes the one synthetic VAT receipt that the customer email proof mails. The item
// has the keys and fields of a stored VAT return receipt, so the worker's getReceipt reads it as it
// reads a real one.
//
// usage: customer-email-proof-receipt.mjs put|delete
// env:   PROOF_USER_SUB, PROOF_RECEIPT_ID, ENVIRONMENT_NAME, RECEIPTS_DYNAMODB_TABLE_NAME, AWS credentials

import { pathToFileURL } from "node:url";
import { initializeSalt, hashSub } from "../app/services/subHasher.js";
import { putReceipt } from "../app/data/dynamoDbReceiptRepository.js";
import { executeDynamoDbCommand, getResourceName } from "../app/lib/dynamoDbClient.js";

/**
 * The receipt HMRC returns for an accepted VAT return, with fixed realistic values.
 * @param {Date} [now] the processing time
 */
export function buildProofReceipt(now = new Date()) {
  return {
    formBundleNumber: "256616771364",
    processingDate: now.toISOString(),
    paymentIndicator: "BANK",
    chargeRefNumber: "XM002610011594",
  };
}

/** The proof's account and receipt ids come from the workflow run, so a delete finds what the put wrote. */
export function readProofIds(env = process.env) {
  const userSub = env.PROOF_USER_SUB;
  const receiptId = env.PROOF_RECEIPT_ID;
  if (!userSub || !receiptId) throw new Error("PROOF_USER_SUB and PROOF_RECEIPT_ID are required");
  return { userSub, receiptId };
}

export async function putProofReceipt({ userSub, receiptId }, { put = putReceipt } = {}) {
  await put(userSub, receiptId, buildProofReceipt(), "probe");
}

export async function deleteProofReceipt({ userSub, receiptId }, { hash = hashSub, run = executeDynamoDbCommand } = {}) {
  const tableName = getResourceName("RECEIPTS_DYNAMODB_TABLE_NAME", true);
  await run((module) => new module.DeleteCommand({ TableName: tableName, Key: { hashedSub: hash(userSub), receiptId } }));
}

async function main() {
  const action = process.argv[2];
  if (action !== "put" && action !== "delete") throw new Error("usage: customer-email-proof-receipt.mjs put|delete");
  const ids = readProofIds();
  await initializeSalt();
  if (action === "put") await putProofReceipt(ids);
  else await deleteProofReceipt(ids);
  console.log(`proof receipt ${action}: done`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
