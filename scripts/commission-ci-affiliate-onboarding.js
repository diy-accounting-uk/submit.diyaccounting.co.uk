#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-56 Start the ci commission affiliate's Stripe Connect onboarding
// - **Use when:** the commission journeys on ci report that the affiliate lane has no finished Stripe Connect onboarding.
// - **Does:** commission-ci-affiliate-onboarding.js ensures the commission-affiliate lane and signs it in. It calls the affiliate application route and prints the Stripe onboarding link. Finish the link once with Stripe's test values.
// - **Run:** `AWS_PROFILE=diya-submit-ci DIY_SUBMIT_BASE_URL=https://ci-submit.diyaccounting.co.uk/ node scripts/commission-ci-affiliate-onboarding.js`
// - **Entry:** `scripts/commission-ci-affiliate-onboarding.js:main`
// - **Files:** scripts/commission-ci-affiliate-onboarding.js, scripts/commission-ci-clock-spike.js, behaviour-tests/helpers/commissionCi.js
// - **Keywords:** affiliate, stripe connect, onboarding, commission, ci, test mode
// - **Related:** BILL-52, BILL-53, BILL-55
// @end-capability

import { fileURLToPath } from "node:url";
import { openSessions } from "../behaviour-tests/helpers/commissionCi.js";

const LANE = "commission-affiliate";

export async function main() {
  const baseUrl = process.env.DIY_SUBMIT_BASE_URL;
  if (!baseUrl) throw new Error("DIY_SUBMIT_BASE_URL is not set");
  const { [LANE]: session } = await openSessions({ baseUrl, lanes: [LANE] });

  const before = await session.apiOk("GET", "/api/v1/affiliate/application");
  console.log(`Application state: ${before?.state ?? "none"}, details submitted: ${before?.detailsSubmitted === true}`);
  if (before?.detailsSubmitted === true) {
    console.log("Onboarding is finished. Nothing to do.");
    return;
  }

  const started = await session.apiOk("POST", "/api/v1/affiliate/application");
  console.log(`Open this link and finish the Express onboarding with Stripe's test-mode values:\n${started.url}`);
  console.log("Then run this script again: it prints 'Onboarding is finished' when the account is ready.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
