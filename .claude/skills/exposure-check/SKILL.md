---
name: exposure-check
description: Check everything the business exposes publicly for keys in the rotation set, by key format and by an in-memory comparison with each live value, and write the findings to the private repository. Covers the full history of the public repositories, variables, GitHub records, Actions logs and artifacts, the deployed sites, the published npm packages, the public container images and the MCP as an unauthenticated client sees it. Invoke when the operator asks whether a key is exposed, after a key leak, after a rotation, or says "exposure check".
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability OPS-170 Check public surfaces for keys in the rotation set
- **Use when:** a key may be exposed on a public surface, after a key leak or a rotation, or when the operator asks for an exposure check.
- **Does:** exposure-check.mjs reads each live value from Secrets Manager into memory and streams every public surface past it in one process. It also matches the key formats of content-scan.mjs. It reports a key name, a location and a boolean, and writes only to the private repository.
- **Run:** `/exposure-check`; `EXPOSURE_CHECK_SIBLINGS=<workspace> node scripts/exposure-check.mjs --scratch <dir> --report <private path>`
- **Entry:** `.claude/skills/exposure-check/SKILL.md`; `scripts/exposure-check.mjs:main`; `scripts/lib/exposure-matcher.mjs:NeedleSet`
- **Files:** .claude/skills/exposure-check/SKILL.md, scripts/exposure-check.mjs, scripts/lib/exposure-matcher.mjs, scripts/content-scan.mjs, app/unit-tests/scripts/exposureMatcher.test.js, app/unit-tests/scripts/contentScan.test.js
- **Keywords:** exposure check, leaked key, secret scan, public surfaces, key format, rotation set, actions logs, source maps, value comparison
- **Related:** OPS-45, OPS-92
@end-capability -->

# exposure-check

**SSO check.** Before the first AWS call, and before any request that the operator log in, run
`aws --profile diya-submit-ci sts get-caller-identity` and `aws --profile diya-submit-prod sts
get-caller-identity` in the same turn. Ask for `aws sso login --sso-session diyaccounting` only when
one fails, and name the profile and the error. Never ask for a login from memory.

This skill answers one question: does a key in the rotation set appear on a public surface? The
inventory is section 2.1 and the formats are section 3.5 of
`../private.diyaccounting.co.uk/security/RUNBOOK_INFORMATION_SECURITY.md`.

## Rules

- No secret value reaches stdout, a log, a file, a tool result or a report. The script compares in
  one process and prints a key name, a location and a boolean.
- Do not put a value on a command line. Do not print a matched line to look at a hit. Read the
  location with the report's path and blob id, and judge it by its path, length and entropy.
- GitHub secrets cannot be read. The script uses the AWS copy of each value.
- The script makes reads only. It sends GET requests to public URLs at a low rate and reads the
  GitHub API. It does not use a key that it finds.
- The report goes to `../private.diyaccounting.co.uk/security/`. The script refuses any other path.
  A finding never goes in a public repository, a commit message or an issue.
- A run with `--with-hash-keys` reads `{env}/submit/user-sub-hash-salt` and
  `{env}/submit/email-hash-secret` once each, which fires the four `*-unexpected-read` alarms. The
  report names each read. A value lives only in the process, so a run that stops loses the read.
  Finish a full run without the flag first. Then use the flag once, and only if that run stopped
  no surface. Test a change without the flag.

## Steps

1. Check the SSO session: `aws --profile diya-submit-prod sts get-caller-identity`.
2. Prove a script change with `--no-values --limit 3`. This run reads no secret.
3. Start the full run in the background. It takes about two and a half hours. Add `--with-hash-keys` only as
   the Rules say.

   ```bash
   EXPOSURE_CHECK_SIBLINGS=/Users/antony/projects/diy-accounting-limited \
     node scripts/exposure-check.mjs \
     --scratch <scratchpad>/exposure \
     --report ../private.diyaccounting.co.uk/security/EXPOSURE_CHECK_<date>.md
   ```

4. Read the report. Sort each hit into a severity below.
5. Put the judgement, the coverage and one board row for each finding at the top of the report.
6. Commit that file alone in the private repository.
7. Add the board rows to `NEXT.md`. A live key goes first on the board. `NEXT.md` is public, so a
   row names the report, the finding id and the severity. It gives no surface, key or location.

## What each surface covers

| Surface | Reach |
|---|---|
| `git:*` | Every object of every ref GitHub advertises, pull refs included, and the last-seen `origin` refs of the checkout. Zip and gzip content is unpacked. |
| `variables` | Organisation, repository and environment variables. |
| `github-records:*` | Issues, pull requests, comments, review comments, commit comments, releases and release assets. |
| `logs:*` | Every retained run of the workflows in `SECRET_WORKFLOWS`. For each other workflow, the newest 5 runs and the oldest 2 retained runs. |
| `artifacts:*` | The artifacts of those runs, to `--artifact-budget-mb`. Nested zips are unpacked. |
| `site:*` | Up to 500 URLs for each site from its links, sitemap and source maps, `submit.env`, and API error bodies. |
| `mcp` | The OAuth metadata and the `/mcp` answer to an unauthenticated client. |
| `npm:*`, `github-npm:*` | Every published version. |
| `container:*` | The newest 4 tags and the oldest tag: config, manifests and every layer. |

A `canaryHits` counter above zero proves that the matcher reached the text of that surface. A
surface with no canary hits is not proven, so read its counters before you trust a clean result.

Keys with no AWS copy have a format check only: the GitHub App private key of the agent, the
fine-grained PAT, the support Gmail keys and the
`TEST_COMPANIES_HOUSE_*` values. The last of these have no format, so state them as not covered.
MCP tool output needs a signed-in client, which needs a test lane on ci. Until a lane is wired in
here, the hosted MCP test logs in `logs:*` give the only sight of that output.

## Severity

| Severity | Meaning | Action |
|---|---|---|
| Critical | A current value of a production key on a public surface | First on the board. Rotate by the runbook section for that key. Delete the public copy. |
| High | A current value of a sandbox, test or ci key, or a hash key in a retained log | Board row. Rotate, and delete the public copy. |
| High | A format match of a key type with no AWS copy, not a placeholder, that the path does not explain | Board row. The operator compares it at the issuer. |
| Medium | An `AWSPREVIOUS` value, when the old value still works at the issuer | Board row. Revoke the old value. |
| Low | An expired short-lived token, or a value that is not secret by the runbook | Board row only if the source keeps writing it. |
| None | A placeholder, an allow-listed value, the Drive Picker API key, or a vendor test fixture | Count it in the report. |

The `weak` column marks a value shorter than 12 characters. A weak hit can be chance, so check the
location before you give it a severity.
