// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/companiesHouseXmlGateway.js
// Placeholder pending the GovTalk envelope builder for the Companies House XML Gateway. Every
// Lambda that calls these exports mocks this module in its unit tests, so this stub only needs to
// exist so those imports resolve; it must be replaced by the real envelope builder before this
// filing works.

export function hashPresenterCredential() {
  throw new Error("hashPresenterCredential is not implemented yet");
}

export function buildAccountsSubmission() {
  throw new Error("buildAccountsSubmission is not implemented yet");
}

export function buildStatusRequest() {
  throw new Error("buildStatusRequest is not implemented yet");
}

export function parseGatewayResponse() {
  throw new Error("parseGatewayResponse is not implemented yet");
}

export function allocateSubmissionNumber() {
  throw new Error("allocateSubmissionNumber is not implemented yet");
}

export async function postToGateway() {
  throw new Error("postToGateway is not implemented yet");
}

export async function resolvePresenterCredentials() {
  throw new Error("resolvePresenterCredentials is not implemented yet");
}
