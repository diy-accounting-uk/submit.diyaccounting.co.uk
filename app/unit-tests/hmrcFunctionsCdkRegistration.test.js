// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hmrcFunctionsCdkRegistration.test.js -- every handler under app/functions/hmrc/ is a Lambda
// file (`{feature}{Method}.js`), and SubmitSharedNames.java names it
// `<handlerBaseName>IngestLambdaFunctionName`. That name only reaches AWS when some CDK stack
// passes it to an AsyncApiLambda/SyncApiLambda construct as `ingestFunctionName`. A handler can
// pass every local test (Express server, simulator) while nobody ever wrote that construct, so
// the deployed API is missing the route entirely -- this has happened three times with no test
// catching it. This test parses the stacks package as text and checks that every handler's
// function-name field is referenced by at least one stack, so a new handler with no construct
// fails the build instead of shipping silently.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HANDLERS_DIR = resolve(ROOT, "app/functions/hmrc");
const STACKS_DIR = resolve(ROOT, "infra/main/java/co/uk/diyaccounting/submit/stacks");

// Handlers here are invoked some way other than an API Gateway route built from
// `<handlerBaseName>IngestLambdaFunctionName`, so they have no construct to find by that name.
// Add an entry only with a comment saying how the handler is actually invoked.
const EXEMPT_HANDLERS = new Set([
  // (none yet -- every file in app/functions/hmrc/ is a deployed API Gateway Lambda)
]);

// SubmitSharedNames names a handler's field after something other than its filename. Add an
// entry only with a comment saying why the names differ, so a genuinely unregistered handler
// cannot hide behind this list.
const FIELD_NAME_OVERRIDES = {
  // hmrcReceiptGet.js is registered as receiptGetIngestLambdaFunctionName -- the field predates
  // the hmrc* filename convention and was never renamed.
  hmrcReceiptGet: "receiptGet",
};

function handlerBaseNames() {
  return readdirSync(HANDLERS_DIR)
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.slice(0, -".js".length));
}

function allStacksSourceText() {
  return readdirSync(STACKS_DIR)
    .filter((name) => name.endsWith(".java"))
    .map((name) => readFileSync(resolve(STACKS_DIR, name), "utf8"))
    .join("\n");
}

describe("app/functions/hmrc handlers are registered in the CDK", () => {
  it("has a stack construct referencing every handler's ingest function name", () => {
    const stacksText = allStacksSourceText();

    const offenders = [];
    for (const baseName of handlerBaseNames()) {
      if (EXEMPT_HANDLERS.has(baseName)) continue;
      const registeredName = FIELD_NAME_OVERRIDES[baseName] ?? baseName;
      const fieldName = `${registeredName}IngestLambdaFunctionName`;
      if (!stacksText.includes(fieldName)) {
        offenders.push(
          `${baseName}: no stack references sharedNames().${fieldName} -- the Lambda has a file but no CDK construct`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });
});
