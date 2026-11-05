// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/secretRollRetry.test.js
//
// Each reader of a rolled secret reads again after an authentication failure and retries once.
// The fake Secrets Manager moves the clock past the forced-refresh floor on every read, so the
// forced read in each test reaches the secret.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";

const secrets = new Map();
const mockSecretsSend = vi.fn(async (command) => {
  const queue = secrets.get(command.input.SecretId);
  vi.setSystemTime(Date.now() + 11_000);
  return { SecretString: queue.length > 1 ? queue.shift() : queue[0] };
});
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(command) {
      return mockSecretsSend(command);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => ({
  putIntegrationCall: vi.fn().mockResolvedValue(undefined),
}));

const mockSendJson = vi.fn();
const mockSendXml = vi.fn();
vi.mock("@app/services/companiesHouseSend.js", () => ({
  sendJsonToCompaniesHouse: (...args) => mockSendJson(...args),
  sendXmlToCompaniesHouse: (...args) => mockSendXml(...args),
}));

const mockPerformTokenExchange = vi.fn();
vi.mock("@app/lib/httpResponseHelper.js", async (importOriginal) => ({
  ...(await importOriginal()),
  performTokenExchange: (...args) => mockPerformTokenExchange(...args),
}));

const { resetSecretCache } = await import("@app/lib/cachedSecret.js");
const { StripeRecordingHttpClient } = await import("@app/lib/stripeRecordingHttpClient.js");
const { companiesHouseHttpGet } = await import("@app/services/companiesHouseApi.js");
const { exchangeCompaniesHouseToken } = await import("@app/functions/companies-house/companiesHouseTokenPost.js");
const { performHmrcTokenExchange } = await import("@app/functions/hmrc/hmrcTokenPost.js");
const { postToGateway, resolvePresenterCredentials, buildCompanyDataRequest, hashPresenterCredential } =
  await import("@app/services/companiesHouseXmlGateway.js");
const { sendTelegramMessage } = await import("@app/functions/ops/activityTelegramForwarder.js");

function roll(secretId, ...values) {
  secrets.set(secretId, [...values]);
}

function clearSecretEnvironment() {
  for (const name of [
    "COMPANIES_HOUSE_API_KEY",
    "COMPANIES_HOUSE_API_KEY_ARN",
    "COMPANIES_HOUSE_CLIENT_SECRET",
    "COMPANIES_HOUSE_CLIENT_SECRET_ARN",
    "COMPANIES_HOUSE_PRESENTER_ID",
    "COMPANIES_HOUSE_PRESENTER_ID_ARN",
    "COMPANIES_HOUSE_PRESENTER_CODE",
    "COMPANIES_HOUSE_PRESENTER_CODE_ARN",
    "HMRC_CLIENT_SECRET",
    "HMRC_CLIENT_SECRET_ARN",
  ]) {
    delete process.env[name];
  }
}

describe("a secret rolled while a container is warm", () => {
  beforeEach(() => {
    clearSecretEnvironment();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    secrets.clear();
    resetSecretCache();
    mockSecretsSend.mockClear();
    mockSendJson.mockReset();
    mockSendXml.mockReset();
    mockPerformTokenExchange.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSecretEnvironment();
  });

  describe("Companies House API key", () => {
    beforeEach(() => {
      process.env.COMPANIES_HOUSE_BASE_URI = "https://ch.example";
      process.env.COMPANIES_HOUSE_API_KEY_ARN = "arn:ch-key";
    });

    it("retries a 401 once with the new key", async () => {
      roll("arn:ch-key", "old-key", "new-key");
      mockSendJson.mockResolvedValueOnce({ ok: false, status: 401, data: {}, headers: {} });
      mockSendJson.mockResolvedValueOnce({ ok: true, status: 200, data: { a: 1 }, headers: {} });

      const result = await companiesHouseHttpGet("/company/00000006");

      expect(result.status).toBe(200);
      expect(mockSendJson).toHaveBeenCalledTimes(2);
      const auth = (call) => Buffer.from(mockSendJson.mock.calls[call][1].headers.Authorization.replace("Basic ", ""), "base64").toString();
      expect(auth(0)).toBe("old-key:");
      expect(auth(1)).toBe("new-key:");
    });

    it("does not send a second request when the secret is unchanged", async () => {
      roll("arn:ch-key", "same-key");
      mockSendJson.mockResolvedValue({ ok: false, status: 401, data: {}, headers: {} });

      const result = await companiesHouseHttpGet("/company/00000006");

      expect(result.status).toBe(401);
      expect(mockSendJson).toHaveBeenCalledTimes(1);
    });

    it("sends at most two requests when the new key fails too", async () => {
      roll("arn:ch-key", "old-key", "new-key");
      mockSendJson.mockResolvedValue({ ok: false, status: 401, data: {}, headers: {} });

      const result = await companiesHouseHttpGet("/company/00000006");

      expect(result.status).toBe(401);
      expect(mockSendJson).toHaveBeenCalledTimes(2);
    });
  });

  describe("Companies House OAuth client secret", () => {
    it("retries a 401 on the token exchange once with the new secret", async () => {
      process.env.COMPANIES_HOUSE_IDENTITY_BASE_URI = "https://identity.example";
      process.env.COMPANIES_HOUSE_CLIENT_ID = "client";
      process.env.DIY_SUBMIT_BASE_URL = "https://submit.example/";
      process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN = "arn:ch-client";
      roll("arn:ch-client", "old-secret", "new-secret");
      mockSendJson.mockResolvedValueOnce({ ok: false, status: 401, data: {} });
      mockSendJson.mockResolvedValueOnce({ ok: true, status: 200, data: { access_token: "t" } });

      const result = await exchangeCompaniesHouseToken("code");

      expect(result.status).toBe(200);
      const secretSent = (call) => new URLSearchParams(mockSendJson.mock.calls[call][1].body).get("client_secret");
      expect(secretSent(0)).toBe("old-secret");
      expect(secretSent(1)).toBe("new-secret");
      expect(mockSendJson).toHaveBeenCalledTimes(2);
    });
  });

  describe("HMRC client secret", () => {
    beforeEach(() => {
      process.env.HMRC_CLIENT_SECRET_ARN = "arn:hmrc";
    });
    const body = { grant_type: "authorization_code", client_secret: "old-secret", code: "c" };
    const rejected = { response: { ok: false, status: 401 }, responseBody: { error: "invalid_client" } };
    const accepted = { response: { ok: true, status: 200 }, responseBody: {}, accessToken: "a" };

    it("runs an invalid_client rejection once more with the new secret", async () => {
      roll("arn:hmrc", "old-secret", "new-secret");
      await (await import("@app/lib/cachedSecret.js")).readSecret("arn:hmrc");
      mockPerformTokenExchange.mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);

      const result = await performHmrcTokenExchange("https://hmrc.example/oauth/token", body, "audit", "live");

      expect(result).toBe(accepted);
      expect(mockPerformTokenExchange.mock.calls[1][1].client_secret).toBe("new-secret");
    });

    it("does not retry a rejection that is not invalid_client", async () => {
      mockPerformTokenExchange.mockResolvedValueOnce({ response: { ok: false, status: 400 }, responseBody: { error: "invalid_grant" } });

      await performHmrcTokenExchange("https://hmrc.example/oauth/token", body, "audit", "live");

      expect(mockPerformTokenExchange).toHaveBeenCalledTimes(1);
    });

    it("does not retry when the secret is unchanged", async () => {
      roll("arn:hmrc", "old-secret");
      mockPerformTokenExchange.mockResolvedValue(rejected);

      await performHmrcTokenExchange("https://hmrc.example/oauth/token", body, "audit", "live");

      expect(mockPerformTokenExchange).toHaveBeenCalledTimes(1);
    });

    it("does not retry when an environment variable supplies the secret", async () => {
      process.env.HMRC_CLIENT_SECRET = "from-env";
      mockPerformTokenExchange.mockResolvedValue(rejected);

      await performHmrcTokenExchange("https://hmrc.example/oauth/token", body, "audit", "live");

      expect(mockPerformTokenExchange).toHaveBeenCalledTimes(1);
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });
  });

  describe("Stripe secret key", () => {
    class FakeResponse extends Stripe.HttpClientResponse {
      constructor(statusCode, body) {
        super(statusCode, { "request-id": "req_1" });
        this.body = body;
      }
      getRawResponse() {
        return {};
      }
      toJSON() {
        return Promise.resolve(this.body);
      }
    }
    class FakeInnerClient extends Stripe.HttpClient {
      constructor(responses) {
        super();
        this.responses = responses;
        this.authorizations = [];
      }
      getClientName() {
        return "fake";
      }
      async makeRequest(host, port, path, method, headers) {
        this.authorizations.push(headers.Authorization);
        return this.responses.shift();
      }
    }

    it("sends the request again once with the new key after a 401", async () => {
      roll("arn:stripe", "sk_test_old", "sk_test_new");
      const { readSecret, refreshAfterAuthFailure } = await import("@app/lib/cachedSecret.js");
      const used = await readSecret("arn:stripe");
      const inner = new FakeInnerClient([
        new FakeResponse(401, { error: { type: "invalid_request_error", message: "Invalid API Key" } }),
        new FakeResponse(200, { id: "cus_1", object: "customer" }),
      ]);
      const stripe = new Stripe(used, {
        httpClient: new StripeRecordingHttpClient({
          target: "test",
          innerClient: inner,
          refreshKey: (usedKey) => refreshAfterAuthFailure("arn:stripe", usedKey),
        }),
      });

      const customer = await stripe.customers.retrieve("cus_1");

      expect(customer.id).toBe("cus_1");
      expect(inner.authorizations).toEqual(["Bearer sk_test_old", "Bearer sk_test_new"]);
    });

    it("returns the 401 when no refresh hook gives a new key", async () => {
      const inner = new FakeInnerClient([new FakeResponse(401, { error: { type: "invalid_request_error", message: "Invalid API Key" } })]);
      const stripe = new Stripe("sk_test_old", {
        httpClient: new StripeRecordingHttpClient({ target: "test", innerClient: inner, refreshKey: async () => null }),
        maxNetworkRetries: 0,
      });

      await expect(stripe.customers.retrieve("cus_1")).rejects.toMatchObject({ statusCode: 401 });
      expect(inner.authorizations).toHaveLength(1);
    });
  });

  describe("Companies House presenter credentials", () => {
    const authorisationFailure =
      "<GovTalkMessage><Body><ErrorResponse><Error><RaisedBy>Gateway</RaisedBy><Number>502</Number><Type>fatal</Type><Text>Authorisation failure</Text></Error></ErrorResponse></Body></GovTalkMessage>";
    const accepted =
      "<GovTalkMessage><Header><MessageDetails><Qualifier>acknowledgement</Qualifier></MessageDetails></Header></GovTalkMessage>";

    beforeEach(() => {
      process.env.COMPANIES_HOUSE_PRESENTER_ID_ARN = "arn:presenter-id";
      process.env.COMPANIES_HOUSE_PRESENTER_CODE_ARN = "arn:presenter-code";
    });

    it("posts again once with the hashes of the new credentials after a 502", async () => {
      roll("arn:presenter-id", "id-old", "id-new");
      roll("arn:presenter-code", "code-old", "code-new");
      const credentials = await resolvePresenterCredentials();
      const xml = buildCompanyDataRequest({ ...credentials, companyNumber: "00000006", transactionId: "1", gatewayTest: true });
      mockSendXml.mockResolvedValueOnce({ ok: true, status: 200, data: authorisationFailure });
      mockSendXml.mockResolvedValueOnce({ ok: true, status: 200, data: accepted });

      const result = await postToGateway(xml);

      expect(result.data).toBe(accepted);
      const sent = (call) => mockSendXml.mock.calls[call][1].body;
      expect(sent(0)).toContain(hashPresenterCredential("id-old"));
      expect(sent(1)).toContain(hashPresenterCredential("id-new"));
      expect(sent(1)).toContain(hashPresenterCredential("code-new"));
      expect(sent(1)).not.toContain(hashPresenterCredential("id-old"));
    });

    it("never swaps our credentials into an envelope that carries another presenter", async () => {
      roll("arn:presenter-id", "id-old", "id-new");
      roll("arn:presenter-code", "code-old", "code-new");
      await resolvePresenterCredentials();
      const xml = buildCompanyDataRequest({
        presenterId: "someone-elses-id",
        presenterCode: "someone-elses-code",
        companyNumber: "00000006",
        transactionId: "1",
        gatewayTest: true,
      });
      mockSendXml.mockResolvedValue({ ok: true, status: 200, data: authorisationFailure });

      await postToGateway(xml);

      expect(mockSendXml).toHaveBeenCalledTimes(1);
    });

    it("does not post again when both secrets are unchanged", async () => {
      roll("arn:presenter-id", "id-old");
      roll("arn:presenter-code", "code-old");
      const credentials = await resolvePresenterCredentials();
      const xml = buildCompanyDataRequest({ ...credentials, companyNumber: "00000006", transactionId: "1", gatewayTest: true });
      mockSendXml.mockResolvedValue({ ok: true, status: 200, data: authorisationFailure });

      await postToGateway(xml);

      expect(mockSendXml).toHaveBeenCalledTimes(1);
    });
  });

  describe("Telegram bot token", () => {
    it("reads a 401 as the signal that sendTelegramMessage leaves to its caller", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" });
      vi.stubGlobal("fetch", fetchMock);
      try {
        const response = await sendTelegramMessage("old-token", "1", "hello");
        expect(response.status).toBe(401);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
