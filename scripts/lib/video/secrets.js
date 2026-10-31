// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-92 Redact secrets from video artefacts
// - **Use when:** a recorded logged-in scene may have typed real credentials into captions, transcript or overlay logs.
// - **Does:** secrets.js scans every text artefact a recording produces, including captions, the .vtt file, transcript, timeline and overlay event log, for the real credentials a logged-in scene typed. A hit is a hard failure, not a post-hoc redaction, so none of it reaches the shipped video.
// - **Run:** no command; see Does and Entry
// - **Entry:** `scripts/lib/video/secrets.js`
// - **Files:** scripts/lib/video/secrets.js, app/unit-tests/video/secrets.test.js
// - **Keywords:** secret scan, video artefacts, credential leak, hard failure, captions, transcript
// - **Related:** OPS-88, OPS-90
// @end-capability

// scripts/lib/video/secrets.js
//
// A logged-in scene script types real credentials into a real browser. Those values must never
// reach anything the video ships with — the captions, the .vtt, the transcript, the timeline or
// the overlay event log — so every text artefact is scanned before it is written and a hit is a
// hard failure rather than a redaction after the fact.
//
// Pure functions, no fs and no process.env read of its own: the caller passes the environment in.

// Every environment variable a logged-in capture can be handed that must not appear in output.
// The HMRC test user's password is added at run time when the run mints one.
export const SECRET_ENV_KEYS = [
  "TEST_AUTH_PASSWORD",
  "TEST_AUTH_TOTP_SECRET",
  "TEST_HMRC_PASSWORD",
  "HMRC_CLIENT_SECRET",
  "HMRC_SANDBOX_CLIENT_SECRET",
  "COGNITO_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
];

// Values shorter than this are skipped: a four-character password would match half the English
// in a transcript and turn every run into a false failure.
const MIN_SCANNABLE_LENGTH = 6;

export function collectSecrets(env, extraValues = []) {
  const candidates = [...SECRET_ENV_KEYS.map((key) => env[key]), ...extraValues];
  const kept = candidates.filter((value) => typeof value === "string" && value.trim().length >= MIN_SCANNABLE_LENGTH);
  return [...new Set(kept.map((value) => value.trim()))];
}

export function findSecrets(text, secrets) {
  if (typeof text !== "string") return [];
  return secrets.filter((secret) => text.includes(secret));
}

export function redact(text, secrets) {
  let out = String(text);
  for (const secret of secrets) {
    out = out.split(secret).join("***");
  }
  return out;
}

// Throws naming the artefact when a secret survived into it. The message never quotes the value
// it found — that would put the secret in the console and the CI log instead.
export function assertNoSecrets(label, text, secrets) {
  const hits = findSecrets(text, secrets);
  if (hits.length > 0) {
    throw new Error(`${label} contains ${hits.length} credential value(s) that must never be published`);
  }
}
