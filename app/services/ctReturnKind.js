// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Marks the async request record of a Company Tax Return, so a poll never reads another form's record.
export const CT_RETURN_KIND = "company-tax-return";

// The final status of a Company Tax Return HMRC gave no answer to in the 30 days Submit waits.
export const CT_NO_ANSWER_STATUS_CODE = "NO_ANSWER";
