// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/browserLocale.js
//
// Chromium formats an <input type="date"> from the locale of its own process, read from LANG and
// LANGUAGE, and ignores the browser context's locale and the --lang switch for it. A capture on a
// host set to en_US (or to C) would show 11/18/2026. The browser process gets British English, so
// every recording shows 18/11/2026 whatever the host's locale.

export const CAPTURE_BROWSER_LOCALE = { LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" };

/** The environment for the capture's browser process: the host's, with a British English locale. */
export function captureBrowserEnv(env) {
  return { ...env, ...CAPTURE_BROWSER_LOCALE };
}
