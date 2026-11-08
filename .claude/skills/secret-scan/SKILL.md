---
name: secret-scan
description: Scan every workspace repository for committed and uncommitted secrets with gitleaks and trufflehog, over all local and origin branches, every worktree's uncommitted files and the private repository, and write the findings, without any value, to the private repository. Invoke when the operator asks for a secret scan, a history scan, or whether a key sits in any branch, or before a repository changes visibility.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability OPS-210 Scan every repository and branch for secrets
- **Use when:** the operator asks for a secret scan, or a key may sit in the history, an unpushed branch, an uncommitted file or the private repository.
- **Does:** secret-scan.mjs runs gitleaks over the full history of all local and origin branches of the six workspace repositories, gitleaks over each worktree's uncommitted files, and trufflehog without verification as a second detector. It reduces every record to rule, place, entropy and fingerprint before anything is written, honours each repository's .gitleaksignore, and refuses a report path outside the private security folder.
- **Run:** `/secret-scan`; `node scripts/secret-scan.mjs --workspace /Users/antony/projects/diy-accounting-limited --report ../private.diyaccounting.co.uk/security/SECRET_SCAN_<date>.md [--classes <json>]`
- **Entry:** `.claude/skills/secret-scan/SKILL.md`; `scripts/secret-scan.mjs:main`; `scripts/lib/secret-scan-report.mjs:shapeGitleaks`
- **Files:** .claude/skills/secret-scan/SKILL.md, scripts/secret-scan.mjs, scripts/lib/secret-scan-report.mjs, app/unit-tests/scripts/secretScan.test.js
- **Keywords:** secret scan, gitleaks, trufflehog, history scan, branches, worktrees, uncommitted files, gitleaksignore, private repository
- **Related:** OPS-170
@end-capability -->

# secret-scan

Prerequisites: `gitleaks` and `trufflehog` at `/usr/local/bin`.

## Rules

- Never verify a detected value with a vendor. trufflehog runs with `--no-verification`.
- Never print, log or write a value. Do not open a file to read the matched line. Judge a finding
  by its path, the lines around it that hold no value, its rule and its entropy.
- The report goes to `../private.diyaccounting.co.uk/security/SECRET_SCAN_<date>.md` only. The
  script refuses any other path. A finding never goes in a public repository, a commit message or
  an issue. `NEXT.md` rows name the report and the rule, never a location of a live key.
- Never write a `.gitleaksignore` into another repository from this scan. The report lists the
  proposed fingerprints for each repository. A session in that repository adds them.

## Steps

1. Run the scan in the background. It scans six repositories and takes several minutes.

   ```bash
   node scripts/secret-scan.mjs \
     --workspace /Users/antony/projects/diy-accounting-limited \
     --report ../private.diyaccounting.co.uk/security/SECRET_SCAN_<date>.md \
     --scratch <scratchpad>/secret-scan
   ```

2. Read `<scratchpad>/secret-scan/findings.json`. Each entry has the rule, repository, ref, commit,
   path, line, entropy and fingerprint.
3. Classify each finding as `real key`, `test fixture`, `example` or `false positive`. Use the path
   (a tests folder, a fixtures folder, documentation), the file's neighbouring lines that hold no
   value, and the rule. Write `{ "<fingerprint>": { "class": "...", "note": "..." } }` to a JSON
   file and run the script again with `--classes <file>`.
4. A `real key` goes to the `key-rotation` skill and to the top of the board. The board row names
   the report, the rule and the severity, with no location.
5. Accepted false positives are proposed as `.gitleaksignore` fingerprints in the report, one list
   for each repository. Hand them to a session in that repository.
6. Commit the report alone in the private repository.
