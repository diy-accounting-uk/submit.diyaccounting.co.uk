// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/googleRolesApply.test.js

import { describe, test, expect } from "vitest";

import {
  parseArgs,
  parseConfig,
  diffGa4AccountBindings,
  diffGcpProjectBindings,
  applyGcpBindingChanges,
} from "../../../scripts/google-roles-apply.js";

const SERVICE_ACCOUNT = "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com";

describe("parseArgs", () => {
  test("defaults to not a dry run", () => {
    expect(parseArgs([])).toEqual({ dryRun: false });
  });

  test("recognises --dry-run", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ dryRun: true });
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown argument: --bogus");
  });
});

describe("parseConfig", () => {
  const FIXTURE = `
[service_account]
email = "${SERVICE_ACCOUNT}"

[[ga4.account_bindings]]
account_id = "1035014"
user = "${SERVICE_ACCOUNT}"
roles = ["predefinedRoles/admin"]

[[gcp.project_bindings]]
project_id = "diyaccounting-ga4"
member = "serviceAccount:${SERVICE_ACCOUNT}"
roles = ["roles/owner", "roles/bigquery.jobUser"]
`;

  test("parses the service account email, GA4 bindings and GCP bindings", () => {
    const config = parseConfig(FIXTURE);
    expect(config.serviceAccountEmail).toBe(SERVICE_ACCOUNT);
    expect(config.ga4AccountBindings).toEqual([{ accountId: "1035014", user: SERVICE_ACCOUNT, roles: ["predefinedRoles/admin"] }]);
    expect(config.gcpProjectBindings).toEqual([
      { projectId: "diyaccounting-ga4", member: `serviceAccount:${SERVICE_ACCOUNT}`, roles: ["roles/owner", "roles/bigquery.jobUser"] },
    ]);
  });

  test("throws when [service_account].email is missing", () => {
    expect(() => parseConfig("[ga4]\n")).toThrow("service_account");
  });

  test("throws on a GA4 binding missing a required field", () => {
    const bad = `
[service_account]
email = "${SERVICE_ACCOUNT}"

[[ga4.account_bindings]]
account_id = "1035014"
roles = ["predefinedRoles/admin"]
`;
    expect(() => parseConfig(bad)).toThrow("Invalid [[ga4.account_bindings]] entry");
  });

  test("throws on a GCP binding missing a required field", () => {
    const bad = `
[service_account]
email = "${SERVICE_ACCOUNT}"

[[gcp.project_bindings]]
project_id = "diyaccounting-ga4"
roles = ["roles/owner"]
`;
    expect(() => parseConfig(bad)).toThrow("Invalid [[gcp.project_bindings]] entry");
  });
});

describe("diffGa4AccountBindings", () => {
  test("creates a binding for a desired user with none live", () => {
    const diff = diffGa4AccountBindings([{ user: SERVICE_ACCOUNT, roles: ["predefinedRoles/admin"] }], []);
    expect(diff.toCreate).toEqual([{ user: SERVICE_ACCOUNT, roles: ["predefinedRoles/admin"] }]);
    expect(diff.toUpdate).toEqual([]);
  });

  test("reports no changes when live roles already match, regardless of order", () => {
    const live = [{ name: "accounts/1035014/accessBindings/abc", user: SERVICE_ACCOUNT, roles: ["predefinedRoles/analyst", "predefinedRoles/admin"] }];
    const diff = diffGa4AccountBindings([{ user: SERVICE_ACCOUNT, roles: ["predefinedRoles/admin", "predefinedRoles/analyst"] }], live);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  test("updates a binding whose live roles drifted from the desired set", () => {
    const live = [{ name: "accounts/1035014/accessBindings/abc", user: SERVICE_ACCOUNT, roles: ["predefinedRoles/analyst"] }];
    const diff = diffGa4AccountBindings([{ user: SERVICE_ACCOUNT, roles: ["predefinedRoles/admin"] }], live);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([{ name: "accounts/1035014/accessBindings/abc", user: SERVICE_ACCOUNT, roles: ["predefinedRoles/admin"] }]);
  });

  test("ignores a live binding for a user not named in the desired list", () => {
    const live = [{ name: "accounts/1035014/accessBindings/xyz", user: "someone-else@example.com", roles: ["predefinedRoles/admin"] }];
    const diff = diffGa4AccountBindings([], live);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });
});

describe("diffGcpProjectBindings", () => {
  const MEMBER = `serviceAccount:${SERVICE_ACCOUNT}`;

  test("adds roles missing from the live policy", () => {
    const diff = diffGcpProjectBindings([{ member: MEMBER, roles: ["roles/owner", "roles/bigquery.jobUser"] }], []);
    expect(diff.toAdd).toEqual(
      expect.arrayContaining([
        { member: MEMBER, role: "roles/owner" },
        { member: MEMBER, role: "roles/bigquery.jobUser" },
      ]),
    );
    expect(diff.toRemove).toEqual([]);
  });

  test("reports no changes when the live policy already matches", () => {
    const live = [
      { role: "roles/owner", members: [MEMBER] },
      { role: "roles/bigquery.jobUser", members: [MEMBER] },
    ];
    const diff = diffGcpProjectBindings([{ member: MEMBER, roles: ["roles/owner", "roles/bigquery.jobUser"] }], live);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  test("removes a role the toml no longer grants to a tracked member", () => {
    const live = [
      { role: "roles/owner", members: [MEMBER] },
      { role: "roles/bigquery.dataViewer", members: [MEMBER] },
    ];
    const diff = diffGcpProjectBindings([{ member: MEMBER, roles: ["roles/owner"] }], live);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([{ member: MEMBER, role: "roles/bigquery.dataViewer" }]);
  });

  test("ignores a live binding for a member not named in the desired list", () => {
    const live = [{ role: "roles/owner", members: ["user:someone-else@example.com"] }];
    const diff = diffGcpProjectBindings([], live);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  test("leaves another tracked member's roles on the same project untouched", () => {
    const otherMember = "serviceAccount:other@diyaccounting-ga4.iam.gserviceaccount.com";
    const live = [{ role: "roles/owner", members: [MEMBER, otherMember] }];
    const diff = diffGcpProjectBindings(
      [
        { member: MEMBER, roles: [] },
        { member: otherMember, roles: ["roles/owner"] },
      ],
      live,
    );
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([{ member: MEMBER, role: "roles/owner" }]);
  });
});

describe("applyGcpBindingChanges", () => {
  const MEMBER = `serviceAccount:${SERVICE_ACCOUNT}`;

  test("adds a member to an existing role binding", () => {
    const bindings = [{ role: "roles/owner", members: ["user:someone-else@example.com"] }];
    const next = applyGcpBindingChanges(bindings, [{ member: MEMBER, role: "roles/owner" }], []);
    expect(next).toEqual([{ role: "roles/owner", members: ["user:someone-else@example.com", MEMBER] }]);
  });

  test("creates a new role binding when none exists", () => {
    const next = applyGcpBindingChanges([], [{ member: MEMBER, role: "roles/bigquery.jobUser" }], []);
    expect(next).toEqual([{ role: "roles/bigquery.jobUser", members: [MEMBER] }]);
  });

  test("removes a member from a role binding, dropping the binding once empty", () => {
    const bindings = [{ role: "roles/bigquery.dataViewer", members: [MEMBER] }];
    const next = applyGcpBindingChanges(bindings, [], [{ member: MEMBER, role: "roles/bigquery.dataViewer" }]);
    expect(next).toEqual([]);
  });

  test("removing a member leaves other members of the same role binding intact", () => {
    const bindings = [{ role: "roles/owner", members: [MEMBER, "user:someone-else@example.com"] }];
    const next = applyGcpBindingChanges(bindings, [], [{ member: MEMBER, role: "roles/owner" }]);
    expect(next).toEqual([{ role: "roles/owner", members: ["user:someone-else@example.com"] }]);
  });

  test("leaves untouched bindings for roles not named in toAdd or toRemove", () => {
    const bindings = [{ role: "roles/editor", members: ["user:someone-else@example.com"] }];
    const next = applyGcpBindingChanges(bindings, [], []);
    expect(next).toEqual(bindings);
  });
});
