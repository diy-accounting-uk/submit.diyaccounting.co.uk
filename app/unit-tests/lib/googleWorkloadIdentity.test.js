// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { AwsClient } from "google-auth-library";
import {
  ga4AuthMode,
  federationSettings,
  lambdaAwsSecurityCredentialsSupplier,
  externalAccountOptions,
  createFederatedGoogleAuth,
  AWS_SUBJECT_TOKEN_TYPE,
} from "../../lib/googleWorkloadIdentity.js";

const AUDIENCE = "//iam.googleapis.com/projects/670010122633/locations/global/workloadIdentityPools/submit-federation/providers/aws-prod";
const EMAIL = "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com";

describe("ga4AuthMode", () => {
  test("defaults to the key", () => {
    expect(ga4AuthMode({})).toBe("key");
  });
  test("reads federated", () => {
    expect(ga4AuthMode({ GA4_AUTH_MODE: "federated" })).toBe("federated");
  });
  test("refuses any other value", () => {
    expect(() => ga4AuthMode({ GA4_AUTH_MODE: "both" })).toThrow(/GA4_AUTH_MODE must be one of key, federated/);
  });
});

describe("federationSettings", () => {
  test("reads the audience and the service account", () => {
    expect(federationSettings({ GOOGLE_WIF_AUDIENCE: AUDIENCE, GA4_SERVICE_ACCOUNT_EMAIL: EMAIL })).toEqual({
      audience: AUDIENCE,
      serviceAccountEmail: EMAIL,
    });
  });
  test("names every missing variable", () => {
    expect(() => federationSettings({})).toThrow(/needs GOOGLE_WIF_AUDIENCE and GA4_SERVICE_ACCOUNT_EMAIL/);
    expect(() => federationSettings({ GOOGLE_WIF_AUDIENCE: AUDIENCE })).toThrow(/needs GA4_SERVICE_ACCOUNT_EMAIL/);
  });
});

describe("lambdaAwsSecurityCredentialsSupplier", () => {
  const env = {
    AWS_REGION: "eu-west-2",
    AWS_ACCESS_KEY_ID: "ASIAEXAMPLE",
    AWS_SECRET_ACCESS_KEY: "secret",
    AWS_SESSION_TOKEN: "session",
  };
  test("answers the Lambda runtime's region and session credentials", async () => {
    const supplier = lambdaAwsSecurityCredentialsSupplier(env);
    await expect(supplier.getAwsRegion({})).resolves.toBe("eu-west-2");
    await expect(supplier.getAwsSecurityCredentials({})).resolves.toEqual({
      accessKeyId: "ASIAEXAMPLE",
      secretAccessKey: "secret",
      token: "session",
    });
  });
  test("leaves the token out when the credentials are not a session", async () => {
    const supplier = lambdaAwsSecurityCredentialsSupplier({ ...env, AWS_SESSION_TOKEN: undefined });
    await expect(supplier.getAwsSecurityCredentials({})).resolves.toEqual({ accessKeyId: "ASIAEXAMPLE", secretAccessKey: "secret" });
  });
  test("throws when the runtime environment is incomplete", async () => {
    await expect(lambdaAwsSecurityCredentialsSupplier({}).getAwsRegion({})).rejects.toThrow(/AWS_REGION/);
    await expect(lambdaAwsSecurityCredentialsSupplier({ AWS_REGION: "eu-west-2" }).getAwsSecurityCredentials({})).rejects.toThrow(
      /AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY/,
    );
  });
});

describe("externalAccountOptions", () => {
  test("points at Google's STS and impersonates the service account, with no secret", () => {
    const options = externalAccountOptions({ audience: AUDIENCE, serviceAccountEmail: EMAIL });
    expect(options).toEqual({
      type: "external_account",
      audience: AUDIENCE,
      subject_token_type: AWS_SUBJECT_TOKEN_TYPE,
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${EMAIL}:generateAccessToken`,
    });
    expect(JSON.stringify(options)).not.toMatch(/private_key|client_secret|credential_source/);
  });
});

describe("createFederatedGoogleAuth", () => {
  test("builds a GoogleAuth over an AwsClient that uses the Lambda supplier", async () => {
    const auth = createFederatedGoogleAuth(
      { audience: AUDIENCE, serviceAccountEmail: EMAIL, scopes: ["https://www.googleapis.com/auth/cloud-platform"] },
      { AWS_REGION: "eu-west-2", AWS_ACCESS_KEY_ID: "ASIAEXAMPLE", AWS_SECRET_ACCESS_KEY: "secret", AWS_SESSION_TOKEN: "session" },
    );
    const client = await auth.getClient();
    expect(client).toBeInstanceOf(AwsClient);
    expect(client.credentialSourceType).toBe("programmatic");
    expect(client.audience).toBe(AUDIENCE);
    expect(client.scopes).toEqual(["https://www.googleapis.com/auth/cloud-platform"]);
  });
});
