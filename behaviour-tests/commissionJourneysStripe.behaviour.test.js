// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-55 Run the commission journeys on ci with Stripe test-mode events
// - **Use when:** the commission ledger must be proved against real Stripe test-mode invoices, renewals, refunds, disputes and cancels on ci.
// - **Does:** commissionJourneysStripe.behaviour.test.js runs journeys J1 to J4. Each redeemer pays on a Stripe Test Clock. The test advances the clocks, reads the ledger, and invokes the release at chosen as-of dates.
// - **Run:** `DEPLOYMENT_NAME=<deployment> npm run test:commissionJourneysStripeBehaviour-ci`; `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<deployment> -f behaviour-test-suite=commissionJourneysStripeBehaviour`
// - **Entry:** `behaviour-tests/commissionJourneysStripe.behaviour.test.js`; `behaviour-tests/helpers/commissionCi.js:cleanup`
// - **Files:** behaviour-tests/commissionJourneysStripe.behaviour.test.js, behaviour-tests/helpers/commissionCi.js, app/unit-tests/behaviour-helpers/commissionCi.test.js, playwright.config.js
// - **Keywords:** commission, stripe test clock, ledger, release, as-of, referral, affiliate, ci journeys
// - **Related:** BILL-46, BILL-47, BILL-52
// @end-capability

// Preconditions on ci: the environment deploy of this branch (webhook and email lists), and a deployment
// of the same branch (DEPLOYMENT_NAME), whose application route collects RA's Connect requirements in
// the API. The suite onboards RA's test account itself. The AWS profile or role is submit-ci.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { fillAndSubmitStripeTestCard } from "./steps/behaviour-bundle-steps.js";
import { subscriptionPeriod } from "../app/lib/stripeSubscriptionPeriod.js";
import {
  DAY_MS,
  ENVIRONMENT_NAME,
  LANES,
  LANE_NAMES,
  advanceClock,
  cleanup,
  clockName,
  createClock,
  ensureAffiliateConnectAccount,
  expectedAmountPence,
  getCommissionItem,
  getReferralClaim,
  getTestStripe,
  invokeLambda,
  latestIso,
  openSessions,
  pollUntil,
  queryLines,
  runRelease,
  secondAfter,
  secondBefore,
  sleep,
  waitForLines,
  waitForSubscriptionStatus,
} from "./helpers/commissionCi.js";

const screenshotPath = "target/behaviour-test-results/screenshots/commission-journeys-stripe-behaviour-test";

const baseUrl = process.env.DIY_SUBMIT_BASE_URL;
const deploymentName = process.env.DEPLOYMENT_NAME;
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;

const R1 = "commission-j1-referrer";
const J1A = "commission-j1-redeemer-a";
const J1B = "commission-j1-redeemer-b";
const J1C = "commission-j1-redeemer-c";
const R2 = "commission-j2-family";
const J2A = "commission-j2-redeemer-a";
const J2B = "commission-j2-redeemer-b";
const RA = "commission-affiliate";
const J3A = "commission-j3-redeemer";
const J4A = "commission-j4-redeemer";
const OPERATOR = "commission-operator";

const REDEEMERS = [
  { lane: J1A, referrer: R1 },
  { lane: J1B, referrer: R1 },
  { lane: J1C, referrer: R1 },
  { lane: J2A, referrer: R2 },
  { lane: J2B, referrer: R2 },
  { lane: J3A, referrer: RA },
  { lane: J4A, referrer: RA },
];

test.setTimeout(3_600_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "commissionJourneysStripeBehaviour" });
});

test("J1 to J4: commission lines, holds and releases from real Stripe test-mode events", async ({ page }) => {
  expect(process.env.ENVIRONMENT_NAME ?? ENVIRONMENT_NAME, "this suite runs on ci only").toBe(ENVIRONMENT_NAME);
  expect(baseUrl, "DIY_SUBMIT_BASE_URL").toBeTruthy();
  expect(deploymentName, "DEPLOYMENT_NAME, the ci deployment whose release function runs").toBeTruthy();

  const stripe = await getTestStripe();
  const log = (message) => console.log(`[commission-ci] ${message}`);

  // 1. Start cleanup, then users.
  await test.step("Start cleanup", async () => cleanup({ log }));
  const sessions = await test.step("Ensure and sign in the lanes", async () => openSessions({ baseUrl, lanes: LANE_NAMES }));
  const hashOf = (lane) => sessions[lane].hash;
  const referrerOf = Object.fromEntries(REDEEMERS.map(({ lane, referrer }) => [lane, referrer]));

  async function pay(lane, { testClockId } = {}) {
    const session = sessions[lane];
    const checkoutUrl = await session.startCheckout({ testClockId });
    await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await fillAndSubmitStripeTestCard(page, screenshotPath, { cardNumber: LANES[lane].cardNumber });
    await page.waitForURL(/bundles\.html/, { timeout: 120_000 });
  }

  const lines = async (lane) => queryLines(hashOf(referrerOf[lane]), hashOf(lane));
  const waitLines = (lane, count, predicate = () => true) =>
    waitForLines(
      `${lane} to have ${count} lines`,
      hashOf(referrerOf[lane]),
      hashOf(lane),
      (found) => found.length >= count && predicate(found),
    );
  const only = (found) =>
    found.map(({ state, tier, form, holdReasons, reversalReason }) => ({ state, tier, form, holdReasons, reversalReason }));
  const reasonsOf = (line) => line.holdReasons ?? [];

  const assertAmounts = (found) => {
    for (const line of found) expect(line.amountPence, `${line.invoiceId} amount`).toBe(expectedAmountPence(line));
  };

  // 3. Referrers subscribe, without a clock.
  await test.step("Referrers subscribe", async () => {
    for (const lane of [R1, R2, RA]) {
      await pay(lane);
      await pollUntil(`${lane} resident-vat active`, async () => (await sessions[lane].bundle())?.subscriptionStatus === "active");
    }
  });

  // 4. RA's Connect account, onboarded through the API, then RA's affiliate state.
  await test.step("Onboard RA's Connect account and set RA applied", async () => {
    await ensureAffiliateConnectAccount({ stripe, session: sessions[RA], log });
    await sessions[OPERATOR].apiOk("POST", "/api/v1/affiliate", { referrerHash: hashOf(RA), tier: "casual", state: "applied" });
    const application = await sessions[RA].apiOk("GET", "/api/v1/affiliate/application");
    expect(application?.detailsSubmitted, "RA's Connect details submitted").toBe(true);
  });

  // 5. Passes and 6. redemptions.
  await test.step("Generate and redeem one pass per redeemer", async () => {
    const codes = {};
    for (const { lane, referrer } of REDEEMERS) codes[lane] = await sessions[referrer].generatePass();
    for (const { lane } of REDEEMERS) {
      await sessions[lane].redeemPass(codes[lane]);
      const claim = await getReferralClaim(hashOf(lane));
      expect(claim?.code, `${lane} referral claim`).toBeTruthy();
    }
  });

  // 7. Clocks, with one frozen time so every first charge lands at the same instant.
  await sleep(2000);
  const frozenTimeSeconds = Math.floor(Date.now() / 1000);
  const clocks = {
    j1: await createClock(stripe, { name: clockName(runId, "J1"), frozenTimeSeconds }),
    j2: await createClock(stripe, { name: clockName(runId, "J2"), frozenTimeSeconds }),
    j34: await createClock(stripe, { name: clockName(runId, "J3J4"), frozenTimeSeconds }),
  };
  const clockOf = {
    [J1A]: clocks.j1,
    [J1B]: clocks.j1,
    [J1C]: clocks.j1,
    [J2A]: clocks.j2,
    [J2B]: clocks.j2,
    [J3A]: clocks.j34,
    [J4A]: clocks.j34,
  };

  // 8. First invoices (E1).
  await test.step("First invoices", async () => {
    for (const lane of [J1A, J1B, J1C, J2A, J2B, J3A]) await pay(lane, { testClockId: clockOf[lane].id });

    const j1a = await waitLines(J1A, 1);
    const j1c = await waitLines(J1C, 1);
    expect(only(j1a)).toEqual([{ state: "held", tier: "customer", form: "credit", holdReasons: [], reversalReason: undefined }]);
    expect(only(j1c)[0]).toMatchObject({ state: "held", tier: "customer", form: "credit" });

    const j1b = await waitLines(J1B, 1, (found) => found.some((line) => line.state === "reversed"));
    expect(j1b).toHaveLength(1);
    expect(j1b[0]).toMatchObject({ state: "reversed", reversalReason: "dispute" });

    for (const lane of [J2A, J2B]) {
      const found = await waitLines(lane, 1);
      expect(only(found)[0]).toMatchObject({ state: "held", tier: "family", form: "cash" });
      expect(found[0].amountPence).toBe(found[0].netPence);
    }

    const j3a = await waitLines(J3A, 1);
    expect(only(j3a)[0]).toMatchObject({ state: "held", tier: "customer", form: "credit" });
    assertAmounts([...j1a, ...j1c, ...j3a]);
  });

  // 9. Approve RA, then 10. J4a's first invoice.
  await test.step("Approve RA and pay J4a", async () => {
    await sessions[OPERATOR].apiOk("POST", "/api/v1/affiliate", { referrerHash: hashOf(RA), tier: "casual", state: "approved" });
    await pay(J4A, { testClockId: clocks.j34.id });
    const j4a = await waitLines(J4A, 1);
    expect(only(j4a)[0]).toMatchObject({ state: "held", tier: "casual", form: "cash" });
  });

  const subscriptionOf = async (lane) => (await lines(lane))[0].subscriptionId;

  // 11. Early cancels (E4, E8).
  await test.step("Early cancels", async () => {
    for (const lane of [J1B, J1C]) {
      const subscriptionId = await subscriptionOf(lane);
      await stripe.subscriptions.cancel(subscriptionId);
      await waitForSubscriptionStatus(subscriptionId, "canceled");
    }
    await advanceClock(stripe, clocks.j2.id, frozenTimeSeconds + 10 * 24 * 60 * 60);
    const subscriptionId = await subscriptionOf(J2A);
    await stripe.subscriptions.cancel(subscriptionId);
    await waitForSubscriptionStatus(subscriptionId, "canceled");
  });

  // 12 and 13. Months 2 and 3.
  async function advanceToNextRenewal(clock, lanes, expectedLines) {
    const subscription = await stripe.subscriptions.retrieve(await subscriptionOf(lanes[0]));
    const periodEnd = subscriptionPeriod(subscription).end;
    expect(periodEnd, "subscription period end").toBeTruthy();
    const target = periodEnd + 2 * 60 * 60;
    await advanceClock(stripe, clock.id, target);
    for (const lane of lanes) await waitLines(lane, expectedLines);
    return target;
  }

  let j34Time;
  await test.step("Month 2", async () => {
    await advanceToNextRenewal(clocks.j1, [J1A], 2);
    j34Time = await advanceToNextRenewal(clocks.j34, [J3A, J4A], 2);
    await advanceToNextRenewal(clocks.j2, [J2B], 1);
    // J2b's renewal earns nothing (the family tier pays month 1 only); a line must not appear.
    await sleep(15_000);
    expect(await lines(J2B)).toHaveLength(1);
    assertAmounts([...(await lines(J1A)), ...(await lines(J3A)), ...(await lines(J4A))]);
    expect((await lines(J4A))[1]).toMatchObject({ tier: "casual", form: "cash" });
  });

  await test.step("Month 3", async () => {
    await advanceToNextRenewal(clocks.j1, [J1A], 3);
    j34Time = await advanceToNextRenewal(clocks.j34, [J3A, J4A], 3);
    assertAmounts([...(await lines(J1A)), ...(await lines(J3A)), ...(await lines(J4A))]);
  });

  // 14. Late cancel (E5) at the J3J4 clock time.
  await test.step("Late cancel of J3a", async () => {
    const subscriptionId = await subscriptionOf(J3A);
    await stripe.subscriptions.cancel(subscriptionId);
    const record = await waitForSubscriptionStatus(subscriptionId, "canceled");
    expect(new Date(record.canceledAt).getTime(), "canceledAt is the clock time").toBe(j34Time * 1000);
  });

  // 15. Refund (E2) of J1a's month-3 charge.
  await test.step("Refund J1a month 3", async () => {
    const [, , month3] = await lines(J1A);
    await stripe.refunds.create({ charge: month3.chargeId });
    await waitLines(J1A, 3, (found) => found[2].state === "reversed");
    expect((await lines(J1A))[2]).toMatchObject({ state: "reversed", reversalReason: "refund" });
  });

  // 16. Releases.
  const release = async (asOf) => runRelease(deploymentName, asOf);
  const [j1aM1, j1aM2] = await lines(J1A);
  const j3aLines = await lines(J3A);
  const j4aLines = await lines(J4A);
  const [j2a] = await lines(J2A);
  const [j2b] = await lines(J2B);

  await test.step("Release one second before J1a month 1", async () => {
    await release(secondBefore(j1aM1.releaseAt));
    const [m1] = await lines(J1A);
    expect(m1).toMatchObject({ state: "held" });
    expect(reasonsOf(m1)).toEqual([]);
  });

  await test.step("Release one second after J1a month 1", async () => {
    await release(secondAfter(j1aM1.releaseAt));
    expect((await lines(J1A))[0].state).toBe("payable");
    expect((await lines(J3A))[0].state).toBe("payable");
    const [j1c] = await lines(J1C);
    expect(j1c.state).toBe("held");
    expect(reasonsOf(j1c)).toEqual(expect.arrayContaining(["card_referrer", "card_shared", "early_cancel"]));
  });

  await test.step("Cancel R1's own subscription, then release after J1a month 2", async () => {
    const bundle = await sessions[R1].bundle();
    const referrerSubscriptionId = bundle.stripeSubscriptionId;
    expect(referrerSubscriptionId, "R1 subscription id").toBeTruthy();
    await stripe.subscriptions.cancel(referrerSubscriptionId);
    await pollUntil("R1 bundle canceled", async () => (await sessions[R1].bundle())?.subscriptionStatus === "canceled");

    await release(secondAfter(latestIso(j1aM2.releaseAt, j2a.releaseAt, j2b.releaseAt)));
    const j1a = await lines(J1A);
    expect(j1a[1].state).toBe("held");
    expect(reasonsOf(j1a[1])).toEqual(expect.arrayContaining(["no_subscription"]));
    const [j2aNow] = await lines(J2A);
    expect(j2aNow.state).toBe("held");
    expect(reasonsOf(j2aNow)).toEqual(expect.arrayContaining(["early_cancel", "affiliate_not_approved"]));
    const [j2bNow] = await lines(J2B);
    expect(reasonsOf(j2bNow)).toEqual(expect.arrayContaining(["affiliate_not_approved"]));
    expect((await lines(J3A))[1].state).toBe("payable");
  });

  await test.step("Approve R2 and release again", async () => {
    await sessions[OPERATOR].apiOk("POST", "/api/v1/affiliate", { referrerHash: hashOf(R2), tier: "family", state: "approved" });
    await release(secondAfter(latestIso(j1aM2.releaseAt, j2a.releaseAt, j2b.releaseAt)));
    const [j2bNow] = await lines(J2B);
    expect(j2bNow.state).toBe("payable");
    const [j2aNow] = await lines(J2A);
    expect(j2aNow.state).toBe("held");
    expect(reasonsOf(j2aNow)).toEqual(expect.arrayContaining(["early_cancel"]));
  });

  await test.step("Release one second before J4a month 1", async () => {
    await release(secondBefore(j4aLines[0].releaseAt));
    expect((await lines(J3A))[2].state).toBe("payable");
    for (const line of await lines(J4A)) expect(line.state).toBe("held");
  });

  await test.step("Release one second after J4a month 3", async () => {
    await release(secondAfter(j4aLines[2].releaseAt));
    for (const line of await lines(J4A)) {
      expect(line.state).toBe("payable");
      const pointer = await getCommissionItem("payable#connect", `${hashOf(RA)}#${line.sk}`);
      expect(pointer, `${line.sk} payable#connect pointer`).toBeTruthy();
    }
    expect(j3aLines).toHaveLength(3);
  });

  // 17. Cash payout is off.
  await test.step("Cash payout is off", async () => {
    const result = await invokeLambda(`${deploymentName}-app-commission-cash-payout`, {});
    expect(result).toMatchObject({ status: "off" });
  });

  // 18. End cleanup: a failure here is logged; the next run's start cleanup repeats it.
  await cleanup({ log }).catch((error) => log(`End cleanup failed: ${error.message}`));
});
