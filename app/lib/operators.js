// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operators.js
// The operator list -- a comma-separated list of email addresses -- grants the operator
// dashboard activity to a logged-in user whose email matches an entry, case-insensitively.
// Sourced from Secrets Manager at {ENVIRONMENT_NAME}/submit/operator-emails, the same
// deterministic-per-environment-name pattern app/services/subHasher.js uses for the user sub
// hash salt; OPERATOR_EMAILS is a raw env var override for local development and tests.

import { createEmailList } from "./emailList.js";

const operatorList = createEmailList({ envVar: "OPERATOR_EMAILS", secretSuffix: "operator-emails", label: "operator emails" });

export const loadOperators = operatorList.load;

// Load the operator list so a later synchronous check (isOperatorEmailLoaded) has it when a
// submission is classified. Callers that cannot wait start it and carry on; the returned promise
// never rejects. A failed load leaves the list unloaded and the next call tries again.
export const warmOperators = operatorList.warm;

// True only when the operator list is already loaded and holds the email; false while it is
// not loaded, so an unwarmed process classifies the account as a customer.
export const isOperatorEmailLoaded = operatorList.isLoadedEmail;

export const isOperatorEmail = operatorList.isEmail;

export function _clearOperatorsCache() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearOperatorsCache can only be used in test environment");
  }
  operatorList.clearCache();
}
