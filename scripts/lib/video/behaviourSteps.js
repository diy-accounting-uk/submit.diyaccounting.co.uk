// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/behaviourSteps.js
//
// The one bridge between the video capture and the behaviour tests' step functions. A logged-in
// scene script drives the same login, consent, bundle and HMRC authorise code the behaviour
// tests drive, so a markup change is fixed once and both follow.
//
// Two things stand between plain `node` and those modules, and both are handled here before they
// load:
//
//   1. They resolve "@app/*", an alias vitest and jsconfig.json define and node does not.
//      appAliasHook.js maps it onto the app directory.
//   2. Every step wraps its body in `test.step`, which throws outside a Playwright test run.
//      The replacement below announces the step on the console and runs the body, which is what
//      a capture wants from it anyway.
//
// Both are process-wide, so this module must be imported before anything else reaches for a
// behaviour step function.

import { register } from "node:module";
import { test } from "@playwright/test";

register("./appAliasHook.js", import.meta.url);

test.step = async (title, body) => {
  console.log(`    · ${title}`);
  return body();
};

const loginSteps = await import("../../../behaviour-tests/steps/behaviour-login-steps.js");
const siteSteps = await import("../../../behaviour-tests/steps/behaviour-steps.js");
const bundleSteps = await import("../../../behaviour-tests/steps/behaviour-bundle-steps.js");
const hmrcSteps = await import("../../../behaviour-tests/steps/behaviour-hmrc-steps.js");
const vatSteps = await import("../../../behaviour-tests/steps/behaviour-hmrc-vat-steps.js");
const helpers = await import("../../../behaviour-tests/helpers/behaviour-helpers.js");

export const { loginWithCognitoOrMockAuth, verifyLoggedInStatus } = loginSteps;
export const { consentToDataCollection } = siteSteps;
export const { ensureBundlePresent } = bundleSteps;
export const { acceptCookiesHmrc, goToHmrcAuth, initHmrcAuth, fillInHmrcAuth, submitHmrcAuth, grantPermissionHmrcAuth } = hmrcSteps;
export const { clickObligationSubmitReturn, fillInVat9Box, submitFormVat, completeVat, verifyVatSubmission } = vatSteps;
export const { addOnPageLogging, createHmrcTestUser, isSandboxMode, runLocalDynamoDb, runLocalHttpServer, runLocalOAuth2Server } = helpers;
