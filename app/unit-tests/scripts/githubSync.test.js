// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/githubSync.test.js

import { describe, test, expect } from "vitest";

import { parseConfig, planGithub, rulesetDiff, parseCodeowners, arraySetDiff } from "../../../infra/github/github-sync.js";

const SAMPLE_TOML = `
[repository]
allow_auto_merge = true
delete_branch_on_merge = true
allow_squash_merge = true
allow_merge_commit = true
allow_rebase_merge = true

[actions]
enabled = true
allowed_actions = "selected"
sha_pinning_required = true
default_workflow_permissions = "read"
can_approve_pull_request_reviews = false
github_owned_allowed = true
verified_allowed = true
patterns_allowed = ["aws-actions/configure-aws-credentials@*"]
repository_secrets = ["ADMIN_TOKEN"]
repository_variables = ["AGENT_APP_ID"]

[security]
automated_security_fixes = false

[[ruleset]]
name = "main"
enforcement = "active"

  [ruleset.conditions.ref_name]
  include = ["~DEFAULT_BRANCH"]
  exclude = []

  [[ruleset.rule]]
  type = "deletion"

  [[ruleset.rule]]
  type = "non_fast_forward"

  [[ruleset.rule]]
  type = "required_status_checks"
  strict_required_status_checks_policy = false
  do_not_enforce_on_create = false
  required_status_checks = ["npm test", "eslint"]

  [[ruleset.bypass_actor]]
  actor_id = 5
  actor_type = "RepositoryRole"
  bypass_mode = "always"

[[environment]]
name = "ci"
variables = ["SUBMIT_ACCOUNT_ID"]
secrets = ["STRIPE_SECRET_KEY", "TELEGRAM_BOT_TOKEN"]

[[environment]]
name = "prod"
variables = []
secrets = []

[codeowners]
rules = [{ pattern = "*", owners = ["@antonycc"] }]
`;

function parsedSample() {
  return parseConfig(SAMPLE_TOML);
}

/** A live-state fixture that matches parsedSample() exactly, field for field. */
function matchingLive(config) {
  return {
    repository: { ...config.repository },
    actions: { ...config.actions },
    security: { ...config.security },
    rulesets: {
      main: {
        id: 1,
        enforcement: "active",
        conditions: { refName: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
        rules: [
          { type: "deletion" },
          { type: "non_fast_forward" },
          {
            type: "required_status_checks",
            strictRequiredStatusChecksPolicy: false,
            doNotEnforceOnCreate: false,
            requiredStatusChecks: ["npm test", "eslint"],
          },
        ],
        bypassActors: [{ actorId: 5, actorType: "RepositoryRole", bypassMode: "always" }],
      },
    },
    environments: {
      ci: { variables: ["SUBMIT_ACCOUNT_ID"], secrets: ["STRIPE_SECRET_KEY", "TELEGRAM_BOT_TOKEN"] },
      prod: { variables: [], secrets: [] },
    },
    codeowners: { rules: [{ pattern: "*", owners: ["@antonycc"] }] },
  };
}

describe("parseConfig", () => {
  test("reads every section", () => {
    const config = parsedSample();
    expect(config.repository.allowAutoMerge).toBe(true);
    expect(config.actions.patternsAllowed).toEqual(["aws-actions/configure-aws-credentials@*"]);
    expect(config.actions.repositorySecrets).toEqual(["ADMIN_TOKEN"]);
    expect(config.security.automatedSecurityFixes).toBe(false);
    expect(config.rulesets).toHaveLength(1);
    expect(config.rulesets[0].name).toBe("main");
    expect(config.rulesets[0].rules.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "required_status_checks"]);
    expect(config.rulesets[0].bypassActors).toEqual([{ actorId: 5, actorType: "RepositoryRole", bypassMode: "always" }]);
    expect(config.environments.map((e) => e.name)).toEqual(["ci", "prod"]);
    expect(config.codeowners.rules).toEqual([{ pattern: "*", owners: ["@antonycc"] }]);
  });

  test("throws when [repository] is missing", () => {
    expect(() => parseConfig("[actions]\nenabled = true\n")).toThrow(/repository/);
  });

  test("throws when a required_status_checks rule has no checks", () => {
    const bad = SAMPLE_TOML.replace('required_status_checks = ["npm test", "eslint"]', "required_status_checks = []");
    expect(() => parseConfig(bad)).toThrow(/required_status_checks/);
  });

  test("throws when there are no [[environment]] entries", () => {
    const bad = SAMPLE_TOML.replace(/\[\[environment\]\][\s\S]*/, "");
    expect(() => parseConfig(bad)).toThrow(/environment/);
  });
});

describe("planGithub", () => {
  test("finds no differences when live matches declared", () => {
    const config = parsedSample();
    expect(planGithub(config, matchingLive(config))).toEqual([]);
  });

  test("reports one difference for one changed field", () => {
    const config = parsedSample();
    const live = matchingLive(config);
    live.repository.deleteBranchOnMerge = false;
    const plan = planGithub(config, live);
    expect(plan).toEqual([{ path: "repository.deleteBranchOnMerge", declared: true, live: false }]);
  });

  test("a declared environment secret missing live is a finding, never created", () => {
    const config = parsedSample();
    const live = matchingLive(config);
    live.environments.ci.secrets = ["STRIPE_SECRET_KEY"];
    const plan = planGithub(config, live);
    expect(plan).toEqual([{ path: "environment.ci.secrets.TELEGRAM_BOT_TOKEN", declared: "present", live: "missing" }]);
  });

  test("a live secret not declared is drift the other way", () => {
    const config = parsedSample();
    const live = matchingLive(config);
    live.environments.ci.secrets = ["STRIPE_SECRET_KEY", "TELEGRAM_BOT_TOKEN", "UNDECLARED_SECRET"];
    const plan = planGithub(config, live);
    expect(plan).toEqual([{ path: "environment.ci.secrets.UNDECLARED_SECRET", declared: "missing", live: "present" }]);
  });

  test("a declared environment missing entirely live is one finding", () => {
    const config = parsedSample();
    const live = matchingLive(config);
    delete live.environments.prod;
    const plan = planGithub(config, live);
    expect(plan).toEqual([{ path: "environment.prod", declared: "present", live: "missing" }]);
  });
});

describe("rulesetDiff", () => {
  const declared = parsedSample().rulesets[0];

  test("finds no differences against a matching live ruleset", () => {
    const live = matchingLive(parsedSample()).rulesets.main;
    expect(rulesetDiff(declared, live)).toEqual([]);
  });

  test("reports a missing ruleset as one finding", () => {
    expect(rulesetDiff(declared, null)).toEqual([{ path: "", declared: "present", live: "missing" }]);
  });

  test("reports a changed enforcement value", () => {
    const live = matchingLive(parsedSample()).rulesets.main;
    live.enforcement = "disabled";
    expect(rulesetDiff(declared, live)).toEqual([{ path: "enforcement", declared: "active", live: "disabled" }]);
  });

  test("reports a missing rule type", () => {
    const live = matchingLive(parsedSample()).rulesets.main;
    live.rules = live.rules.filter((r) => r.type !== "non_fast_forward");
    expect(rulesetDiff(declared, live)).toEqual([{ path: "rules.non_fast_forward", declared: "present", live: "missing" }]);
  });

  test("reports a changed required_status_checks list", () => {
    const live = matchingLive(parsedSample()).rulesets.main;
    live.rules = live.rules.map((r) => (r.type === "required_status_checks" ? { ...r, requiredStatusChecks: ["npm test"] } : r));
    expect(rulesetDiff(declared, live)).toEqual([
      { path: "rules.required_status_checks.required_status_checks.eslint", declared: "present", live: "missing" },
    ]);
  });

  test("reports a missing bypass actor", () => {
    const live = matchingLive(parsedSample()).rulesets.main;
    live.bypassActors = [];
    expect(rulesetDiff(declared, live)).toEqual([{ path: "bypass_actors.5:RepositoryRole:always", declared: "present", live: "missing" }]);
  });
});

describe("parseCodeowners", () => {
  test("reads one rule per non-comment line", () => {
    expect(parseCodeowners("# a comment\n* @antonycc\n\n")).toEqual([{ pattern: "*", owners: ["@antonycc"] }]);
  });

  test("reads several owners on one line", () => {
    expect(parseCodeowners("/infra/ @antonycc @someone-else\n")).toEqual([{ pattern: "/infra/", owners: ["@antonycc", "@someone-else"] }]);
  });
});

describe("arraySetDiff", () => {
  test("reports nothing when the sets match", () => {
    expect(arraySetDiff("p", ["a", "b"], ["b", "a"])).toEqual([]);
  });

  test("reports a declared-only entry as present/missing", () => {
    expect(arraySetDiff("p", ["a"], [])).toEqual([{ path: "p.a", declared: "present", live: "missing" }]);
  });

  test("reports a live-only entry as missing/present", () => {
    expect(arraySetDiff("p", [], ["a"])).toEqual([{ path: "p.a", declared: "missing", live: "present" }]);
  });
});
