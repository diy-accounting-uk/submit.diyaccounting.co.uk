# Fraud prevention header email check

HMRC's Transaction Monitoring team emails a monthly fraud-prevention-header report to
`antony@diyaccounting.co.uk`, reporting on the previous calendar month. `scripts/fraud-header-email-check.js`
reads the newest one out of the gyb mail mirror (`mail/INDEX.tsv` at the workspace root), parses
it with `app/lib/fraudPreventionHeaderReport.js`, and posts an activity event to the operational
Telegram chat (via `publishActivityEvent`) for any month that isn't a plain "correct": advisories,
errors, zero traffic, or a report that never arrived past the 10th. A correct month posts nothing.
Each run's decision is recorded as JSON in `data/compliance/fraud-prevention-headers/<YYYY-MM>.json`.

A launchd agent template (`scripts/co.uk.diyaccounting.submit.fraud-header-check.plist`) runs it
on the 5th and 12th of each month; see `_developers/SETUP.md` step 9 for install/uninstall and
the AWS profile the alert needs.

What remains: a compliance panel that reads the `data/compliance/fraud-prevention-headers/`
records — nothing in this repo builds or serves one yet.
