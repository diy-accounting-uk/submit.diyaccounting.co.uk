// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/journey.js
//
// What a logged-in scene script needs standing up before the first frame: the local services for
// the simulator and proxy variants, the HMRC sandbox test user whose VAT registration number gets
// typed into the form on camera, and the on-screen mask over the one-time code field.
//
// The identity provider is never named by the scene script. It comes from TEST_AUTH_PROVIDER,
// exactly as it does for the behaviour tests, so the same script proves locally against the
// simulator and records against a deployment through the Cognito Hosted UI.

import {
  createHmrcTestUser,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./behaviourSteps.js";

// Cognito's one-time code field, by every name its Hosted UI gives it. Masked on camera so a
// recording never shows a code being typed, while the rest of the sign-in stays on screen.
const ONE_TIME_CODE_FIELDS = 'input[name="totpCode"], input[name="SOFTWARE_TOKEN_MFA_CODE"], input[name="code"]';

export function authProviderFrom(env) {
  const provider = env.TEST_AUTH_PROVIDER;
  if (!provider) {
    throw new Error("a scene script with auth \"user\" needs TEST_AUTH_PROVIDER (mock, simulator or cognito-native)");
  }
  return provider;
}

export function authUsernameFrom(env) {
  const username = env.TEST_AUTH_USERNAME;
  if (!username) {
    throw new Error("a scene script with auth \"user\" needs TEST_AUTH_USERNAME");
  }
  return username;
}

// The simulator and proxy variants run the site, its data store and its upstreams in this
// process, the same way the behaviour tests' beforeAll does. Deployed environments set
// TEST_SERVER_HTTP=off and get nothing.
export async function startLocalServices(env) {
  if (env.TEST_SERVER_HTTP !== "run") return { stop: async () => {} };

  console.log("Starting local services for this capture (dynamodb, upstreams, site)...");
  const dynamo = await runLocalDynamoDb(
    env.TEST_DYNAMODB,
    env.BUNDLE_DYNAMODB_TABLE_NAME,
    env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME,
    env.RECEIPTS_DYNAMODB_TABLE_NAME,
  );
  const auth = await runLocalOAuth2Server(env.TEST_MOCK_OAUTH2);
  const server = await runLocalHttpServer(env.TEST_SERVER_HTTP, env.TEST_SERVER_HTTP_PORT);

  return {
    stop: async () => {
      server?.kill?.();
      auth?.kill?.();
      await dynamo?.stop?.();
    },
  };
}

// TEST_HMRC_USERNAME and friends win when they are set; otherwise a sandbox run mints a fresh
// test user with a VAT enrolment. The VAT registration number comes back for the script to type.
export async function resolveHmrcTestUser(env) {
  if (env.TEST_HMRC_USERNAME) {
    return {
      username: env.TEST_HMRC_USERNAME,
      password: env.TEST_HMRC_PASSWORD,
      vatNumber: env.TEST_HMRC_VAT_NUMBER,
    };
  }

  if (env.HMRC_ACCOUNT !== "sandbox") {
    throw new Error(
      "a scene script with an hmrcAuthorise step needs TEST_HMRC_USERNAME, TEST_HMRC_PASSWORD and TEST_HMRC_VAT_NUMBER, " +
        "or HMRC_ACCOUNT=sandbox so the run can mint a test user",
    );
  }

  const clientId = env.HMRC_SANDBOX_CLIENT_ID || env.HMRC_CLIENT_ID;
  const clientSecret = env.HMRC_SANDBOX_CLIENT_SECRET || env.HMRC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("minting an HMRC sandbox test user needs HMRC_SANDBOX_CLIENT_ID and HMRC_SANDBOX_CLIENT_SECRET");
  }

  console.log("Minting an HMRC sandbox test user with a VAT enrolment...");
  const testUser = await createHmrcTestUser(clientId, clientSecret, { serviceNames: ["mtd-vat"] });
  console.log(`HMRC sandbox test user ready, VAT registration number ${testUser.vrn}`);
  return { username: testUser.userId, password: testUser.password, vatNumber: testUser.vrn };
}

export async function installCredentialFieldMask(page) {
  await page.addInitScript(
    ({ selectors }) => {
      const apply = () => {
        for (const field of document.querySelectorAll(selectors)) {
          field.style.setProperty("-webkit-text-security", "disc");
          field.style.setProperty("text-security", "disc");
          field.style.setProperty("color", "transparent");
          field.style.setProperty("text-shadow", "0 0 10px rgba(0,0,0,0.85)");
        }
      };
      document.addEventListener("DOMContentLoaded", apply);
      new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
    },
    { selectors: ONE_TIME_CODE_FIELDS },
  );
}
