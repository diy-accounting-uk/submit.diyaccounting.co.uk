// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/hmrcTransactionEngineSimulator.system.test.js
// System tests driving a complete Company Tax Return through the HTTP simulator's Transaction
// Engine over HTTP, with the request built from a book fixture by the same code the Lambdas use.
// No network.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startSimulator } from "../http-simulator/index.js";
import { buildCtReturnBodyFromBook } from "../test-helpers/ctReturnFixture.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments } from "../services/hmrcCtReturnRequest.js";
import {
  buildCt600SubmissionRequest,
  buildPollRequest,
  buildDeleteRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
} from "../services/hmrcTransactionEngine.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let simulator;
let submissionUrl;
let signed;

async function send(url, xml, headers = {}) {
  const result = await postToTransactionEngine(url, xml, headers);
  expect(result.status).toBe(200);
  return parseTransactionEngineResponse(result.data);
}

async function submit(headers = {}) {
  const acknowledgement = await send(submissionUrl, signed.xml, headers);
  expect(acknowledgement.qualifier).toBe("acknowledgement");
  return { acknowledgement, pollUrl: new URL(acknowledgement.responseEndPoint, submissionUrl).href };
}

describe("System: HMRC Transaction Engine simulator", () => {
  beforeAll(async () => {
    simulator = await startSimulator({ port: 0 });
    submissionUrl = `${simulator.baseUrl}/hmrc-transaction-engine/submission`;
    const errors = [];
    const request = extractAndValidateCtReturnParameters(
      { body: JSON.stringify({ ...(await buildCtReturnBodyFromBook()), gatewayUserId: "user", gatewayPassword: "pass" }) },
      errors,
      { requireReviewedBoxes: false },
    );
    expect(errors).toEqual([]);
    signed = buildCt600SubmissionRequest({
      senderId: request.gatewayUserId,
      password: request.gatewayPassword,
      utr: request.utr,
      vendorId: "1000",
      productName: "DIY Accounting Submit",
      productVersion: "1.0",
      irEnvelopeXml: buildCtReturnDocuments(request).irEnvelopeXml,
      gatewayTest: true,
    });
  });

  afterAll(async () => {
    if (simulator) await simulator.stop();
  });

  it("acknowledges the submission, answers pending once, then the IRmark receipt, and deletes it", async () => {
    const { acknowledgement, pollUrl } = await submit();
    expect(acknowledgement.pollIntervalSeconds).toBeGreaterThan(0);
    const poll = buildPollRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true });

    const pending = await send(pollUrl, poll);
    expect(pending.qualifier).toBe("acknowledgement");

    const accepted = await send(pollUrl, poll);
    expect(accepted.qualifier).toBe("response");
    expect(accepted.irmarkReceipt).toBe(signed.irmark.base64);
    expect(accepted.successMessage).toContain(signed.irmark.base32);

    const deleted = await send(pollUrl, buildDeleteRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true }));
    expect(deleted).toMatchObject({ qualifier: "response", messageFunction: "delete" });
    expect((await send(pollUrl, poll)).qualifier).toBe("error");
  });

  it("answers error 2021 after the pending poll when the submission names the reject scenario", async () => {
    const { acknowledgement, pollUrl } = await submit({ "Gov-Test-Scenario": "CT600_REJECT_IRMARK" });
    const poll = buildPollRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true });
    expect((await send(pollUrl, poll)).qualifier).toBe("acknowledgement");
    const rejected = await send(pollUrl, poll);
    expect(rejected.qualifier).toBe("error");
    expect(rejected.businessErrors[0]).toMatchObject({ number: "2021" });
  });

  it("answers a fatal error for a poll of a correlation id it never issued", async () => {
    const response = await send(
      `${simulator.baseUrl}/hmrc-transaction-engine/poll`,
      buildPollRequest({ correlationId: "00000000000000000000000000000000", gatewayTest: true }),
    );
    expect(response.qualifier).toBe("error");
    expect(response.errors[0].type).toBe("fatal");
  });
});
