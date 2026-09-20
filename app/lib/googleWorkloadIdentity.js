// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/googleWorkloadIdentity.js
//
// How the analytics Lambdas reach Google without a key. Google's workload identity federation
// accepts AWS as an external identity provider (infra/google/gcp/identity.toml declares one provider per
// submit account), so a Lambda presents its own execution role's credentials to Google's STS,
// which answers a token that impersonates the analytics service account. Nothing long-lived is
// stored anywhere.
//
// google-auth-library's AwsClient looks for AWS credentials the way an EC2 instance offers them
// (the metadata endpoint); a Lambda offers them as environment variables instead, so the client
// is given a supplier that reads those.
//
// Environment, set by the CDK on each Lambda:
//   GOOGLE_WIF_AUDIENCE         //iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<aws-provider>
//   GA4_SERVICE_ACCOUNT_EMAIL   the service account to impersonate

import { AwsClient, GoogleAuth } from "google-auth-library";

export const AWS_SUBJECT_TOKEN_TYPE = "urn:ietf:params:aws:token-type:aws4_request";
export const GOOGLE_STS_TOKEN_URL = "https://sts.googleapis.com/v1/token";

/**
 * The audience and service account a federated Lambda needs, read from its environment.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ audience: string, serviceAccountEmail: string }}
 */
export function federationSettings(env = process.env) {
  const missing = ["GOOGLE_WIF_AUDIENCE", "GA4_SERVICE_ACCOUNT_EMAIL"].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Federated Google auth needs ${missing.join(" and ")}`);
  }
  return { audience: env.GOOGLE_WIF_AUDIENCE, serviceAccountEmail: env.GA4_SERVICE_ACCOUNT_EMAIL };
}

/**
 * The AwsSecurityCredentialsSupplier google-auth-library calls for the region and the
 * credentials to sign its GetCallerIdentity request with: the Lambda runtime's own environment.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function lambdaAwsSecurityCredentialsSupplier(env = process.env) {
  return {
    async getAwsRegion() {
      const region = env.AWS_REGION || env.AWS_DEFAULT_REGION;
      if (!region) throw new Error("AWS_REGION is not set");
      return region;
    },
    async getAwsSecurityCredentials() {
      const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_SESSION_TOKEN: token } = env;
      if (!accessKeyId || !secretAccessKey) throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set");
      return token ? { accessKeyId, secretAccessKey, token } : { accessKeyId, secretAccessKey };
    },
  };
}

/**
 * The external-account options for one provider audience and the service account it impersonates.
 * Holds no secret; the credential source is the supplier above.
 *
 * @param {{ audience: string, serviceAccountEmail: string }} settings
 */
export function externalAccountOptions({ audience, serviceAccountEmail }) {
  return {
    type: "external_account",
    audience,
    subject_token_type: AWS_SUBJECT_TOKEN_TYPE,
    token_url: GOOGLE_STS_TOKEN_URL,
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
  };
}

/**
 * A GoogleAuth whose client federates through the Lambda's execution role. Pass it as
 * `authClient` to any Google Cloud client library.
 *
 * @param {{ audience: string, serviceAccountEmail: string, scopes: string[] }} settings
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {GoogleAuth}
 */
export function createFederatedGoogleAuth({ audience, serviceAccountEmail, scopes }, env = process.env) {
  const authClient = new AwsClient({
    ...externalAccountOptions({ audience, serviceAccountEmail }),
    scopes,
    aws_security_credentials_supplier: lambdaAwsSecurityCredentialsSupplier(env),
  });
  return new GoogleAuth({ authClient, scopes });
}
