---
name: clean-unused
description: Audit the workspace repositories for GitHub Actions workflows and composite actions, files in scripts/, and npm scripts that nothing uses (remove) or that do the same job twice (combine). Every finding carries its evidence; nothing is removed until the operator agrees the list for that repository, then the removal lands as one PR per repository. Invoke when the operator says "clean unused", "find dead workflows", "unused scripts", "duplicate npm scripts", or asks what tooling can go.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-63 Find unused and duplicated workflows, scripts and npm scripts
- **Use when:** the operator asks which workflows, scripts or npm scripts are unused or duplicated, in any workspace repository.
- **Does:** clean-unused searches every reference path for each workflow, composite action, scripts/ file and npm script. It reads the last run, the rulesets and the git history. It proposes one table per repository of items to remove or combine, each with its evidence. Removal waits for the operator and lands as one PR per repository.
- **Run:** `/clean-unused`, or `/clean-unused <repository>`
- **Entry:** `.claude/skills/clean-unused/SKILL.md`
- **Files:** .claude/skills/clean-unused/SKILL.md
- **Keywords:** unused workflow, dead script, unused npm script, duplicate workflow, duplicate script, alias, consolidate, remove tooling, dead code
- **Related:** DEV-34, DEV-43
@end-capability -->

# clean-unused

`/clean` removes leftover state: deployments, branches, worktrees, logs, build output. This skill
audits the tracked tooling itself. It never touches state that `/clean` owns.

## Scope

Three item classes, in six repositories under `/Users/antony/projects/diy-accounting-limited/`:

1. **Workflows**: `.github/workflows/*.yml` and the composite actions in `.github/actions/*/`.
2. **Scripts**: every tracked file under `scripts/`.
3. **npm scripts**: the `scripts` object of each tracked `package.json`. The root one is the main
   target. Sub-packages (`mcp/package.json`, `cdk-typescript/package.json`,
   `diya-gl/package.json`) are in scope when a workflow or a script calls them.

| Repository | Workflows | scripts/ | npm scripts | Notes |
|---|---|---|---|---|
| `submit.diyaccounting.co.uk` | 83 + 15 actions | 200 | 395 | Split the audit by class |
| `spreadsheets.diyaccounting.co.uk` | 15 | 30 | 97 | |
| `www.diyaccounting.co.uk` | 3 | 14 | 60 | |
| `root.diyaccounting.co.uk` | 4 | 7 | 15 | Ruleset disabled |
| `homebrew-diya-gl` | 1 | 1 | none | Read with `gh api`; the local checkout can be behind |
| `diy-accounting-archive` | 3 | 13 | 68 | Archived by convention: report, propose lightly |

`private.diyaccounting.co.uk` has none of the three classes. Search it as a referrer only: its
live runbooks name operator workflows and scripts.

## The two findings

- **A. Unused: remove.** Nothing in any repository, ruleset, schedule or runbook reaches the item,
  and its last run (for a workflow) is old or absent.
- **B. Duplicated: combine.** Two or more items do the same job. Keep one, delete or parameterise
  the others, and move every caller to the one kept. Same-job copies across repositories are a
  proposal only, because each repository must stand alone.

## Ground rules

- Read-only until the operator agrees. Never stash, reset, `checkout --` or clean a tree.
- Audit `origin/main`, not the local checkout. Run `git -C <repo> fetch origin` first. Read files
  with `git -C <repo> show origin/main:<path>` and search with `git -C <repo> grep <pattern>
  origin/main --` when the checkout is behind (`git -C <repo> rev-list --count HEAD..origin/main`).
- Tee every piped command to a file in the session scratchpad before a filter.
- Run loops under `bash`. The session shell is zsh, and `rg` is a shell function that a `bash -c`
  script cannot see. Use `git grep` inside scripts.
- Run each repository's CLAUDE.md rules. In the archive, report only unless the operator says
  otherwise.

## 1. Build the reference index

A name search per item is slow and misses cross-repository callers. Build one token index over
the tracked files of all seven repositories, then look each item up. Write this to the scratchpad
as `refs.cjs` and run `node refs.cjs <repository-directory>`:

```js
// Prints, per item, the files that name it, grouped by repository and referrer kind.
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const ROOT = "/Users/antony/projects/diy-accounting-limited";
const REPOS = ["submit.diyaccounting.co.uk", "spreadsheets.diyaccounting.co.uk", "www.diyaccounting.co.uk",
  "root.diyaccounting.co.uk", "homebrew-diya-gl", "diy-accounting-archive", "private.diyaccounting.co.uk"];
const target = process.argv[2];
const SKIP = /(^|\/)(node_modules|target|packages|dist|cdk\.out)\/|package-lock\.json$|REPORT_CAPABILITIES\.md$|\.(png|jpe?g|gif|webp|mp4|pdf|xlsx?|zip|ico|woff2?|ttf|od[ts]|docx|gz|jar)$/i;
const index = new Map();
for (const repo of REPOS) {
  for (const f of execSync(`git -C ${ROOT}/${repo} ls-files`, { maxBuffer: 1e8 }).toString().split("\n").filter(Boolean)) {
    if (SKIP.test(f)) continue;
    let text; try { const p = path.join(ROOT, repo, f); if (fs.statSync(p).size > 2e6) continue; text = fs.readFileSync(p, "utf8"); } catch { continue; }
    for (let t of text.match(/[A-Za-z0-9_.:@-]+/g) || []) { t = t.replace(/[.:]+$/, ""); if (t.length < 3) continue;
      if (!index.has(t)) index.set(t, new Set()); index.get(t).add(repo + "\t" + f); }
  }
}
const kind = (repo, f) => (repo === target ? "" : repo.split(".")[0] + ":") + (
  f.startsWith(".github/workflows/") ? "wf" : f.startsWith(".github/actions/") ? "action" : f.startsWith(".github/") ? "ghdata"
  : f.startsWith(".claude/") ? "skill" : /(^|\/)package\.json$/.test(f) ? "pkg" : f.startsWith("scripts/") ? "script"
  : /(unit-tests|system-tests|browser-tests|behaviour-tests|test)\//.test(f) || /\.test\.[cm]?js$/.test(f) ? "test"
  : /\.md$/.test(f) ? "doc" : /\.java$/.test(f) ? "java" : /Dockerfile|^\.githooks\//.test(f) ? "hook/docker" : "code");
function emit(cls, item, token, self) {
  const out = {};
  for (const key of index.get(token) || []) { const [repo, f] = key.split("\t"); if (repo === target && self.includes(f)) continue; (out[kind(repo, f)] ||= []).push(f); }
  const s = Object.entries(out).sort().map(([k, v]) => `${k}=${v.length}`).join(" ") || "NONE";
  const d = Object.entries(out).sort().map(([k, v]) => `${k}[${v.slice(0, 4).join(",")}]`).join(" ");
  console.log([cls, item, s, d].join("\t"));
}
const T = path.join(ROOT, target), ls = (p) => execSync(`git -C ${T} ls-files ${p}`).toString().split("\n").filter(Boolean);
for (const f of ls(".github/workflows")) emit("workflow", path.basename(f), path.basename(f), [f]);
for (const a of new Set(ls(".github/actions").map((f) => f.split("/")[2]))) emit("action", a, a, ls(`.github/actions/${a}`));
for (const f of ls("scripts")) emit("script", f, path.basename(f), [f]);
if (fs.existsSync(path.join(T, "package.json"))) {
  const scripts = JSON.parse(fs.readFileSync(path.join(T, "package.json"), "utf8")).scripts || {};
  for (const name of Object.keys(scripts)) {
    const callers = Object.entries(scripts).filter(([k, v]) => k !== name && (v.match(/[A-Za-z0-9_.:@-]+/g) || []).includes(name)).map(([k]) => k);
    emit("npm", name + (callers.length ? `  (called by ${callers.join(",")})` : ""), name, ["package.json"]);
  }
}
```

It runs in about six seconds per repository. `NONE` means no tracked file in the estate names the
item. That is the start of the evidence, not the end. The referrer kinds decide what to check
next:

- `wf`, `action`, `pkg`, `script`, `code`, `java`, `hook/docker`, `ghdata`: a machine caller. Open
  it and confirm that the hit is a call, not a comment or a step id with the same text.
- `test` only: the item exists for its test. A script that only its own unit test imports is a
  candidate. A test that asserts a workflow's inputs is not a caller.
- `doc` and `skill` only: an operator tool or a stale mention. Go to section 3.
- `private:doc` under `engineering/**/archive/` is history, not use. A live `RUNBOOK_*.md`,
  `security/` or `operator/` document is a use.

The index splits on `/`, so it matches basenames. A cross-repository hit on a common basename
(`deploy.yml`, `test.yml`, `update-java.sh`, `cdk:diff`, `formatting:js`) is usually the other
repository's own copy. Count it only when the text names this repository.

## 2. Find the indirect references

Run these per repository. Each one has hidden a real caller in this estate.

**Workflow triggers.** A workflow with `schedule`, `push`, `pull_request`, `issues`, `delete`,
`workflow_run` or `repository_dispatch` runs without a caller. List triggers with the `yaml`
package that submit already has:

```bash
node -e 'const y=require("/Users/antony/projects/diy-accounting-limited/submit.diyaccounting.co.uk/node_modules/yaml"),fs=require("fs"),d=process.argv[1]+"/.github/workflows";
for(const f of fs.readdirSync(d)){const w=y.parse(fs.readFileSync(d+"/"+f,"utf8"));const on=w.on??w[true];
console.log(f,"|",w.name,"|",typeof on=="string"?on:Object.keys(on||{}).join(","),"|",JSON.stringify(on?.workflow_run?.workflows??""))}' <repo-dir> | tee "$SCRATCH/triggers.txt"
```

- `workflow_run` names the other workflow by its `name:`, not its file name. Search the `name:`
  value too. In submit, `probe-failure-issue.yml` watches `probe-test` and
  `video-capture-on-deploy.yml` watches `deploy`.
- `repository_dispatch` comes from another repository. `spreadsheets` `publish-diya-gl.yml` posts
  `diya-gl-published` to `homebrew-diya-gl/dispatches`, and `update-formula.yml` on
  `homebrew-diya-gl` `origin/main` listens for it.
- `push`/`pull_request` `paths:` filters can make a workflow rare. That is not disuse.

**Reusable workflows and actions.** `uses: ./.github/workflows/<file>` and
`uses: ./.github/actions/<name>`. `git grep -n 'uses: \./\.github/' origin/main -- .github`.

**Dispatches from code and text.** `git grep -n -E 'gh workflow run [a-z0-9.-]+'` across scripts,
skills, docs and workflows. In submit, `deploy-finish.yml` dispatches others. `app/data/alarm-remedies.json`
maps alarm families to remedy workflows, and `app/lib/consoleLinks.js` builds workflow links.

**Rulesets.** A workflow whose job name is a required status check is in use, with no reference
anywhere in the code:

```bash
for id in $(gh api repos/diy-accounting-uk/<repo>/rulesets --jq '.[].id'); do
  gh api repos/diy-accounting-uk/<repo>/rulesets/$id \
    --jq '"\(.name) \(.enforcement): " + ([.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context]|join(", "))'
done
gh api repos/diy-accounting-uk/<repo>/branches/main/protection --jq '.required_status_checks.contexts'
```

Submit's `main` ruleset requires: Check commit signatures, npm test, maven test, eslint, CodeQL,
content scan, merge gate. No sibling ruleset requires a check. Branch protection is off in every
repository (404).

**Composed npm script names.** A workflow can build the name from a matrix or an input, so the
full name appears nowhere:

```bash
git grep -n -E 'npm run [^ ]*(\$\{\{|\$\{|\$[A-Za-z])' origin/main -- .github scripts .claude | tee "$SCRATCH/composed.txt"
```

Expand each hit by hand from its source list. In submit:

| Pattern | Source of the parts |
|---|---|
| `test:${suite}-${env}` in `probe-test.yml` | `.github/behaviour-probe-suites.json` (from `deploy.yml`, with `ciOnly` dropping prod); the `behaviour-test-suite` choice list of `probe-test.yml`; the scheduled prod matrix `submitVatBehaviour`, `tokenRefreshBehaviour`; env = ci or prod |
| `npm run ${{ matrix.script }}` in `test-behaviour.yml` | `.github/behaviour-simulator-suites.json` (`script` field) |
| `accessibility:*-${env}`, `penetration:zap-${env}`, `compliance:${env}-report-md` in `compliance.yml` | env = ci or prod |
| `test:authBehaviour-${env}`, `test:submitVatBehaviour-${env}` | printed by `scripts/enable-cognito-native-test.js` |
| `test:${suite}-${lane}` from `npm run test:behaviour -- <suite> <lane>` | `scripts/run-behaviour.mjs` line 58; suite and lane come from the caller's arguments |

In `www`, `deploy.yml` runs `test:gatewayBehaviour-${env}`.

**npm hooks and chains.** `pre<name>`/`post<name>` run without a reference (`pretest`,
`prepare`, `postinstall`, `prestart`, `prepack`). Other scripts call a script by name; the index
prints those as `called by`. `npm test` and `npm start` reach `test` and `start`.

**Git hooks and Dockerfiles.** Every repository except homebrew sets `core.hooksPath` to
`.githooks`. Submit's hooks call `.githooks/secret-scan.sh` only. Spreadsheets' `pre-push` calls
`scripts/test-scope.mjs`, which routes changed paths to npm scripts by name. Submit's `Dockerfile`
and `mcp/Dockerfile` copy no `scripts/` file.

**Code that imports scripts.** `git grep -l -E "(\.\./)+scripts/" origin/main -- app web infra mcp behaviour-tests`.
Behaviour helpers and `infra/google`, `infra/microsoft` import from submit's `scripts/`.
`scripts/migrations/runner.js` loads every file in `scripts/migrations/` by listing the folder,
so a migration file has no name reference.

**GitHub conventions by file name.** `copilot-setup-steps.yml` is read by the Copilot coding agent.
`dependabot.yml`, `CODEOWNERS` and CodeQL configs are read by GitHub. None needs a caller.

**Claude allowlists.** `.claude/settings.json` and `.claude/settings.local.json` permit commands
such as `Bash(npm run test:*)`. That is weak evidence of hand use, not proof.

## 3. Gather usage evidence

**Last run of a workflow.**

```bash
gh run list --repo diy-accounting-uk/<repo> --workflow <file> --limit 1 \
  --json createdAt,event,conclusion --jq '.[0]|"\(.createdAt[0:10]) \(.event) \(.conclusion)"'
gh api repos/diy-accounting-uk/<repo>/actions/workflows --paginate --jq '.workflows[]|select(.state!="active")|.path+" "+.state'
```

A reusable workflow (`workflow_call` only) shows no runs under its own file. Its runs belong to
the caller. Read the caller's runs instead. For a composed npm name, read job names:
`gh api repos/diy-accounting-uk/<repo>/actions/runs/<id>/jobs --jq '.jobs[].name'`.

**Age of the file.** `git -C <repo> log --diff-filter=A --format=%cs -- <path> | tail -1` (created)
and `git -C <repo> log -1 --format='%cs %s' -- <path>` (last change). A workflow created in the
last 60 days with no run yet is new, not unused.

**Capability entries.** `grep -n '<name>' REPORT_CAPABILITIES.md` (submit, covers spreadsheets
under `SS-*`). The index skips this generated file and the item's own header. A capability entry
says the item is a documented tool. It is not proof of use. Removing the item also removes or
edits its `@capability` header and its slot line in `_developers/capabilities/skeleton.md`, then
`npm run capabilities:generate`.

## 4. Evidence rules

**Proof of unused (class A, propose removal):** all of these hold.

- The index shows no machine caller in any repository, after the basename check.
- No trigger runs it by itself (schedule, push, pull_request, issues, delete, workflow_run,
  repository_dispatch), or the trigger can no longer fire.
- No ruleset requires its job name.
- No composed name or folder listing reaches it.
- No live runbook or skill tells a person or a session to run it.
- For a workflow: no run in 180 days, and the file is older than 60 days.

**Candidate only (list it, mark the risk, do not propose removal without the operator's view):**

- Reached only by a hand dispatch, a live runbook or a skill.
- Reached only by a `workflow_dispatch` choice option (for example a `-prod` variant of a `ciOnly`
  suite, reachable by `probe-test.yml` with `environment-name=prod`).
- A generator of a committed file, run by hand when the input changes.
- Reached only by its own unit test.

**Proof of a duplicate (class B):** show the two side by side.

- Workflows: diff the jobs after you normalise names, ids and inputs. Report the shared steps and
  the real differences.
- Scripts: `git hash-object` equal, or the same inputs, outputs and side effects under two names.
- npm scripts: identical values, a value that is one `npm run <other>`, or a family that differs
  only by an environment token and could take an argument. Count a family, then judge whether a
  composed caller needs every member by name.
- Across repositories: equal blob hashes (`git -C <repo> ls-files -s .github scripts .githooks`)
  or the same basename with drifted content. Propose a shared source; never remove one side.

## 5. False-positive traps in this estate

- **Rare by design.** Key and certificate rotation, restore drills, GDPR erasure and subject
  access (`delete-user-data*.yml`, `export-user-data.yml`: never run, legally required), holding-page
  failover (`deploy-holding.yml` in root and spreadsheets), account setup
  (`setup-backup-account.yml`, `scripts/aws-accounts/*`), HMRC and Companies House approval runs
  (`hmrc-ets-ct600*.yml`). An old last run is expected.
- **Scheduled monthly or quarterly.** `ai-vendor-ranges.yml`, `compare-prices-check.yml`,
  `listings-check.yml`, `email-hash-rotate.yml`, `mcp-blob-key-rotate.yml`, `restore-drill.yml`.
  New ones show no run yet.
- **Required checks with no code reference.** `merge-gate.yml` and `content-scan.yml` in submit.
- **Skill-dispatched.** `/watch` dispatches `runner-install-check.yml`; `/fast-deploy` names
  `deploy-cdk-stack.yml`; `/key-rotation` names `rotate-secret.yml` and `rotation-check.yml`. Grep
  `.claude/skills/**` in submit and spreadsheets, and the workspace-root `.claude/skills/`.
- **Composed npm names.** About 205 of submit's 395 npm scripts fall in 58 families of
  `<name>-<env>`. Most `test:<suite>-ci` and `-prod` names have no literal reference and are in use.
- **Generators of committed data.** `scripts/write-video-books.js` (writes `videos/books/`),
  spreadsheets `scripts/generate-frc-taxonomy-concepts.mjs` (writes `app/data/frc-taxonomy/`).
- **Same text, other meaning.** A step id `set-origins` or `get-names` in a sibling workflow is not
  the submit action of that name.
- **Stale local checkout.** `homebrew-diya-gl` local `main` was 61 commits behind `origin/main`;
  the local file still showed the old hourly `schedule`.
- **Workflow tests.** `app/unit-tests/*Workflow.test.js` assert a workflow's shape. They make the
  file look used and must be deleted with it.
- **README script table.** Submit's `README.md` holds a table generated by `npm run scripts:table`;
  `app/unit-tests/scriptsTable.test.js` fails until it is regenerated after a removal.

## 6. Repository hints

**submit.** Search `.github/` (workflows, actions, `behaviour-*-suites.json`,
`alarm-remedies` map in `app/data/`), `scripts/`, `package.json`, `app/`, `web/`, `infra/` (Java
CDK and the `infra/<vendor>/` sync scripts), `behaviour-tests/`, `mcp/`, `.githooks/`,
`.claude/skills/`, `_developers/`, `README.md`, `REPORT_CAPABILITIES.md`, and the private
repository's runbooks. Eight workflows are `workflow_call` only (`deploy-build`,
`deploy-env-image-stack`, `deploy-env-secrets`, `deploy-finish`, `deploy-stacks`, `test-behaviour`,
`test-cdk`, `test-unit`) and show no runs. Candidate duplicate pairs to judge: `hmrc-ets-ct600.yml` and `hmrc-ets-ct600-page.yml` (script
against page channel); `delete-user-data.yml` and `delete-user-data-by-email.yml`.

**spreadsheets.** Search `.github/`, `scripts/` (with `test-scope.mjs` routing), `package.json`,
`diya-gl/package.json`, `app/`, `.githooks/pre-push`, `.claude/skills/`, `GITHUB_SETUP.md`. The four
`generate-*.yml` are called by `init.yml`, `generate-all.yml` and `deploy.yml`. `init.yml` repeats
`generate-all.yml` and adds a clean job and two dispatches. Identical npm values: `build` and
`generate`; `penetration:ci` and `penetration:prod`.

**www.** Three workflows; `deploy.yml` composes `test:gatewayBehaviour-${env}`. The
`penetration:*`, `compliance:*`, `formatting:*` families are copies of the spreadsheets set.

**root.** `deploy.yml` and `deploy-holding.yml` are dispatch-only by design. `deploy-holding.yml`
calls `scripts/cloudfront-aliases.sh`. `scripts/aws-accounts/*` are one-off account tools named
in docs.

**homebrew-diya-gl.** One workflow, one script. Read `origin/main` with `gh api
repos/diy-accounting-uk/homebrew-diya-gl/contents/<path>` or `git show origin/main:<path>`.

**diy-accounting-archive.** `test.yml` and `generate-bst.yml` stay enabled by design. Report
`NONE` items; propose removal only when the operator asks.

**Copied across repositories.** `.githooks/secret-scan.sh` and `pre-commit` (five copies, equal),
`scripts/check-action-pins.mjs`, `scripts/check-commit-identities.sh`, `identity-guard.yml`,
`scripts/validate-workflows.sh`, `scripts/update-java.sh`, `scripts/generate-compliance-report.js`,
`scripts/text-spacing-test.js`, `scripts/indexnow-submit.mjs`,
`scripts/watch-ci.sh`, `scripts/worktree-add.sh`.

## 7. Proposal shape

One section per repository. One table per class, at most six columns:

| Item | Class | Evidence | Action | Risk |
|---|---|---|---|---|
| `test:example-prod` | A | no reference; not in any suite list | remove | low |
| `init.yml` | B | repeats `generate-all.yml` plus clean | add a `clean` input to `generate-all.yml`, remove `init.yml` | medium |

- **Evidence** names the commands that showed it: the index result, last run, created date,
  ruleset, composed sources.
- **Action** is remove, combine into `<kept>`, parameterise, or keep (with the reason).
- **Risk** is low (no caller, no trigger), medium (hand use possible, or a caller must change), or
  high (rare-by-design, compliance, or production path).
- After the tables, list the callers each combine must change, and the tests, capability headers,
  README table and docs that change with each removal.
- List candidates separately from proven items.

## 8. Agree, then remove

1. Show each repository's tables in the main chat.
2. Wait for the operator to agree each list, item by item where he says so.
3. Land the agreed removals as one PR per repository, on a `claude/<ns>-unused` branch. Change
   every caller, test, capability header, skeleton slot, README table and doc in the same PR.
4. Run the repository's full test command before the push, and `npm run capabilities:check` in
   submit.
5. Merge only through `/auto-merge`.
