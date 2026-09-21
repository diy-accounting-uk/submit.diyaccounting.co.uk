#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/github/github-sync.js
//
// Plans, then optionally applies, this repository's own GitHub settings against
// infra/github/github.toml: the merge settings, the Actions permissions and allow-list,
// Dependabot security fixes, the "main" ruleset, and the names (never values) of every
// environment's variables and secrets. Plans by default; --apply writes the difference back
// through the same `gh api` routes it read from. A variable or secret name the file declares
// but that is missing live is reported as a finding; the sync never creates one, since it has
// no value to write. CODEOWNERS is read back and compared, never written - it is a tracked file
// in this repository, so a mismatch is a drift finding for a person to fix in a commit.
//
// Usage:
//   node infra/github/github-sync.js
//   node infra/github/github-sync.js --apply
//
// Credentials: `gh` resolves its own token (GH_TOKEN in the environment, or the local `gh auth`
// session). Reading every route here needs no more than read access; writing the repository,
// actions and ruleset settings needs repository administration, which is why the apply step in
// .github/workflows/infra-apply.yml runs on the `prod` environment with the repository secret
// ADMIN_TOKEN - GITHUB_TOKEN cannot administer a repository's own settings.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import TOML from "@iarna/toml";

export const CONFIG_PATH = "infra/github/github.toml";
export const CODEOWNERS_PATH = ".github/CODEOWNERS";
export const REPO = "diy-accounting-uk/submit.diyaccounting.co.uk";

/**
 * Parse infra/github/github.toml into the shape the planner reads.
 *
 * @param {string} tomlString
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);

  const repository = parsed.repository;
  if (!repository) throw new Error("github.toml is missing [repository]");
  for (const key of ["allow_auto_merge", "delete_branch_on_merge", "allow_squash_merge", "allow_merge_commit", "allow_rebase_merge"]) {
    if (typeof repository[key] !== "boolean") throw new Error(`[repository].${key} must be a boolean`);
  }

  const actions = parsed.actions;
  if (!actions) throw new Error("github.toml is missing [actions]");
  if (!Array.isArray(actions.patterns_allowed)) throw new Error("[actions].patterns_allowed must be an array");
  if (!Array.isArray(actions.repository_secrets)) throw new Error("[actions].repository_secrets must be an array");
  if (!Array.isArray(actions.repository_variables)) throw new Error("[actions].repository_variables must be an array");

  const security = parsed.security;
  if (typeof security?.automated_security_fixes !== "boolean") throw new Error("[security].automated_security_fixes must be a boolean");

  const rulesets = (parsed.ruleset ?? []).map((entry) => {
    if (!entry.name) throw new Error("a [[ruleset]] entry is missing name");
    if (!entry.enforcement) throw new Error(`ruleset ${entry.name} is missing enforcement`);
    const refName = entry.conditions?.ref_name;
    if (!refName) throw new Error(`ruleset ${entry.name} is missing [ruleset.conditions.ref_name]`);
    const rules = (entry.rule ?? []).map((rule) => {
      if (!rule.type) throw new Error(`ruleset ${entry.name} has a rule with no type`);
      if (rule.type === "required_status_checks") {
        if (!Array.isArray(rule.required_status_checks) || rule.required_status_checks.length === 0) {
          throw new Error(`ruleset ${entry.name}: required_status_checks rule needs a non-empty required_status_checks list`);
        }
        return {
          type: rule.type,
          strictRequiredStatusChecksPolicy: Boolean(rule.strict_required_status_checks_policy),
          doNotEnforceOnCreate: Boolean(rule.do_not_enforce_on_create),
          requiredStatusChecks: [...rule.required_status_checks],
        };
      }
      return { type: rule.type };
    });
    const bypassActors = (entry.bypass_actor ?? []).map((actor) => {
      if (!actor.actor_id || !actor.actor_type || !actor.bypass_mode) {
        throw new Error(`ruleset ${entry.name} has a bypass_actor missing actor_id, actor_type or bypass_mode`);
      }
      return { actorId: Number(actor.actor_id), actorType: String(actor.actor_type), bypassMode: String(actor.bypass_mode) };
    });
    return {
      name: String(entry.name),
      enforcement: String(entry.enforcement),
      conditions: { refName: { include: [...(refName.include ?? [])], exclude: [...(refName.exclude ?? [])] } },
      rules,
      bypassActors,
    };
  });

  const environments = (parsed.environment ?? []).map((entry) => {
    if (!entry.name) throw new Error("a [[environment]] entry is missing name");
    return {
      name: String(entry.name),
      variables: [...(entry.variables ?? [])].sort(),
      secrets: [...(entry.secrets ?? [])].sort(),
    };
  });
  if (environments.length === 0) throw new Error("github.toml has no [[environment]] entries");

  const codeownersRules = (parsed.codeowners?.rules ?? []).map((rule) => {
    if (!rule.pattern || !Array.isArray(rule.owners)) throw new Error("a [codeowners] rule needs pattern and owners");
    return { pattern: String(rule.pattern), owners: [...rule.owners] };
  });

  return {
    repository: {
      allowAutoMerge: repository.allow_auto_merge,
      deleteBranchOnMerge: repository.delete_branch_on_merge,
      allowSquashMerge: repository.allow_squash_merge,
      allowMergeCommit: repository.allow_merge_commit,
      allowRebaseMerge: repository.allow_rebase_merge,
    },
    actions: {
      enabled: Boolean(actions.enabled),
      allowedActions: String(actions.allowed_actions),
      shaPinningRequired: Boolean(actions.sha_pinning_required),
      defaultWorkflowPermissions: String(actions.default_workflow_permissions),
      canApprovePullRequestReviews: Boolean(actions.can_approve_pull_request_reviews),
      githubOwnedAllowed: Boolean(actions.github_owned_allowed),
      verifiedAllowed: Boolean(actions.verified_allowed),
      patternsAllowed: [...actions.patterns_allowed].sort(),
      repositorySecrets: [...actions.repository_secrets].sort(),
      repositoryVariables: [...actions.repository_variables].sort(),
    },
    security: { automatedSecurityFixes: security.automated_security_fixes },
    rulesets,
    environments,
    codeowners: { rules: codeownersRules },
  };
}

export function loadConfigFromRoot() {
  return parseConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--help") {
      console.log("Usage: node infra/github/github-sync.js [--apply]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  return opts;
}

/**
 * The bare CODEOWNERS rule syntax this repository uses: one pattern and its owners per
 * non-comment, non-blank line. Enough to compare against [codeowners].rules; it does not need
 * to cover every CODEOWNERS syntax GitHub accepts, only the one this file uses.
 *
 * @param {string} text
 * @returns {Array<{pattern: string, owners: string[]}>}
 */
export function parseCodeowners(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
}

/**
 * Diffs declared entries in `declaredArr` against `liveArr`, treating both as sets. A name in
 * `declaredArr` but not `liveArr` is a finding, never created; a name live but not declared is
 * drift the other way. Pure, so it is unit-tested; used for secret/variable names and for the
 * Actions allow-list patterns.
 *
 * @param {string} pathPrefix
 * @param {string[]} declaredArr
 * @param {string[]} liveArr
 * @returns {Array<{path: string, declared: string, live: string}>}
 */
export function arraySetDiff(pathPrefix, declaredArr, liveArr) {
  const diffs = [];
  const declaredSet = new Set(declaredArr);
  const liveSet = new Set(liveArr);
  for (const item of [...declaredSet].sort()) {
    if (!liveSet.has(item)) diffs.push({ path: joinPath(pathPrefix, item), declared: "present", live: "missing" });
  }
  for (const item of [...liveSet].sort()) {
    if (!declaredSet.has(item)) diffs.push({ path: joinPath(pathPrefix, item), declared: "missing", live: "present" });
  }
  return diffs;
}

function joinPath(pathPrefix, key) {
  return pathPrefix ? `${pathPrefix}.${key}` : key;
}

function scalarDiff(pathPrefix, key, declaredValue, liveValue) {
  return declaredValue === liveValue ? [] : [{ path: joinPath(pathPrefix, key), declared: declaredValue, live: liveValue }];
}

/**
 * Which fields differ between one declared ruleset and the live ruleset the REST API answered
 * for it (or null, when no ruleset of that name exists live). Paths are relative to the
 * ruleset itself; planGithub prefixes them with "ruleset.<name>.". Pure, so it is unit-tested.
 *
 * @param {object} declared - one entry of parseConfig(...).rulesets
 * @param {object|null} live - the REST API's ruleset resource, shaped by readLiveRuleset, or null
 * @returns {Array<{path: string, declared: *, live: *}>}
 */
export function rulesetDiff(declared, live) {
  if (!live) return [{ path: "", declared: "present", live: "missing" }];

  const diffs = [];
  diffs.push(...scalarDiff("", "enforcement", declared.enforcement, live.enforcement));
  diffs.push(
    ...arraySetDiff("conditions.ref_name.include", declared.conditions.refName.include, live.conditions?.refName?.include ?? []),
  );
  diffs.push(
    ...arraySetDiff("conditions.ref_name.exclude", declared.conditions.refName.exclude, live.conditions?.refName?.exclude ?? []),
  );

  const declaredByType = new Map(declared.rules.map((rule) => [rule.type, rule]));
  const liveByType = new Map((live.rules ?? []).map((rule) => [rule.type, rule]));
  for (const [type, declaredRule] of declaredByType) {
    const liveRule = liveByType.get(type);
    if (!liveRule) {
      diffs.push({ path: `rules.${type}`, declared: "present", live: "missing" });
      continue;
    }
    if (type === "required_status_checks") {
      diffs.push(
        ...scalarDiff(
          "rules.required_status_checks",
          "strict_required_status_checks_policy",
          declaredRule.strictRequiredStatusChecksPolicy,
          Boolean(liveRule.strictRequiredStatusChecksPolicy),
        ),
      );
      diffs.push(
        ...scalarDiff(
          "rules.required_status_checks",
          "do_not_enforce_on_create",
          declaredRule.doNotEnforceOnCreate,
          Boolean(liveRule.doNotEnforceOnCreate),
        ),
      );
      diffs.push(
        ...arraySetDiff(
          "rules.required_status_checks.required_status_checks",
          declaredRule.requiredStatusChecks,
          liveRule.requiredStatusChecks ?? [],
        ),
      );
    }
  }
  for (const type of liveByType.keys()) {
    if (!declaredByType.has(type)) diffs.push({ path: `rules.${type}`, declared: "missing", live: "present" });
  }

  const declaredActors = new Set(declared.bypassActors.map((a) => `${a.actorId}:${a.actorType}:${a.bypassMode}`));
  const liveActors = new Set((live.bypassActors ?? []).map((a) => `${a.actorId}:${a.actorType}:${a.bypassMode}`));
  diffs.push(...arraySetDiff("bypass_actors", [...declaredActors], [...liveActors]));

  return diffs;
}

/**
 * The full set of differences between infra/github/github.toml and live GitHub state: path,
 * declared value, live value. Pure, so it is unit-tested; every network call happens in
 * readLiveState, never here.
 *
 * @param {ReturnType<typeof parseConfig>} config
 * @param {object} live - readLiveState's result
 * @returns {Array<{path: string, declared: *, live: *}>}
 */
export function planGithub(config, live) {
  const diffs = [];

  for (const [key, declaredValue] of Object.entries(config.repository)) {
    diffs.push(...scalarDiff("repository", key, declaredValue, live.repository[key]));
  }

  for (const key of [
    "enabled",
    "allowedActions",
    "shaPinningRequired",
    "defaultWorkflowPermissions",
    "canApprovePullRequestReviews",
    "githubOwnedAllowed",
    "verifiedAllowed",
  ]) {
    diffs.push(...scalarDiff("actions", key, config.actions[key], live.actions[key]));
  }
  diffs.push(...arraySetDiff("actions.patterns_allowed", config.actions.patternsAllowed, live.actions.patternsAllowed));
  diffs.push(...arraySetDiff("actions.repository_secrets", config.actions.repositorySecrets, live.actions.repositorySecrets));
  diffs.push(...arraySetDiff("actions.repository_variables", config.actions.repositoryVariables, live.actions.repositoryVariables));

  diffs.push(...scalarDiff("security", "automated_security_fixes", config.security.automatedSecurityFixes, live.security.automatedSecurityFixes));

  for (const declaredRuleset of config.rulesets) {
    const liveRuleset = live.rulesets?.[declaredRuleset.name] ?? null;
    for (const diff of rulesetDiff(declaredRuleset, liveRuleset)) {
      diffs.push({ path: `ruleset.${declaredRuleset.name}${diff.path ? `.${diff.path}` : ""}`, declared: diff.declared, live: diff.live });
    }
  }

  for (const declaredEnvironment of config.environments) {
    const liveEnvironment = live.environments?.[declaredEnvironment.name];
    if (!liveEnvironment) {
      diffs.push({ path: `environment.${declaredEnvironment.name}`, declared: "present", live: "missing" });
      continue;
    }
    diffs.push(
      ...arraySetDiff(`environment.${declaredEnvironment.name}.variables`, declaredEnvironment.variables, liveEnvironment.variables),
    );
    diffs.push(...arraySetDiff(`environment.${declaredEnvironment.name}.secrets`, declaredEnvironment.secrets, liveEnvironment.secrets));
  }

  if (config.codeowners.rules.length > 0) {
    if (!live.codeowners) {
      diffs.push({ path: "codeowners", declared: "present", live: "missing" });
    } else {
      const declaredText = config.codeowners.rules.map((r) => `${r.pattern} ${r.owners.join(" ")}`).join("\n");
      const liveText = live.codeowners.rules.map((r) => `${r.pattern} ${r.owners.join(" ")}`).join("\n");
      diffs.push(...scalarDiff("codeowners", "rules", declaredText, liveText));
    }
  }

  return diffs;
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

function ghApiJson(route) {
  const output = execFileSync("gh", ["api", route], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output);
}

function ghApiNames(route, field) {
  const output = execFileSync("gh", ["api", "--paginate", "--jq", `.${field}[].name`, route], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function ghApiWrite(method, route, body) {
  const args = ["api", "-X", method, route];
  if (body !== undefined) args.push("--input", "-");
  execFileSync("gh", args, {
    encoding: "utf8",
    input: body !== undefined ? JSON.stringify(body) : undefined,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function shapeLiveRuleset(raw) {
  return {
    id: raw.id,
    enforcement: raw.enforcement,
    conditions: {
      refName: { include: raw.conditions?.ref_name?.include ?? [], exclude: raw.conditions?.ref_name?.exclude ?? [] },
    },
    rules: (raw.rules ?? []).map((rule) =>
      rule.type === "required_status_checks"
        ? {
            type: rule.type,
            strictRequiredStatusChecksPolicy: rule.parameters?.strict_required_status_checks_policy,
            doNotEnforceOnCreate: rule.parameters?.do_not_enforce_on_create,
            requiredStatusChecks: (rule.parameters?.required_status_checks ?? []).map((c) => c.context),
          }
        : { type: rule.type },
    ),
    bypassActors: (raw.bypass_actors ?? []).map((a) => ({ actorId: a.actor_id, actorType: a.actor_type, bypassMode: a.bypass_mode })),
  };
}

function readLiveRulesets(config) {
  const list = ghApiJson(`repos/${REPO}/rulesets`);
  const byName = {};
  for (const declared of config.rulesets) {
    const summary = list.find((r) => r.name === declared.name);
    byName[declared.name] = summary ? shapeLiveRuleset(ghApiJson(`repos/${REPO}/rulesets/${summary.id}`)) : null;
  }
  return byName;
}

function readLiveEnvironments(config) {
  const byName = {};
  for (const declared of config.environments) {
    byName[declared.name] = {
      variables: ghApiNames(`repos/${REPO}/environments/${declared.name}/variables`, "variables"),
      secrets: ghApiNames(`repos/${REPO}/environments/${declared.name}/secrets`, "secrets"),
    };
  }
  return byName;
}

function readLiveCodeowners(rootDir) {
  const filePath = path.join(rootDir, CODEOWNERS_PATH);
  if (!fs.existsSync(filePath)) return null;
  return { rules: parseCodeowners(fs.readFileSync(filePath, "utf-8")) };
}

export function readLiveState(config, rootDir = process.cwd()) {
  const repo = ghApiJson(`repos/${REPO}`);
  const actionsPermissions = ghApiJson(`repos/${REPO}/actions/permissions`);
  const selectedActions = ghApiJson(`repos/${REPO}/actions/permissions/selected-actions`);
  const workflowPermissions = ghApiJson(`repos/${REPO}/actions/permissions/workflow`);
  const securityFixes = ghApiJson(`repos/${REPO}/automated-security-fixes`);

  return {
    repository: {
      allowAutoMerge: repo.allow_auto_merge,
      deleteBranchOnMerge: repo.delete_branch_on_merge,
      allowSquashMerge: repo.allow_squash_merge,
      allowMergeCommit: repo.allow_merge_commit,
      allowRebaseMerge: repo.allow_rebase_merge,
    },
    actions: {
      enabled: actionsPermissions.enabled,
      allowedActions: actionsPermissions.allowed_actions,
      shaPinningRequired: actionsPermissions.sha_pinning_required,
      defaultWorkflowPermissions: workflowPermissions.default_workflow_permissions,
      canApprovePullRequestReviews: workflowPermissions.can_approve_pull_request_reviews,
      githubOwnedAllowed: selectedActions.github_owned_allowed,
      verifiedAllowed: selectedActions.verified_allowed,
      patternsAllowed: [...(selectedActions.patterns_allowed ?? [])].sort(),
      repositorySecrets: ghApiNames(`repos/${REPO}/actions/secrets`, "secrets"),
      repositoryVariables: ghApiNames(`repos/${REPO}/actions/variables`, "variables"),
    },
    security: { automatedSecurityFixes: securityFixes.enabled },
    rulesets: readLiveRulesets(config),
    environments: readLiveEnvironments(config),
    codeowners: readLiveCodeowners(rootDir),
  };
}

function applyRepositoryPatch(config, live) {
  const body = {};
  const map = {
    allowAutoMerge: "allow_auto_merge",
    deleteBranchOnMerge: "delete_branch_on_merge",
    allowSquashMerge: "allow_squash_merge",
    allowMergeCommit: "allow_merge_commit",
    allowRebaseMerge: "allow_rebase_merge",
  };
  for (const [key, field] of Object.entries(map)) {
    if (config.repository[key] !== live.repository[key]) body[field] = config.repository[key];
  }
  if (Object.keys(body).length === 0) return false;
  ghApiWrite("PATCH", `repos/${REPO}`, body);
  return true;
}

function applyActionsPermissions(config, live) {
  let changed = false;
  if (
    config.actions.enabled !== live.actions.enabled ||
    config.actions.allowedActions !== live.actions.allowedActions ||
    config.actions.shaPinningRequired !== live.actions.shaPinningRequired
  ) {
    ghApiWrite("PUT", `repos/${REPO}/actions/permissions`, {
      enabled: config.actions.enabled,
      allowed_actions: config.actions.allowedActions,
      sha_pinning_required: config.actions.shaPinningRequired,
    });
    changed = true;
  }
  const patternsDiff = arraySetDiff("", config.actions.patternsAllowed, live.actions.patternsAllowed);
  if (
    config.actions.githubOwnedAllowed !== live.actions.githubOwnedAllowed ||
    config.actions.verifiedAllowed !== live.actions.verifiedAllowed ||
    patternsDiff.length > 0
  ) {
    ghApiWrite("PUT", `repos/${REPO}/actions/permissions/selected-actions`, {
      github_owned_allowed: config.actions.githubOwnedAllowed,
      verified_allowed: config.actions.verifiedAllowed,
      patterns_allowed: config.actions.patternsAllowed,
    });
    changed = true;
  }
  if (
    config.actions.defaultWorkflowPermissions !== live.actions.defaultWorkflowPermissions ||
    config.actions.canApprovePullRequestReviews !== live.actions.canApprovePullRequestReviews
  ) {
    ghApiWrite("PUT", `repos/${REPO}/actions/permissions/workflow`, {
      default_workflow_permissions: config.actions.defaultWorkflowPermissions,
      can_approve_pull_request_reviews: config.actions.canApprovePullRequestReviews,
    });
    changed = true;
  }
  return changed;
}

function applySecurityFixes(config, live) {
  if (config.security.automatedSecurityFixes === live.security.automatedSecurityFixes) return false;
  ghApiWrite(config.security.automatedSecurityFixes ? "PUT" : "DELETE", `repos/${REPO}/automated-security-fixes`);
  return true;
}

function rulesetRequestBody(declared) {
  return {
    name: declared.name,
    target: "branch",
    enforcement: declared.enforcement,
    conditions: { ref_name: { include: declared.conditions.refName.include, exclude: declared.conditions.refName.exclude } },
    rules: declared.rules.map((rule) =>
      rule.type === "required_status_checks"
        ? {
            type: rule.type,
            parameters: {
              strict_required_status_checks_policy: rule.strictRequiredStatusChecksPolicy,
              do_not_enforce_on_create: rule.doNotEnforceOnCreate,
              required_status_checks: rule.requiredStatusChecks.map((context) => ({ context })),
            },
          }
        : { type: rule.type },
    ),
    bypass_actors: declared.bypassActors.map((a) => ({ actor_id: a.actorId, actor_type: a.actorType, bypass_mode: a.bypassMode })),
  };
}

function applyRulesets(config, live) {
  let changed = false;
  for (const declared of config.rulesets) {
    const liveRuleset = live.rulesets?.[declared.name] ?? null;
    if (rulesetDiff(declared, liveRuleset).length === 0) continue;
    changed = true;
    if (!liveRuleset) {
      ghApiWrite("POST", `repos/${REPO}/rulesets`, rulesetRequestBody(declared));
    } else {
      ghApiWrite("PUT", `repos/${REPO}/rulesets/${liveRuleset.id}`, rulesetRequestBody(declared));
    }
  }
  return changed;
}

function describe(diff) {
  return `${diff.path}: declared ${JSON.stringify(diff.declared)}, live ${JSON.stringify(diff.live)}`;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();
  const live = readLiveState(config);
  const plan = planGithub(config, live);

  if (plan.length === 0) {
    console.log("infra/github/github.toml and live GitHub state already match.");
  } else {
    console.log(`${plan.length} difference(s):`);
    for (const diff of plan) console.log(`  ${describe(diff)}`);
  }

  if (!opts.apply) return plan;

  const applied = [
    applyRepositoryPatch(config, live),
    applyActionsPermissions(config, live),
    applySecurityFixes(config, live),
    applyRulesets(config, live),
  ].some(Boolean);
  console.log(applied ? "Applied." : "Nothing to apply.");
  console.log(
    "Environment and repository variable/secret names are never created here; a missing one stays reported until it is set by hand.",
  );
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("github-sync failed:", err.message);
    process.exit(1);
  });
}
