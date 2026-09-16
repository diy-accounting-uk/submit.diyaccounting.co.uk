// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  parseArgs,
  parseConfig,
  planIdentity,
  providerBody,
  providerDiff,
  principalSetMember,
  providerAudience,
  awsCredentialConfig,
  credentialConfigPath,
  writeCredentialConfigs,
  WORKLOAD_IDENTITY_USER_ROLE,
  forbiddenReason,
  disabledApiName,
  planWhenApiDisabled,
  poolName,
  providerName,
  loadConfigFromRoot,
} from "../../../scripts/gcp-identity-sync.js";

const SAMPLE_TOML = `
[project]
id = "diyaccounting-ga4"
number = "958354756046"

[service_account]
email = "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com"

  [service_account.key_rotation]
  max_age_days = 90
  secrets = ["ci/submit/ga4/service_account", "prod/submit/ga4/service_account"]

[workload_identity_pool]
id = "submit-federation"
display_name = "GitHub Actions + submit Lambdas"

  [[workload_identity_pool.provider]]
  id = "github"
  display_name = "GitHub Actions"
  type = "oidc"
  issuer_uri = "https://token.actions.githubusercontent.com"
  attribute_condition = 'assertion.repository == "diy-accounting-uk/submit.diyaccounting.co.uk"'
  principal_set = "attribute.repository/diy-accounting-uk/submit.diyaccounting.co.uk"

    [workload_identity_pool.provider.attribute_mapping]
    "google.subject" = "assertion.sub"
    "attribute.repository" = "assertion.repository"

  [[workload_identity_pool.provider]]
  id = "aws-prod"
  type = "aws"
  account_id = "972912397388"
  github_environment = "prod"
  attribute_condition = 'attribute.aws_role.contains("Ga4ReportPullFn")'
  principal_set = "attribute.account/972912397388"

    [workload_identity_pool.provider.attribute_mapping]
    "google.subject" = "assertion.arn.extract('assumed-role/{role}/')"
    "attribute.account" = "assertion.account"
    "attribute.aws_role" = "assertion.arn.extract('assumed-role/{role}/')"
`;

const POOL = "projects/958354756046/locations/global/workloadIdentityPools/submit-federation";

function liveMatching(config) {
  const providers = {};
  for (const provider of config.providers) providers[provider.id] = { ...providerBody(provider), state: "ACTIVE" };
  return {
    pool: { displayName: config.pool.displayName, state: "ACTIVE" },
    providers,
    policy: {
      bindings: [
        {
          role: WORKLOAD_IDENTITY_USER_ROLE,
          members: config.providers.map((p) => principalSetMember("958354756046", "submit-federation", p.principalSet)),
        },
      ],
    },
  };
}

describe("gcp-identity-sync parseArgs", () => {
  it("defaults to plan mode without writing credential configs", () => {
    expect(parseArgs([])).toEqual({ apply: false, writeCredConfigs: false });
  });
  it("reads --apply and --write-cred-configs", () => {
    expect(parseArgs(["--apply", "--write-cred-configs"])).toEqual({ apply: true, writeCredConfigs: true });
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("gcp-identity-sync parseConfig", () => {
  it("reads the project, service account, pool and providers", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(config.project).toEqual({ id: "diyaccounting-ga4", number: "958354756046" });
    expect(config.serviceAccount.email).toBe("ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com");
    expect(config.pool).toEqual({ id: "submit-federation", displayName: "GitHub Actions + submit Lambdas" });
    expect(config.providers.map((p) => [p.id, p.type])).toEqual([
      ["github", "oidc"],
      ["aws-prod", "aws"],
    ]);
    expect(config.providers[1].attributeMapping["attribute.aws_role"]).toBe("assertion.arn.extract('assumed-role/{role}/')");
    expect(config.providers[1].githubEnvironment).toBe("prod");
  });
  it("throws when a provider has an unknown type", () => {
    expect(() => parseConfig(SAMPLE_TOML.replace('type = "aws"', 'type = "saml"'))).toThrow(/type must be/);
  });

  it("refuses a pool or provider display name longer than the IAM API allows", () => {
    const longName = "x".repeat(33);
    expect(() =>
      parseConfig(SAMPLE_TOML.replace('display_name = "GitHub Actions + submit Lambdas"', `display_name = "${longName}"`)),
    ).toThrow(/pool submit-federation: display_name .* is 33 characters; the IAM API allows at most 32/);
    expect(() => parseConfig(SAMPLE_TOML.replace('display_name = "GitHub Actions"', `display_name = "${longName}"`))).toThrow(
      /provider github: display_name .* is 33 characters/,
    );
    expect(() => parseConfig(SAMPLE_TOML.replace('display_name = "GitHub Actions"', `display_name = "${"y".repeat(32)}"`))).not.toThrow();
  });
  it("throws when an aws provider has no account id", () => {
    expect(() => parseConfig(SAMPLE_TOML.replace('account_id = "972912397388"\n', ""))).toThrow(/aws needs account_id/);
  });
  it("throws when the pool is missing", () => {
    expect(() => parseConfig('[project]\nid = "p"\n[service_account]\nemail = "a@b"\n')).toThrow(/workload_identity_pool/);
  });

  it("maps every aws provider's google.subject to the role name, not the full assumed-role ARN", () => {
    // The bare assumed-role ARN (arn:aws:sts::<account>:assumed-role/<role>/<session-name>) can
    // exceed Google's 127-byte limit for a long Lambda function name; extracting just the role
    // name keeps it short.
    const config = loadConfigFromRoot();
    const awsProviders = config.providers.filter((p) => p.type === "aws");
    expect(awsProviders.length).toBeGreaterThan(0);
    for (const provider of awsProviders) {
      expect(provider.attributeMapping["google.subject"]).not.toBe("assertion.arn");
      expect(provider.attributeMapping["google.subject"]).toBe(provider.attributeMapping["attribute.aws_role"]);
    }
  });
});

describe("gcp-identity-sync planIdentity", () => {
  it("plans nothing when the pool, providers and binding already match", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(planIdentity(config, liveMatching(config))).toEqual([]);
  });

  it("creates the pool, every provider and the binding from nothing", () => {
    const config = parseConfig(SAMPLE_TOML);
    const plan = planIdentity(config, { pool: null, providers: { "github": null, "aws-prod": null }, policy: { bindings: [] } });
    expect(plan.map((a) => a.kind)).toEqual(["create-pool", "create-provider", "create-provider", "bind-workload-identity-user"]);
    expect(plan[0].name).toBe(POOL);
    expect(plan[1].body.oidc).toEqual({ issuerUri: "https://token.actions.githubusercontent.com" });
    expect(plan[2].body.aws).toEqual({ accountId: "972912397388" });
    expect(plan[3].members).toEqual([
      `principalSet://iam.googleapis.com/${POOL}/attribute.repository/diy-accounting-uk/submit.diyaccounting.co.uk`,
      `principalSet://iam.googleapis.com/${POOL}/attribute.account/972912397388`,
    ]);
  });

  it("updates only the provider fields that differ", () => {
    const config = parseConfig(SAMPLE_TOML);
    const live = liveMatching(config);
    live.providers["aws-prod"].attributeCondition = 'attribute.aws_role.contains("Something")';
    live.providers.github.displayName = "renamed in the console";
    const plan = planIdentity(config, live);
    expect(plan.map((a) => [a.kind, a.fields])).toEqual([
      ["update-provider", ["displayName"]],
      ["update-provider", ["attributeCondition"]],
    ]);
  });

  it("undeletes a pool or provider that is soft-deleted", () => {
    const config = parseConfig(SAMPLE_TOML);
    const live = liveMatching(config);
    live.pool.state = "DELETED";
    live.providers.github.state = "DELETED";
    expect(planIdentity(config, live).map((a) => a.kind)).toEqual(["undelete-pool", "undelete-provider"]);
  });

  it("binds only the principal sets the policy lacks", () => {
    const config = parseConfig(SAMPLE_TOML);
    const live = liveMatching(config);
    live.policy.bindings[0].members = live.policy.bindings[0].members.slice(0, 1);
    const plan = planIdentity(config, live);
    expect(plan).toEqual([
      {
        kind: "bind-workload-identity-user",
        serviceAccount: "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com",
        members: [`principalSet://iam.googleapis.com/${POOL}/attribute.account/972912397388`],
      },
    ]);
  });
});

describe("gcp-identity-sync providerDiff", () => {
  it("compares attribute mappings by every key on either side", () => {
    const wanted = {
      displayName: "x",
      attributeMapping: { "google.subject": "assertion.sub" },
      attributeCondition: "",
      oidc: { issuerUri: "https://i" },
    };
    const live = {
      displayName: "x",
      attributeMapping: { "google.subject": "assertion.sub", "attribute.extra": "assertion.x" },
      attributeCondition: "",
      oidc: { issuerUri: "https://i" },
    };
    expect(providerDiff(wanted, live)).toEqual(["attributeMapping"]);
  });
});

describe("gcp-identity-sync credential configuration", () => {
  it("names the provider audience under the project number", () => {
    expect(providerAudience("958354756046", "submit-federation", "aws-prod")).toBe(`//iam.googleapis.com/${POOL}/providers/aws-prod`);
  });

  it("builds the aws external-account configuration with no secret in it", () => {
    const config = parseConfig(SAMPLE_TOML);
    const cred = awsCredentialConfig(config, config.providers[1]);
    expect(cred.type).toBe("external_account");
    expect(cred.audience).toBe(`//iam.googleapis.com/${POOL}/providers/aws-prod`);
    expect(cred.subject_token_type).toBe("urn:ietf:params:aws:token-type:aws4_request");
    expect(cred.service_account_impersonation_url).toContain(
      "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com:generateAccessToken",
    );
    expect(cred.credential_source.environment_id).toBe("aws1");
    expect(JSON.stringify(cred)).not.toMatch(/private_key|client_secret/);
  });

  it("refuses to build one for the oidc provider", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(() => awsCredentialConfig(config, config.providers[0])).toThrow(/not an aws provider/);
  });

  it("writes one file per aws provider under google/credentials", () => {
    const config = parseConfig(SAMPLE_TOML);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gcp-identity-"));
    try {
      const written = writeCredentialConfigs(config, root);
      expect(written).toEqual([path.join(root, credentialConfigPath(config.providers[1]))]);
      expect(JSON.parse(fs.readFileSync(written[0], "utf-8")).audience).toContain("/providers/aws-prod");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("forbiddenReason", () => {
  it("quotes the API's message and the ErrorInfo reason out of a JSON error body", () => {
    const body =
      '{"error":{"code":403,"message":"Request had insufficient authentication scopes.","status":"PERMISSION_DENIED","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT","domain":"googleapis.com"}]}}';
    expect(forbiddenReason(body)).toBe("Request had insufficient authentication scopes. (ACCESS_TOKEN_SCOPE_INSUFFICIENT)");
  });

  it("quotes a disabled-API message on its own when the body carries no ErrorInfo reason", () => {
    const body =
      '{"error":{"code":403,"message":"Identity and Access Management (IAM) API has not been used in project 958354756046 before or it is disabled.","status":"PERMISSION_DENIED"}}';
    expect(forbiddenReason(body)).toBe(
      "Identity and Access Management (IAM) API has not been used in project 958354756046 before or it is disabled.",
    );
  });

  it("falls back to the raw text when the body is not JSON", () => {
    expect(forbiddenReason("Forbidden")).toBe("Forbidden");
  });
});

const DISABLED_API_BODY =
  '{"error":{"code":403,"message":"Identity and Access Management (IAM) API has not been used in project 958354756046 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/iam.googleapis.com/overview?project=958354756046 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.","status":"PERMISSION_DENIED","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"SERVICE_DISABLED","domain":"googleapis.com","metadata":{"service":"iam.googleapis.com","consumer":"projects/958354756046"}}]}}';
const DISABLED_API_ERROR = () =>
  new Error(
    `403 from GET https://iam.googleapis.com/v1/projects/958354756046/locations/global/workloadIdentityPools/submit-federation: ${forbiddenReason(DISABLED_API_BODY)}`,
  );

describe("disabledApiName", () => {
  it("names the API a disabled-API 403 refers to", () => {
    expect(disabledApiName(DISABLED_API_ERROR().message)).toBe("Identity and Access Management (IAM)");
  });

  it("answers null for a scope or role refusal", () => {
    expect(
      disabledApiName("403 from GET https://x: Request had insufficient authentication scopes. (ACCESS_TOKEN_SCOPE_INSUFFICIENT)"),
    ).toBeNull();
    expect(disabledApiName("403 from GET https://x: The caller does not have permission")).toBeNull();
  });
});

describe("planWhenApiDisabled", () => {
  const config = parseConfig(SAMPLE_TOML);
  config.project.number = "958354756046";

  it("in plan mode answers one would-enable-then-create line per pool, provider and binding", () => {
    const lines = planWhenApiDisabled(DISABLED_API_ERROR(), config, false);
    expect(lines).not.toBeNull();
    expect(lines[0]).toBe(
      `pool ${poolName("958354756046", config.pool.id)}: the Identity and Access Management (IAM) API is disabled (would enable, then create)`,
    );
    for (const provider of config.providers) {
      expect(lines).toContain(
        `provider ${providerName("958354756046", config.pool.id, provider.id)}: the Identity and Access Management (IAM) API is disabled (would enable, then create)`,
      );
    }
    expect(lines[lines.length - 1]).toBe(
      `${config.serviceAccount.email}: roles/iam.workloadIdentityUser for ${config.providers.length} principal set(s): the Identity and Access Management (IAM) API is disabled (would enable, then bind)`,
    );
    expect(lines).toHaveLength(2 + config.providers.length);
  });

  it("in apply mode answers null, so the 403 stays a hard failure with the quoted reason", () => {
    expect(planWhenApiDisabled(DISABLED_API_ERROR(), config, true)).toBeNull();
  });

  it("answers null for any refusal that is not a disabled API", () => {
    expect(planWhenApiDisabled(new Error("403 from GET https://x: The caller does not have permission"), config, false)).toBeNull();
    expect(planWhenApiDisabled(new Error("500 from GET https://x: boom"), config, false)).toBeNull();
  });
});
