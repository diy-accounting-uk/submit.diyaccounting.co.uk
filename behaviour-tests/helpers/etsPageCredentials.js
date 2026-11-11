// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/etsPageCredentials.js
//
// The credentials of HMRC's External Test Service (ETS) that the Company Tax Return page asks for:
// the UTR, the Government Gateway user ID (the ETS sender ID) and the password. They come from
// the three GitHub `ci` environment secrets. No step title, log line or attachment may carry them.

export const ETS_VARIABLES = ["HMRC_CT_ETS_SENDER_ID", "HMRC_CT_ETS_PASSWORD", "HMRC_CT_ETS_UTR"];

/**
 * The ETS credentials from the environment, or null when none of the three is set.
 * @param {Record<string, string|undefined>} env
 * @returns {{userId: string, password: string, utr: string} | null}
 */
export function readEtsPageCredentials(env) {
  const present = ETS_VARIABLES.filter((name) => env[name] && env[name].trim() !== "");
  if (present.length === 0) return null;
  const missing = ETS_VARIABLES.filter((name) => !present.includes(name));
  if (missing.length > 0) {
    throw new Error(`The ETS run needs all of ${ETS_VARIABLES.join(", ")}; ${missing.join(", ")} is missing or empty.`);
  }
  const utr = env.HMRC_CT_ETS_UTR.trim();
  if (!/^\d{10}$/.test(utr)) throw new Error("HMRC_CT_ETS_UTR must be 10 digits.");
  return { userId: env.HMRC_CT_ETS_SENDER_ID.trim(), password: env.HMRC_CT_ETS_PASSWORD, utr };
}
