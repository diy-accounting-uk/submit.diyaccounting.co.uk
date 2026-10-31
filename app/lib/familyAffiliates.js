// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/familyAffiliates.js
// The family affiliate list -- a comma-separated list of email addresses -- names the accounts whose
// referrals earn the family tier. Sourced from Secrets Manager at
// {ENVIRONMENT_NAME}/submit/family-affiliate-emails; FAMILY_AFFILIATE_EMAILS is a raw env var
// override for local development and tests. An environment without the secret has an empty list.

import { createEmailList } from "./emailList.js";

const familyList = createEmailList({
  envVar: "FAMILY_AFFILIATE_EMAILS",
  secretSuffix: "family-affiliate-emails",
  label: "family affiliate emails",
  emptyWhenSecretMissing: true,
});

export const loadFamilyAffiliateEmails = familyList.load;
export const isFamilyAffiliateEmail = familyList.isEmail;

export function _clearFamilyAffiliatesCache() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearFamilyAffiliatesCache can only be used in test environment");
  }
  familyList.clearCache();
}
