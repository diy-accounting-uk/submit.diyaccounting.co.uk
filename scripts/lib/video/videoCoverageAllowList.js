// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/videoCoverageAllowList.js
//
// Activities app/unit-tests/video/videoCoverage.test.js otherwise requires a scene script for,
// that cannot be filmed as a page of their own — each with the reason, so a new gap in the
// catalogue fails loudly instead of silently joining this list. Add an entry here only when
// filming truly needs a different page or a different repository; a token cost, a subscription
// gate or a slow filing flow is not a reason on its own.

export const VIDEO_COVERAGE_ALLOW_LIST = {
  "operator-dashboard": 'operator-only internal tool (bundle "operator"), never shown to a customer',
  "diya-gl-storage": "no page in this site — the UI that calls this storage API lives in the spreadsheets repository's diya-gl app",
  "file-psc-verification-statement":
    "no page of its own — its PSC data is shown inside file-confirmation-statement's scene script, on the same page",
};
