// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/gitHubHelpers.js
//
// Shared helpers for creating GitHub issues and comments from automated
// processes. All issue and comment bodies created by automated pipelines
// must include a disclosure footer via appendAutomationDisclosure().

/**
 * Append a disclosure footer to a GitHub issue or comment body.
 * Identifies the body as automatically generated, not written by a person.
 * Call this on every issue body and comment body created by an automated process.
 */
export function appendAutomationDisclosure(bodyText) {
  return `${bodyText}

---
*Raised automatically by an automated pipeline.*`;
}
