#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/stripe-configure-policies.js
//
// Configures Stripe account-level policies for a no-quibble, customer-first approach:
//
// 1. PAYOUT SCHEDULE: Weekly on Wednesdays with minimum delay.
//    - Funds sit in Stripe for ~7 days before reaching the bank.
//    - Gives time for early fraud warnings and pre-dispute resolution.
//    - At £9.99/month, holding funds a week costs nothing in interest
//      but eliminates the risk of paying out then clawing back.
//
// 2. DISPUTE STRATEGY (manual configuration guidance):
//    - At £9.99/month, the dispute fee (£20+£20) exceeds the charge.
//    - Auto-accept all disputes via Verifi RDR + Ethoca Alerts.
//    - Never contest — it's cheaper to refund than to fight.
//
// 3. REFUND SAFETY:
//    - Stripe refunds are bounded by the original charge (can't exceed).
//    - No risk of "draw down" beyond what the customer paid.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-configure-policies.js
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-configure-policies.js --dry-run
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-configure-policies.js --show-current
//
// This script is idempotent — safe to run multiple times.

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const showCurrent = args.includes("--show-current");
const mode = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "TEST";

// --- Desired payout configuration ---
//
// Why weekly on Wednesday:
// - Payment on Monday → included in Wednesday payout → arrives Thursday/Friday
// - Payment on Thursday → included in next Wednesday payout → arrives next Thu/Fri
// - Maximum hold: ~7-8 days. Minimum hold: ~2-3 days.
// - Early Fraud Warnings (Visa TC40 / Mastercard SAFE) typically arrive within 24-48 hours.
// - Pre-dispute alerts from Verifi/Ethoca arrive ~24-48 hours before formal dispute.
// - Weekly payout means most charges are still in-balance when alerts arrive.
//
// At £9.99/month with low volume, the opportunity cost of holding funds is negligible.
// The risk reduction (avoiding negative balance from chargebacks) is material.
const DESIRED_PAYOUT_SCHEDULE = {
  interval: "weekly",
  weekly_anchor: "wednesday",
};

async function getCurrentSettings() {
  try {
    const account = await stripe.accounts.retrieve();
    return {
      payoutSchedule: account.settings?.payouts?.schedule || null,
      payoutStatementDescriptor: account.settings?.payouts?.statement_descriptor || null,
      country: account.country,
      businessType: account.business_type,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      accountId: account.id,
    };
  } catch (error) {
    console.error("Failed to retrieve account settings:", error.message);
    process.exit(1);
  }
}

function formatSchedule(schedule) {
  if (!schedule) return "(not set)";
  const parts = [`interval: ${schedule.interval}`];
  if (schedule.delay_days !== undefined) parts.push(`delay_days: ${schedule.delay_days}`);
  if (schedule.weekly_anchor) parts.push(`weekly_anchor: ${schedule.weekly_anchor}`);
  if (schedule.monthly_anchor) parts.push(`monthly_anchor: ${schedule.monthly_anchor}`);
  return parts.join(", ");
}

function scheduleNeedsUpdate(current) {
  if (!current) return true;
  if (current.interval !== DESIRED_PAYOUT_SCHEDULE.interval) return true;
  if (current.weekly_anchor !== DESIRED_PAYOUT_SCHEDULE.weekly_anchor) return true;
  return false;
}

async function updatePayoutSchedule() {
  const current = await getCurrentSettings();

  console.log(`\n=== Stripe Account Policy Configuration (${mode} mode) ===\n`);
  console.log(`Account: ${current.accountId}`);
  console.log(`Country: ${current.country}`);
  console.log(`Charges enabled: ${current.chargesEnabled}`);
  console.log(`Payouts enabled: ${current.payoutsEnabled}`);
  console.log(`\nCurrent payout schedule: ${formatSchedule(current.payoutSchedule)}`);
  console.log(`Desired payout schedule: ${formatSchedule(DESIRED_PAYOUT_SCHEDULE)}`);

  if (showCurrent) {
    printManualSteps();
    return;
  }

  if (!scheduleNeedsUpdate(current.payoutSchedule)) {
    console.log("\nPayout schedule is already configured correctly. No changes needed.");
    printManualSteps();
    return;
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would update payout schedule to:", formatSchedule(DESIRED_PAYOUT_SCHEDULE));
    printManualSteps();
    return;
  }

  console.log("\nUpdating payout schedule...");
  try {
    await stripe.accounts.update(current.accountId, {
      settings: {
        payouts: {
          schedule: DESIRED_PAYOUT_SCHEDULE,
        },
      },
    });
    console.log("Payout schedule updated successfully.");
  } catch (error) {
    // Some account types don't support self-update — guide to Dashboard
    if (error.code === "account_invalid" || error.type === "invalid_request_error") {
      console.log("\nCannot update payout schedule via API for this account type.");
      console.log("Update manually in Stripe Dashboard → Settings → Payouts → Payout schedule.");
      console.log(`Set to: Weekly on ${DESIRED_PAYOUT_SCHEDULE.weekly_anchor}`);
    } else {
      throw error;
    }
  }

  // Verify
  const updated = await getCurrentSettings();
  console.log(`\nVerified payout schedule: ${formatSchedule(updated.payoutSchedule)}`);
  printManualSteps();
}

function printManualSteps() {
  console.log(`
=== Manual Stripe Dashboard Configuration ===

The following settings cannot be configured via the API and must be set
in the Stripe Dashboard (https://dashboard.stripe.com/settings).

1. DISPUTE PREVENTION (Settings → Disputes → Prevention)

   Enable Verifi RDR (Visa) and Ethoca Alerts (Mastercard):
   - These intercept disputes BEFORE they become formal chargebacks
   - They auto-refund the customer, so the dispute never hits your rate
   - Resolved disputes do NOT count toward your dispute rate

   Set the RDR rule: "Resolve ALL disputes" (no amount threshold)
   - At £9.99/month, every dispute costs more to fight (£20-£40 fees)
     than to auto-refund (£9.99)
   - This means: customer disputes → auto-refund → no dispute fee → no
     impact on dispute rate

   Cost: Verifi/Ethoca charge a fee per resolved dispute (typically $0.40-
   $15 depending on plan). Still far cheaper than £20+ dispute fees.

2. DISPUTE HANDLING (if a dispute gets through prevention)

   Do NOT contest disputes. Accept immediately.
   - Contesting costs £20 counter fee (even if you win, you still paid £20
     initial fee)
   - At £9.99 charge value, you lose money even when winning
   - Uncontested disputes resolve faster

   The webhook handler (billingWebhookPost.js) will automatically:
   - Auto-accept the dispute (no-quibble policy — contesting costs more than the charge)
   - Flag the subscription as disputed in DynamoDB
   - Send a Telegram notification with customer details

   The charge.dispute.closed handler sends a follow-up Telegram notification.

3. EARLY FRAUD WARNINGS (Settings → Radar → Reviews)

   Enable automatic refunds for Early Fraud Warnings (EFWs):
   - Visa TC40 and Mastercard SAFE reports arrive ~24-48 hours after charge
   - Auto-refunding on EFW prevents the dispute entirely
   - At £9.99, always refund — the charge is less than the dispute fee

4. PAYOUT SCHEDULE (Settings → Payouts)

   ${mode === "LIVE" ? "✅ Configured via this script (weekly on Wednesday)" : "⚠️  TEST mode — payout schedule is for live mode only"}

   Why weekly Wednesday:
   - Funds held ~2-8 days before reaching your bank
   - Gives EFWs and pre-dispute alerts time to arrive
   - If a refund is needed, funds are still in Stripe balance
   - Avoids negative balance clawbacks from your bank

5. REPEAT OFFENDER BLOCKING (Settings → Radar → Rules)

   Add these Block rules to decline payments from customers with a history
   of disputes or excessive refunds. This is "decline paid services for
   those who seem unhappy to have paid" — politely implemented.

   Stripe Radar tracks dispute and refund counts per card and per email
   across your account. These rules fire at checkout time, BEFORE the
   charge is created.

   Add these rules in order (Stripe evaluates top-to-bottom, first match wins):

   Rule 1 — Block cards that have ever disputed a charge on your account:
     Block if :dispute_count_on_card_number_all_time: > 0

   Rule 2 — Block emails associated with prior fraud activity:
     Block if :total_customers_with_prior_fraud_activity_for_email_yearly: > 0

   Rule 3 — Block cards with 2+ refunds (generous first-refund allowance):
     Block if :refund_count_on_card_all_time: > 1

   Rule 4 — Review (not block) elevated-risk payments for manual check:
     Review if :risk_level: = 'elevated'

   Why this is customer-friendly:
   - First refund is always allowed (Rule 3 threshold is > 1)
   - Disputes auto-accept and refund (no penalty to the customer)
   - But the SAME card/email can't come back and subscribe again
   - Legitimate customers who had a genuine issue can contact you
     to be manually unblocked

   The auto-accept in the webhook handler (billingWebhookPost.js) +
   these Radar rules work together:
   1. Customer disputes → auto-accepted → refunded → Telegram alert
   2. Same customer tries to subscribe again → blocked by Radar rule
   3. Admin reviews Telegram alert and decides if unblock is warranted

   To manually unblock someone: Stripe Dashboard → Radar → Block lists
   → find the email/card → remove from list.

6. CUSTOMER PORTAL (already configured via billingPortalGet.js)

   Customers can self-serve cancel via the Stripe portal.
   Cancellation is "at period end" by default — they keep access until
   their paid period expires. This is the no-quibble experience:
   - Customer cancels → keeps access until period end → no refund needed
   - If they want a refund too → admin issues via Dashboard or stripe:cancel

=== Summary: Customer-First Economics at £9.99/month ===

| Scenario              | Cost to you  | Action           |
|-----------------------|-------------|------------------|
| Customer cancels      | £0          | Self-serve portal |
| EFW / pre-dispute     | £0          | Auto-refund £9.99 |
| Dispute (prevented)   | ~$0.40-$15  | Verifi/Ethoca     |
| Dispute (not prevented)| £20+£9.99  | Accept, don't fight|
| Dispute (contested)   | £40+£9.99   | NEVER do this     |

The optimal strategy is: prevent disputes before they happen (Verifi/Ethoca),
auto-refund on any early warning, and accept any dispute that gets through.
At this price point, fighting disputes is always a net loss.
`);
}

updatePayoutSchedule().catch((err) => {
  console.error("Configuration failed:", err.message);
  process.exit(1);
});
