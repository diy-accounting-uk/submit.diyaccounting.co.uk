---
name: companies-house-review
description: Review our Companies House accounts filings as the XML Gateway team reviews them, before any test or live submission goes to them. Builds each filed case, renders it, compares it with the Companies House example of the same type, runs the test validator, judges each criterion, and writes findings.md and walkthrough.md into target/companies-house-review/<date>/. Invoke when the operator says "companies house review", "review the accounts filings", "check the accounts before we resubmit", or asks for a walk-through of the review results.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# companies-house-review

The XML Gateway team (`xml@companieshouse.gov.uk`) reads each test submission as a person. They open the
rendered accounts, compare them with the published examples and the accounts schemas, and fail a
filing that a reader cannot use. This skill does the same review first, so we find what they would
find.

A run builds evidence into `target/companies-house-review/<YYYY-MM-DD>/`. `target/` is gitignored.
Never commit the evidence.

## What the XML team has told us

Their emails are the first source of criteria. Read them all on every run, because a new email can
add a criterion.

| Received | What it says |
|---|---|
| 7 Sep 2026 | Read and understand the technical interface specification (TIS) first. Test data "should closely resemble 'real life' data". Links the TIS page. |
| 11 Sep 2026 | Test presenter credentials. Submission numbers "have to be unique and incremental". Tell them when tests are submitted, so they can review them. |
| 24 and 25 Sep 2026 | Send the request and the response for any error. Sender ID and value must be MD5-hashed. |
| 8 Oct 2026 | Replacement test presenter credentials. |
| 23 Oct 2026 | Submission 000038 (micro-entity) failed: "missing significant data and also include information in the header and footer that should not appear. Please read the schemas for accounts carefully and follow the examples". Send 4 accounts test submission numbers for the next review. |

The credentials stay in the mail and in AWS Secrets Manager. Never copy them into this repository.

Find every email of theirs in the mail mirror:

```bash
MAIL="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/../mail/antony@diyaccounting.co.uk"
grep -rl -i "xml@companieshouse.gov.uk" "$MAIL" | sort | tee /tmp/xmlgw-mails.txt
```

Print the new text of each (quoted history cut):

```bash
for f in $(cat /tmp/xmlgw-mails.txt); do echo "######## $f"; python3 -I -c '
import sys, re, email
from email import policy
m = email.message_from_binary_file(open(sys.argv[1], "rb"), policy=policy.default)
print("From:", m["From"], "| Date:", m["Date"], "| Subject:", m["Subject"])
body = m.get_body(preferencelist=("plain", "html")).get_content()
out = []
for line in body.splitlines():
    if re.match(r"^(From:|-----Original|On .* wrote:)", line.strip()): break
    out.append(line)
print("\n".join(out)[:3000])
' "$f"; done 2>&1 | tee /tmp/xmlgw-mail-bodies.txt
```

Run both from this repository's root. The mirror can lag the mailbox by days. If the newest email
in the thread is not there, read it in the private repository's correspondence record:
`../private.diyaccounting.co.uk/companies-house/correspondence/TRIAGE_XMLGW_ACCOUNTS_2026-10-24.md`
quotes the failed review. `AX6_EXAMPLES_COMPARISON.md` beside it records which example facts we
added and which we left out, and why.

## Sources

Found on 2026-10-24. On every run, web-search each one for a newer version. Search "Companies House
technical interface specifications", "FRC taxonomy suite", "Companies House accounts data product"
and "HMRC XBRL guide". Use the newer version and update this table in the same change.

| Source | URL | Version found |
|---|---|---|
| TIS page (the XML team links it) | https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software | Page updated 21 Oct 2026 |
| Information for software developers (read first) | https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software/important-information-for-software-developers-read-first | Not versioned |
| General TIS | https://assets.publishing.service.gov.uk/media/66618d1d2aec9626ea8805c1/Companies_House_TIS_v5.3.odt | 5.3 |
| Accounts TIS (Electronic Filing of Inline XBRL Accounts, supplement to TIS) | https://assets.publishing.service.gov.uk/media/6ad89ab4b63982f71c3bd38c/TIS_October_2026.odt | 6.1, issued 20 Oct 2026 |
| Gateway schema status and envelope examples | http://xmlgw.companieshouse.gov.uk/SchemaStatus | Live list |
| Accounts envelope example (`Accounts.xml`) | http://xmlgw.companieshouse.gov.uk/examples/Accounts.xml | Carries a 2009 XBRL instance, not iXBRL: use it for the envelope only |
| Companies House test validator | https://test-validator.companieshouse.gov.uk/xbrl_validate | Live |
| Accounts Data Product (daily zips of filed iXBRL accounts: the examples) | https://download.companieshouse.gov.uk/en_accountsdata.html | Daily, last five weeks |
| FRC taxonomy suites | https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/frc-taxonomies/current-frc-taxonomy-suites/ | 2026 suite v1.0.0; draft 2027 suite out for consultation |
| FRC 2026 taxonomies page | https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/frc-taxonomies/current-uk-and-irish-digital-reporting-taxonomies/2026-uk-and-irish-digital-reporting-taxonomies/ | 2026 |
| FRS 102 entry point (micro-entities use it too) | https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd | 2026-01-01 |
| Business module: members of `AccountsTypeDimension`, `AccountingStandardsDimension` | https://xbrl.frc.org.uk/cd/2026-01-01/business/bus-2026-01-01-definition.xml and `bus-2026-01-01-label.xml` | 2026-01-01 |
| HMRC XBRL guide for UK businesses | https://www.gov.uk/government/publications/xbrl-guide-for-uk-businesses/xbrl-guide-for-uk-businesses | Updated 1 Apr 2026 |
| HMRC Inline XBRL style guide | https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/434588/xbrl-style-guide.pdf | 2.2 |
| Companies Act 2006, section 444 | https://www.legislation.gov.uk/ukpga/2006/46/section/444 | In force |

Read the accounts TIS as text:

```bash
mkdir -p target/companies-house-review/sources
curl -sSL -o target/companies-house-review/sources/tis-accounts.odt "<accounts TIS URL>"
unzip -o -q target/companies-house-review/sources/tis-accounts.odt content.xml -d target/companies-house-review/sources/
python3 -I -c 'import re,html;t=open("target/companies-house-review/sources/content.xml").read();t=re.sub(r"<text:(p|h)[^>]*>","\n",t);t=re.sub(r"<[^>]+>","",t);open("target/companies-house-review/sources/tis-accounts.txt","w").write(html.unescape(t))'
grep -n -i -E "mandatory|statement|AccountsType|micro|dormant|abridged" target/companies-house-review/sources/tis-accounts.txt | head -80
```

## The four cases and what each should declare

The cases are the accounts entries in `scripts/fixtures/companies-house-test-service-cases.json`.
Each `expectedOutcome.note` holds the submission number and the poll outcome. The script builds each
document with `extractAndValidateAccountsParameters` and `buildAccountsIxbrl`, as
`scripts/companies-house-test-service-run.js` did when it filed them.

| Case | `AccountsTypeDimension` | `AccountingStandardsDimension` | Other members | Statements on the balance sheet |
|---|---|---|---|---|
| Micro-entity | `FilletedAccounts` | `Micro-entities` | dormant false | s477, s476 members, directors' responsibilities, micro-entity provisions, s444(5) |
| Dormant micro-entity | `FilletedAccounts` | `Micro-entities` | dormant true, `EntityHasNeverTraded` | s480, s476 members, directors' responsibilities, micro-entity provisions, s444(5) |
| Small full (FRS 102 1A) | `FullAccounts` | `SmallEntities` | `SmallCompaniesRegimeForAccounts` | s477, s476 members, directors' responsibilities, small companies regime |
| Small filleted (FRS 102 1A) | `FilletedAccounts` | `SmallEntities` | `SmallCompaniesRegimeForAccounts` | s477, s476 members, directors' responsibilities, small companies regime, s444(5), s444(5A) |

Every case also carries the directors' approval line: the date, and the signing director as
`DirectorSigningFinancialStatements` on that director's `EntityOfficersDimension` member.

Where each row comes from:

- **AccountsType.** The business module defines six members of `AccountsTypeDimension`:
  `FullAccounts`, `AbridgedAccounts`, `FilletedAccounts`, `Branch`, `Foreign`, `Subsidiary`
  (`bus-2026-01-01-definition.xml`). The labels carry no definition text. The accounts TIS says
  abridged accounts use `AbridgedAccounts` with the section 444(2A) abridgement statement. It says
  nothing of filleted accounts. `FilletedAccounts` for accounts delivered without the profit and
  loss account is inference from the label and from the examples. In the 2026-10-23 Accounts Data
  Product zip, 2,854 micro-entity files use `FullAccounts` and 2,155 use `FilletedAccounts`. The
  micro example the script picks uses `FilletedAccounts`; the dormant example uses `FullAccounts`.
  Ask the XML team which member they expect, if a review leaves it open.
- **AccountingStandards.** The accounts TIS identifies micro-entity accounts by
  `AccountingStandardsApplied` = `Micro-entities`. The business module's verbose label for
  `SmallEntities` is "Small entities regime (Section 1A Small Entities of FRS 102)". Small accounts
  under FRS 102 section 1A therefore declare `SmallEntities`, and `FRS102` is for full FRS 102.
- **Statements.** The accounts TIS, "FRS unaudited micro-entity accounts", "FRS unaudited dormant
  accounts" and "FRS unaudited full (small company format) accounts", list the statements per type.
  "FRS unaudited accounts statements to the Balance sheet" gives the phrases each must contain. The
  script applies those phrase rules to the tagged statement facts.
- **Section 444.** Section 444(5): when the profit and loss account or the directors' report is not
  delivered, the balance sheet says the accounts were delivered under the small companies regime.
  The accounts TIS gives the wording: "prepared and delivered in accordance with the provisions
  applicable to companies subject to the small companies regime". Section 444(5A): the balance sheet
  also discloses that the profit and loss account is not delivered. Section 444(5C) lifts 444(5A)
  for accounts under the micro-entity provisions. So 444(5A) applies to small filleted only.
- **Director.** The accounts TIS makes `DirectorSigningFinancialStatements` mandatory. Every
  Accounts Data Product example puts it on the signing director's `EntityOfficersDimension`
  context (`Director1`, `Director3`), so the fact says which director signed.

## Which example goes with which case

The script picks each example from an Accounts Data Product daily zip. It takes the shortest
company file (no LLPs) on the 2026 taxonomy, then the 2025 taxonomy, that matches:

| Case | Example must carry |
|---|---|
| Micro-entity | `Micro-entities`, `FilletedAccounts`, not dormant |
| Dormant micro-entity | `Micro-entities`, dormant true |
| Small full | `SmallEntities`, `FullAccounts`, a tagged `ProfitLoss` |
| Small filleted | `SmallEntities`, `FilletedAccounts`, the section 444(5A) statement, `TotalInventories` |

Pair the small filleted case with a filleted example, never an abridged one. An abridged example
(`AbridgedAccounts`, with the members' section 444(2A) consent) is a different accounts type, and
its facts do not apply to filleted accounts. The comparison in `AX6_EXAMPLES_COMPARISON.md` used an
abridged file for the small filleted case.

To use a file you chose instead, pass `--example <fixture case name>=<path>`.

## Run

Steps 1 to 6 are Claude Code's. Run every command from this repository's root.

1. Web-search each source in the Sources table for a newer version. Update the table if one exists.
2. Read the XML team's emails with the two commands under "What the XML team has told us". Add any
   new criterion to the criteria list below and to `scripts/companies-house-review.mjs`.
3. Download the newest Accounts Data Product daily zip (about 90 MB):
   ```bash
   ZIP=$(curl -sS https://download.companieshouse.gov.uk/en_accountsdata.html | grep -o 'Accounts_Bulk_Data-[0-9-]*\.zip' | sort -u | tail -1)
   mkdir -p target/companies-house-review/adp
   test -f "target/companies-house-review/adp/$ZIP" || curl -sS -o "target/companies-house-review/adp/$ZIP" "https://download.companieshouse.gov.uk/$ZIP"
   echo "$ZIP"
   ```
4. Run the review. It posts each document to the Companies House test validator, which takes one
   to three minutes per case, so run it in the background:
   ```bash
   node scripts/companies-house-review.mjs --adp-zip "target/companies-house-review/adp/$ZIP" --date "$(date +%F)" 2>&1 | tee target/companies-house-review/run.log
   ```
   Add `--skip-validator` to judge without the network. If Chromium is missing, run
   `npx playwright install chromium` first.
5. Look. For each case directory, open `rendered.png` and `example.png` with the Read tool. Judge
   whether ours reads as printed accounts beside the example: a title page, a balance sheet with a
   label and both years on every line, the statements under it, the approval line, numbered notes,
   and nothing else. Replace `pending` in that case's "Look" row in `findings.md` with `pass` or
   `fail` and one line of what you saw.
6. Report the findings tables and the path of `walkthrough.md`. A walk-through for the operator
   follows `walkthrough.md` step by step, one file at a time.

## Criteria

The script judges each case on these rows. Each row in `findings.md` names its evidence file.

| Criterion | How the script judges it |
|---|---|
| Nothing of the iXBRL header is visible | The visible text has no taxonomy prefix, URI, ISO date or unit name (the pattern the browser test uses) |
| A readable balance sheet with labels and both years | Every balance sheet line with a figure has a label and a figure for both years |
| Nothing after the last note | The last page is "Notes to the financial statements" and nothing visible follows it |
| Every fact the example carries is in ours | Each concept the example tags is tagged in ours; `fact-comparison.md` lists the missing ones |
| Production software name and version | `NameProductionSoftware` and `VersionProductionSoftware` have values |
| The enumerated members | Each dimension in the table above has exactly the expected member; the example's member is shown beside it |
| `EntityDormantTruefalse` | `true` for dormant, `false` for the others |
| The test validator passes | `node scripts/validate-accounts-ixbrl.js <file>` prints `RESULT: valid` |
| iXBRL structure | `ixbrlStructureProblems` returns nothing |
| The statements for the type | The tagged statement contains the accounts TIS phrases; 444(5) and 444(5A) are found in the visible text |
| The directors' approval line | An "approved by the board" sentence, the visible date, `DirectorSigningFinancialStatements` on an officer member, and that officer's name visible |
| Look | The reviewer's judgement of the screenshots (step 5) |

A fail on "Every fact the example carries is in ours" needs judgement. A fact the example carries for
its own company (investments, a second director, an accountant's name) does not apply to our case.
Say which missing facts apply and which do not.

## The evidence directory

| File | What it is |
|---|---|
| `findings.md` | One table per case: criterion, result, evidence, evidence file |
| `walkthrough.md` | The files in the order the operator opens them, one line each |
| `<n>-<case>/filed.xhtml` | The document as filed, rebuilt from the fixture |
| `<n>-<case>/rendered.png` | Our document in headless Chromium, full page, 900 pixels wide |
| `<n>-<case>/visible-text.txt` | What a reader sees, as text |
| `<n>-<case>/facts.json` | Every tagged fact: concept, context, dimension members, value, hidden or visible |
| `<n>-<case>/example.xhtml`, `example.png`, `example-source.txt` | The Companies House example and where it came from |
| `<n>-<case>/fact-comparison.md` | Each example concept, present or missing in ours |
| `<n>-<case>/validator.txt` | The test validator's output |
| `<n>-<case>/submission.txt` | The submission number and poll outcome from the fixture |

The script rebuilds the documents from the current tree. If a builder changed after the filing, the
rebuilt document is the next filing, and the submission number belongs to the earlier one. Say so
in the report when `git log` shows a builder change after the submission date in the fixture note.
