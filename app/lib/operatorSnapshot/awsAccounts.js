// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/awsAccounts.js

// The AWS accounts of the organisation, by the name the estate gives each, keyed as v_cost_daily's
// sub_account_id carries them.
export const AWS_ACCOUNT_NAMES_BY_ID = {
  "972912397388": "submit-prod",
  "367191799875": "submit-ci",
  "064390746177": "spreadsheets",
  "887764105431": "management",
  "914216784828": "backup",
  "283165661847": "gateway",
};
export const AWS_ACCOUNT_IDS_BY_NAME = Object.fromEntries(Object.entries(AWS_ACCOUNT_NAMES_BY_ID).map(([id, name]) => [name, id]));
