// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/stripeRecordingHttpClient.js
// The HTTP client of the Stripe SDK. It sends each request through an inner client and writes one
// outbound call record for each HTTP attempt, so a retry the SDK makes leaves one record each.
// The SDK calls getClientName and makeRequest only, so the class needs no base class. The inner
// client is created on first use.

import Stripe from "stripe";
import { recordIntegrationCall } from "./integrationCalls.js";
import { stripePathTemplate } from "./dataMasking.js";

const STRIPE_TIMEOUT_ERROR_CODE = "ETIMEDOUT";
const ERROR_STATUS = 400;

/**
 * The target field of a record, from the mode of the secret key.
 * @param {string} secretKey
 * @returns {"live"|"test"}
 */
export function stripeCallTarget(secretKey) {
  return /^(sk|rk)_test_/.test(String(secretKey)) ? "test" : "live";
}

// The SDK reads the body once. This wrapper reads an error body for the record and hands the
// SDK the same parsed body.
async function withReadableErrorBody(response) {
  let body;
  let bodyPromise;
  try {
    bodyPromise = Promise.resolve(response.toJSON());
    body = await bodyPromise;
  } catch {
    body = undefined;
  }
  const wrapped = Object.create(response);
  wrapped.toJSON = () => bodyPromise;
  return { wrapped, body };
}

export class StripeRecordingHttpClient {
  /**
   * @param {Object} options
   * @param {"live"|"test"} options.target
   * @param {Object} [options.innerClient] - The client that sends, by default the SDK's Node client
   */
  constructor({ target, innerClient }) {
    this.target = target;
    this.configuredInnerClient = innerClient;
  }

  get innerClient() {
    this.configuredInnerClient ??= Stripe.createNodeHttpClient();
    return this.configuredInnerClient;
  }

  getClientName() {
    return this.innerClient.getClientName();
  }

  async makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
    const authority = port ? `${host}:${port}` : host;
    const url = `${protocol}://${authority}${path}`;
    const attempt = {
      org: "stripe",
      target: this.target,
      api: `${method} ${stripePathTemplate(new URL(url).pathname)}`,
      url,
      method,
      startedAt: new Date(),
      requestHeaders: headers,
      requestBody: requestData,
    };
    let response;
    try {
      response = await this.innerClient.makeRequest(host, port, path, method, headers, requestData, protocol, timeout);
    } catch (error) {
      await recordIntegrationCall({
        ...attempt,
        durationMs: Date.now() - attempt.startedAt.getTime(),
        outcome: error?.code === STRIPE_TIMEOUT_ERROR_CODE ? "timeout" : "network-error",
      });
      throw error;
    }
    const durationMs = Date.now() - attempt.startedAt.getTime();
    const status = response.getStatusCode();
    const { wrapped, body } = status >= ERROR_STATUS ? await withReadableErrorBody(response) : { wrapped: response, body: undefined };
    await recordIntegrationCall({
      ...attempt,
      durationMs,
      outcome: "response",
      status,
      responseHeaders: response.getHeaders(),
      responseBody: body,
    });
    return wrapped;
  }
}
