// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/bin/simulatorCommissionRoutes.js
//
// Routes for the simulator lane only. They stand in for the Stripe side of a referral and for the daily
// schedule: a paid invoice, a refund, a cancel and the release run at a chosen clock. The lane's server
// registers them only when ENVIRONMENT_NAME is "simulator".

import { createLogger } from "../lib/logger.js";
import { getDynamoDbDocClient, getResourceName } from "../lib/dynamoDbClient.js";
import { hashSub, initializeSalt } from "../services/subHasher.js";
import { accrueCommission, reverseCommissionForCharge } from "../services/commissionLedger.js";
import { releaseCommissions } from "../functions/account/commissionRelease.js";
import { putAffiliate } from "../data/dynamoDbPassRepository.js";
import { putSubscription, updateSubscription } from "../data/dynamoDbSubscriptionRepository.js";
import { emulateTransactions } from "../test-support/dynaliteTransactions.js";

const logger = createLogger({ source: "app/bin/simulatorCommissionRoutes.js" });

const NET_PENCE = 1000;
const MONTH_STARTS = [0, 1, 2, 3, 4].map((month) => Date.UTC(2026, month, 1));
const seconds = (ms) => ms / 1000;

const subscriptionIdOf = (redeemerHash) => `sim_commission_sub_${redeemerHash.slice(0, 16)}`;

function invoiceFor({ redeemerHash, month, cardFingerprint }) {
  const n = month + 1;
  return {
    id: `in_sim_${redeemerHash.slice(0, 16)}_${n}`,
    livemode: true,
    customer: { id: `cus_sim_${redeemerHash.slice(0, 16)}`, created: Math.ceil(Date.now() / 1000) },
    charge: {
      id: `ch_sim_${redeemerHash.slice(0, 16)}_${n}`,
      amount: 1200,
      created: seconds(MONTH_STARTS[month] + 3600 * 1000),
      refunded: false,
      amount_refunded: 0,
      disputed: false,
      payment_method_details: { card: { fingerprint: cardFingerprint } },
      balance_transaction: { net: NET_PENCE, fee: 200, currency: "gbp" },
    },
    lines: { data: [{ type: "subscription", period: { start: seconds(MONTH_STARTS[month]), end: seconds(MONTH_STARTS[month + 1]) } }] },
  };
}

async function allLines(redeemerSub) {
  const redeemerHash = redeemerSub ? hashSub(redeemerSub) : null;
  const { docClient, module } = await getDynamoDbDocClient();
  const lines = [];
  let startKey;
  do {
    const page = await docClient.send(
      new module.ScanCommand({ TableName: getResourceName("COMMISSIONS_DYNAMODB_TABLE_NAME"), ExclusiveStartKey: startKey }),
    );
    lines.push(...(page.Items ?? []).filter((item) => item.sk.startsWith("line#") && item.state));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return lines
    .filter((line) => !redeemerHash || line.redeemerHash === redeemerHash)
    .map((line) => ({
      referrerHash: line.pk.slice("commission#".length),
      redeemerHash: line.redeemerHash,
      invoiceId: line.invoiceId,
      tier: line.tier,
      form: line.form,
      state: line.state,
      amountPence: line.amountPence,
      holdReasons: line.holdReasons ?? [],
      reversalReason: line.reversalReason ?? null,
      releaseAt: line.releaseAt,
    }))
    .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
}

const ACTIONS = {
  // The referrer's affiliate item, as the operator's approval would write it.
  async affiliate({ referrerSub, tier, state }) {
    await putAffiliate({ referrerHash: hashSub(referrerSub), tier, state, now: new Date().toISOString() });
    return {};
  },

  // The redeemer's subscription is paid for the given month: the record the webhook would hold, then the accrual.
  async invoicePaid({ redeemerSub, month, cardFingerprint = `fp_${hashSub(redeemerSub).slice(0, 12)}` }) {
    const redeemerHash = hashSub(redeemerSub);
    const subscriptionId = subscriptionIdOf(redeemerHash);
    const subRecord = {
      pk: `stripe#${subscriptionId}`,
      hashedSub: redeemerHash,
      bundleId: "resident",
      status: "active",
      actor: "customer",
    };
    if (month === 0) await putSubscription(subRecord);
    const invoice = invoiceFor({ redeemerHash, month, cardFingerprint });
    const stripe = { invoices: { retrieve: async () => invoice } };
    const result = await accrueCommission({
      invoice,
      subscriptionId,
      subRecord,
      stripe,
      nowIso: new Date(MONTH_STARTS[month] + 3600 * 1000).toISOString(),
    });
    return { result };
  },

  async refund({ redeemerSub, month }) {
    const chargeId = invoiceFor({ redeemerHash: hashSub(redeemerSub), month }).charge.id;
    return { result: await reverseCommissionForCharge(chargeId, "refund", { nowIso: new Date().toISOString() }) };
  },

  async cancel({ redeemerSub, canceledAt }) {
    await updateSubscription(`stripe#${subscriptionIdOf(hashSub(redeemerSub))}`, { status: "canceled", canceledAt });
    return {};
  },

  async release({ asOf }) {
    return { summary: await releaseCommissions(new Date(asOf)) };
  },
};

export function registerSimulatorCommissionRoutes(app) {
  const ready = Promise.all([emulateTransactions(), initializeSalt()]);

  app.post("/api/v1/simulator/commission", async (req, res) => {
    const action = ACTIONS[req.body?.action];
    if (!action) {
      res.status(400).json({ message: `Unknown action: ${req.body?.action}` });
      return;
    }
    try {
      await ready;
      const outcome = await action(req.body);
      res.json({ ...outcome, lines: await allLines(req.body.redeemerSub) });
    } catch (error) {
      logger.error({ message: "Simulator commission action failed", action: req.body.action, error: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  logger.info({ message: "Simulator commission routes registered" });
}
