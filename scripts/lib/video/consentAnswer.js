// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/consentAnswer.js
//
// The cookie-consent answer a capture stores before any page loads, so the submit site's banner
// never reaches a frame. A script that records the submit site declines non-essential cookies
// unless it names its own answer. A script with a localApp records another site, whose banner
// and storage keys are its own, so it gets only the answer it names.

export function consentAnswerFor(script) {
  if (script.consentAnswer) return script.consentAnswer;
  return script.localApp ? null : "declined";
}
