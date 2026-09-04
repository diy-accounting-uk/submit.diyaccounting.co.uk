# Archived Cowork briefs

Three closed briefs moved here from the workspace root on 2026-09-04. The live operator brief is `../../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root. Nothing below is outstanding; do not re-run any of it.

---

<!-- archived from COWORK_BRIEFING_CONSOLE_TASKS.md -->

# Cowork briefing: three console tasks — COMPLETE

Status: **all three tasks closed, 2026-08-31** (briefing written 2026-08-30 22:31).

Worked through in a Cowork session with the operator driving an embedded browser. This file is
kept rather than deleted because several of its instructions were wrong in ways worth
recording — one of them would have destroyed production data.

Do not re-run this briefing. Outcomes and corrections below; full detail in `INBOX.md`.

---

## Task 1 (B14): GA4 service-account credential — DONE

| | |
|---|---|
| Project | `diyaccounting-ga4` (958354756046), org diyaccounting.co.uk |
| API | Google Analytics Data API enabled |
| Service account | `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com`, no project roles |
| GA4 access | Viewer on property 523400333 |
| Key | created, filed at `~/projects/diy-accounting-limited/ga4-service-account.json` |

**Correction to step 1.** The briefing said to create a project as though none existed. Three
already did: `gyb-project-j7e-1uj-8n2`, `diy-accounting-submit`,
`diy-accounting-s-1611245774202`. A new dedicated project was still the operator's choice, but
the instruction should have said "check what exists first".

**Still owed by Claude Code**: set `GA4_SERVICE_ACCOUNT_JSON` in the `ci` and `prod` GitHub
environments, then delete the local key file.

## Task 2 (B9/B9a): support@ auto-reply — DONE

Set to **off** and saved, verified after reload. The operator chose off over a
sender-filtered responder: the mailbox is answered by a human now, so an auto-reply adds
nothing. Gmail retains the message text, so it can be revived.

**Correction: the setting is called "Out-of-Office AutoReply"**, not "Vacation responder".
Searching Settings for the briefing's wording finds nothing.

**Correction: there is no GitHub link in that responder.** B9's premise — replace a dead
GitHub link — does not match what was configured. The dead link is somewhere else, or the
backlog row is wrong. B9's link half is NOT done; find where that link actually lives.

**What the briefing did not know.** The responder had been on since **27 January 2023** with
no end date, both recipient filters unchecked (hence B9a), and its closing line read: *"this
address, support (at) diyaccounting.co.uk, is no longer staffed or monitored for queries."*
Every customer who wrote in for three and a half years was told the support address was
unstaffed — including in the period the mailbox was cleared from 726 messages to zero and
answered same-day.

**Not verified**: the briefing's step 4 asked for a test email. Sending mail was out of scope
for this session. Worth one test message to confirm nothing auto-replies.

## Task 3 (B19): analytics console work — DONE

### 3a GA4

**BigQuery daily export — linked.** Project `diyaccounting-ga4`, data location **London
(europe-west2)**, all 3 streams, no events excluded, advertising identifiers off, Daily only,
user-data export deliberately off. Dataset `analytics_523400333` expected ~24h after linking.

The default data location was **United States**; it is permanent once set. The briefing did
not mention this. It should.

Billing was attached to the project afterwards so BigQuery leaves sandbox and tables no longer
expire after 60 days. `Query usage per day` quota reduced from 200 TiB to 10.24 GiB as a hard
stop that preserves stored data. A £5/month alerts budget covers the billing account.

**Key events — resolved, nothing to do.** `purchase` was *already* a key event.
`begin_checkout` **cannot** be marked: GA4 only lists events received in the last 28 days and
offers no way to pre-register a name. Blocked on the collection fault below.

**Retire stream `G-PJPVQWRWJZ` — DO NOT DO THIS. The instruction is dangerous.**

That measurement ID is not in property 523400333. Per
`submit.diyaccounting.co.uk/google-analytics.toml` it is stream `5793048524` in a separate old
property, "http://www.diyaccounting.co.uk - GA4". Property 523400333 contains three streams and
all three are current:

| Stream | Measurement ID |
|---|---|
| Gateway — diyaccounting.co.uk | G-C76HK806F1 |
| Spreadsheets | G-X4ZPD99X2K |
| Submit | G-T81V5NL5MB |

Followed literally, the step walks you into a stream list where every entry is live. Its own
safety check — "delete the one without recent traffic" — would have selected a **production**
stream, because two of the three show no traffic. `PLAN_GA4.md` also conditions retirement on
the new streams showing comparable traffic, which has not happened. This step needs rewriting,
not retrying.

### 3b Google Ads — resolved, nothing running

Both accounts are **Cancelled**: `756-104-9736` and `937-869-0831` (DIY Accounting). Neither
can be opened. Thirteen months of Google billing mail contains Workspace invoices only and no
Ads invoice, so no campaigns, no spend, no residual balance.

Per the briefing's own branch, this becomes code work: remove the conversion tag for ID
`1065724931` from the sites, and update `google-analytics.toml`'s `[legacy]` section, where
`google_ads_status = "Check if campaigns still active"` is now answered.

### 3c Stripe — DONE

Reports → Balance summary → Schedule. **Two** reports are schedulable, not one; both set to
Monthly, columns All, to antony@diyaccounting.co.uk, Europe/London:

- Itemised balance change from activity
- Itemised payouts

The briefing named only "a monthly balance report". Both were taken because together they are
what the current-year workbook needs: what came in, and what reached the bank.

---

## The finding that outranks every task in this briefing

**GA4 has received nothing from two of the three sites in 28 days.** Every event in property
523400333 — `first_visit`, `login`, `page_view`, `scroll`, `session_start`, `user_engagement` —
comes from the Submit stream alone. Gateway and Spreadsheets have sent zero, not one page view,
while customers demonstrably downloaded packages that week.

The tracking code exists in both repos (`spreadsheets/.../lib/download-page.js`,
`donate-page.js`, `submit/web/public/hmrc/vat/submitVat.html`), so this is a delivery or
configuration fault, not missing instrumentation.

Consequence: B14's credential and 3a's export are both correct and will report Submit and two
empty tables. **Fixing collection outranks any further pipeline work.**

## Correction the briefing needs if it is ever reused

It does not say that its three tasks need three different sign-ins: tasks 1 and 3a/3b as
`antony@diyaccounting.co.uk`, task 2 as `support@diyaccounting.co.uk`, task 3c as Stripe. That
cost a session's worth of confusion. State it at the top.

---

<!-- archived from BRIEF_GA4_CONSOLE_B19.md -->

# Brief: GA4 console work (backlog item B19)

**STATUS: CLOSED 2026-08-31. All five tasks settled — four done, task 4 withdrawn by operator
decision. Nothing here is outstanding for a Cowork session; do not re-run it.**

| # | Task | Outcome |
|---|---|---|
| 1 | GA4 data export | **Done** 2026-08-30. Property 523400333 → `diyaccounting-ga4`, daily, London (europe-west2), 3 streams. Billing attached so BigQuery is out of sandbox; query quota 10.24 GiB/day; £5/month budget. |
| 2 | Schedule the Stripe report | **Done** 2026-08-31 — in the **Stripe dashboard**, not GA4 (it is not a GA4 feature). Two monthly reports: itemised balance change from activity, and itemised payouts. No repo-side fallback needed. |
| 3 | Mark conversions | **Done** 2026-08-31. `purchase` was already a key event; `begin_checkout` became markable only once the consent banner restored collection, and is now marked. |
| 4 | Retire the old stream | **Withdrawn** by operator decision 2026-08-31, on the evidence below. Do not delete the stream. |
| 5 | Stale remarketing tag | **Done** — confirmed dead. Both Ads accounts cancelled; tag loads on no page. |

## Task 4: why it was withdrawn rather than done

The old property is **395628828**. Note `google-analytics.toml` records `5793048524` under
`[old_property]` as `stream_id` — that is the stream, not the property; reading it as a
property id sends you to a "Missing permissions" error that looks like an access problem and
is not.

- **Last 7 days: zero.** 0 active users, 0 events, 0 key events, 0 new users, 0 sessions.
  Realtime 0.
- The only positive signal is the Events admin page flagging `page_view` and `session_start`
  as having a stream active "in the last 28 days" — a marker that survives a few hits earlier
  in the window.
- **`G-PJPVQWRWJZ` is on no page in any repository**, including `diy-accounting-archive`. It
  appears only in `google-analytics.toml`, `PLAN_GA4.md` and `NEXT.md` as reference text.
- `https://www.diyaccounting.co.uk/` redirects to the apex, which serves the new Gateway site
  with `G-C76HK806F1`.
- **The brief's premise that it "double-counts against the new streams" is wrong.** It is a
  separate property, and GA4 properties do not aggregate. Nothing in 523400333 was ever
  inflated by it.

So there is nothing to stop and no cost to remove, while deleting the stream would discard the
old site's history. Leave it.

## Remainders, and whose they are

**Claude Code (submit session):**
- `google-analytics.toml` `[legacy]`: `google_ads_status = "Check if campaigns still active"`
  is answered — both accounts cancelled, verified 2026-08-31.
- `google-analytics.toml` `[old_property]`: add the property id 395628828 alongside the stream
  id, and record that retirement was withdrawn.
- Close B14a and B19; finish `PLAN_GA4.md`, including deleting its stale "cookie consent
  banner" open row.

**Watch, not act:** `purchase` still reads "No stream data detected" property-wide. Expected if
no paid flow has completed since collection was restored, but confirm rather than assume once
the funnel has run a few days.

## B14a — verified early, close it

Assigned in the original brief to Claude Code from ~2026-09-01. Already provable. GA4 Events →
Recent events, property 523400333, last 28 days:

| Event | Streams active |
|---|---|
| `page_view`, `scroll`, `session_start`, `user_engagement` | **3 streams** |
| `first_visit` | 2 streams |
| `select_content` | **Gateway** |
| `begin_checkout`, `view_item` | **Spreadsheets** |
| `form_start`, `login` | Submit |

Gateway and Spreadsheets are both collecting. The consent diagnosis was correct and the fix
works.

---

*Original brief follows unchanged, for the record.*

---


For the Cowork session driving the Google consoles in its browser, with the operator
signed in. Written 2026-08-31 by the Claude Code submit session. Report back via
`INBOX.md` at this workspace root, addressed `to: claude-code-submit`.

## Context

B19 is the operator-side remainder of `submit.diyaccounting.co.uk/PLAN_GA4.md`. Every
code-side prerequisite has shipped: the consent banner is live on all three sites
(2026-08-31), the ecommerce events (`purchase`, `begin_checkout` and friends),
cross-domain tracking and CSP headers are in place. The GA4 property is
**"DIY Accounting", id 523400333**, with three data streams (gateway, spreadsheets,
submit). Only the submit stream flows today; the other two start collecting now the
banner is live — verification of that is Claude Code's job, not this session's.

These five tasks live inside the GA4 and Google Ads consoles under the operator's
login, which is why no workflow or repo-side agent can do them.

## The five tasks

1. **Turn on the GA4 data export.** Admin → Product links → BigQuery links: link
   property 523400333 to the `diyaccounting-ga4` project so raw events land
   continuously in the `analytics_523400333` dataset (daily export is enough;
   streaming is not needed). This makes the funnel queryable and is the foundation
   for the ingestion-jobs backlog item (14). Note: some export may already exist —
   check what is configured before adding.
2. **Schedule the Stripe report.** A recurring revenue report so subscription and
   donation numbers arrive alongside the analytics instead of ad-hoc pulls. If GA4
   scheduled email reports don't fit, note what is available and report back — the
   fallback is a repo-side scheduled job under item 14.
3. **Mark conversions.** Admin → Events (or Key events): flag `purchase` and
   `begin_checkout` as conversion/key events. The sites already send both; until
   marked, GA4 computes no conversion rates.
4. **Retire the old stream — carefully.** `G-PJPVQWRWJZ` on `www.diyaccounting.co.uk`
   still receives traffic from the old distribution and double-counts against the new
   streams. CAUTION (from a previous Cowork session, 2026-08-31): a blunt
   "delete the stream" instruction was flagged as wrong and dangerous. First check in
   the console WHAT still sends to it and how much; prefer confirming the source is
   the old distribution and letting it wind down, or disabling collection, over
   deleting history. Report what you find before any deletion.
5. **Check the stale remarketing tag.** Google Ads conversion ID `1065724931`. A
   previous session established this tag loads on no page in any repo — the only
   repo reference was an inventory line, since resolved. So this is confirmatory:
   check whether any campaigns using it are still active, and unlink/pause anything
   dead. Nothing repo-side depends on it.

## Split of work

- **Cowork (this brief):** the five console tasks above, plus a short report per task
  (done / found X / needs a decision) appended to `INBOX.md`.
- **Claude Code (submit session):** item B14a on `submit.diyaccounting.co.uk/NEXT.md`
  — from ~2026-09-01, verify `page_view` events arrive on the Gateway and
  Spreadsheets streams (BigQuery `analytics_523400333` or the GA4 console), then
  close B14a and B19 and finish `PLAN_GA4.md`, including deleting its stale
  "cookie consent banner" open row. Claude Code also builds any repo-side fallback
  the Stripe-report task turns out to need.
- **Operator:** signs in, approves anything destructive (especially task 4).

---

<!-- archived from BRIEF_GA4_BIGQUERY_IAM.md -->

# Brief: grant the GA4 service account BigQuery access (backlog item 14, phase 2)

For the Cowork session driving the Google Cloud console in its browser, with the operator
signed in. Written 2026-09-01 by the Claude Code submit session. Report back via
`INBOX.md` at this workspace root, addressed `to: claude-code-submit`.

## Context

This is the one remaining console-only step in `submit.diyaccounting.co.uk/PLAN_SCHEDULED_INGESTION.md`
phase 2 (GA4 BigQuery event export). Everything else in that plan's operator-prerequisites
section is already done, mostly by a Cowork session overnight 2026-08-30/31
(`BRIEF_GA4_CONSOLE_B19.md`, now closed): the GA4→BigQuery export link exists, project
`diyaccounting-ga4` (958354756046) is linked, the dataset location is `europe-west2`
(London), and billing is attached so export tables no longer expire after 60 days.

What that session did NOT do — because it was a different mechanism (linking GA4's own
export, not granting query access to our own service account — is grant BigQuery IAM roles.
The Lambda that will run phase 2's scheduled query needs its own read access to the
exported dataset, separate from the GA4-side link.

The identity is `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com`, the service
account behind the `GA4_SERVICE_ACCOUNT_JSON` secret already set in the `ci` and `prod`
GitHub environments (done 2026-08-30). Today it has no project-level IAM roles at all —
only Viewer on the GA4 property itself, granted when it was created. That grant lets it
read GA4 configuration; it does not let it run a BigQuery query or read the exported
tables.

## The one task

**Grant two IAM roles to `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com`:**

1. `roles/bigquery.jobUser` on the project `diyaccounting-ga4` — lets it run query jobs.
2. `roles/bigquery.dataViewer`, scoped to the `analytics_523400333` dataset only, not the
   whole project — lets it read the exported event tables and nothing else in the project.

Where: Google Cloud Console → IAM & Admin → IAM, project `diyaccounting-ga4`. Add the
service account as a principal with `BigQuery Job User` if it is not already listed, or
edit its existing entry to add the role. For `dataViewer`, the project-level IAM page
grants project-wide access, which is broader than needed — instead go to BigQuery →
`diyaccounting-ga4` → dataset `analytics_523400333` → Sharing / Permissions → add the
service account as `BigQuery Data Viewer` on that dataset specifically.

That's it — two role grants, no key creation, no new secret. The service account and its
credential already exist and are already wired into AWS.

## Verification

After granting, the IAM page for the service account should show:
- `roles/bigquery.jobUser` at the project level.
- `roles/bigquery.dataViewer` at the dataset level on `analytics_523400333` (this will
  *not* show on the project-level IAM page — check the dataset's own permissions).

No query needs to run to prove this from the console; Claude Code will prove it end to end
when phase 2's code runs a real query against the dataset using this service account.

## Report back

One line in `INBOX.md`, `to: claude-code-submit`: confirm both roles are granted (or say
what went wrong). Nothing else in this batch needs the operator or a browser — the other
console-adjacent item this session flagged, minting new Stripe restricted keys for phase 6,
is not happening; the operator decided to reuse the existing full Stripe key instead, so
phase 6 needs no console work at all.

