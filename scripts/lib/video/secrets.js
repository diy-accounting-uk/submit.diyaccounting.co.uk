// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
