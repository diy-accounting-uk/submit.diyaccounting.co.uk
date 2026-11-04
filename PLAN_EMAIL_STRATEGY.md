<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: email strategy

Machine mail moves to support@diyaccounting.co.uk through forward filters, in four lanes. Mail that needs the operator stays at antony@diyaccounting.co.uk. This plan covers row EML1 and sets the sender address for row EML2. The sender-by-sender table is in the private repository at `operator/EMAIL_SENDERS_2026-11-04.md`.

## Operator assertions (verbatim)

> Please add a board task to look into and advise on a new email strategy. I would like to send mail which can be processed automatically to support@diyaccounting.co.uk and all things that I should either be notified about or should respond personally to antony@diyaccounting.co.uk, the output of the task should be the plan to complete the move including adding automated processing to enable this following a similar process for messages to the support requests where they are opened in private and need to be acknowledged (changes from alerts would need to come direct from a trusted source e.g. AWS lambda using a gh app credentials)

## Advice

1. Move mail with forward filters first. A filter in the antony@ mailbox matches a sender and a subject pattern, forwards to support@ and skips the inbox. A filter needs no vendor change and is simple to undo.
2. Keep every vendor login at antony@. Forward only what a filter names. A message that matches no filter stays at antony@, so a new kind of login mail stays with the operator.
3. Never send a login code, a password reset or a token notice to support@. A service account reads that mailbox with `gmail.readonly`, and the key is a GitHub environment secret. The intake also copies message text into private issues.
4. Change a vendor contact only where the vendor has a notification field that is apart from the login, and where the mail comes from code. The root repository budgets are the first case.
5. An email starts a review and never starts a change. A change comes from a trusted event, or from a check that reads the vendor's own record.

## The sort

The window is 2025-11-04 to 2026-11-02. The shares are of the inbound mail to the antony@ mailbox.

| Group | Share | Kinds |
|---|---|---|
| Stays at antony@ | 37% | Payment notices, people, login mail, regulator staff, statutory reminders, vendor actions, bank, domain registrar, bounces, waitlist and feedback |
| Moves to support@ | 29% | Invoices, receipts, payouts, filing records, AWS cost and notices, platform notices, Google Ads notices, HMRC developer bulletins |
| Unsubscribe | 3% | Marketing and cold mail |
| Stops by itself | 31% | SNS subscription confirmations |

- The SNS confirmations came from a topic for each deployment. The change to one topic for each environment ends them.
- Payment notices are 21% of the total, and they sit in the first group because the operator answers them by hand. See decision D1.
- Nearly all the mail that moves has a DKIM signature from the domain of the sender, so code can check the origin. The table in the private repository gives the count.

## The address for EML2

The sender for customer mail is `support@diyaccounting.co.uk`.

- The From and the Reply-To are both support@. A customer reply reaches the intake and opens a private issue.
- SES sends the mail from the submit-prod account, and a domain identity for `diyaccounting.co.uk` signs it with DKIM.
- A custom MAIL FROM subdomain and an SES event topic take the bounces and the complaints. Bounces do not reach the support@ inbox.
- The operator copies of subscribe and redeem go to `antony@diyaccounting.co.uk`, because the operator must be told of these events.
- The SNS alarm topic has no email subscriber, so EML2 has no alarm address to reuse. The operator copy needs its own setting. Row EML2 reads "the addresses that the AWS alarms go to", and that text needs this change.
- EML2 needs SES production access and the DKIM records. Both accounts are in the SES sandbox today, and neither holds an identity.

## Alternatives

| Alternative | For | Against | Verdict |
|---|---|---|---|
| Forward filters in antony@ | Works for vendors that tie mail to the login. Simple to undo. Keeps a copy | The list needs upkeep. A filter reads the From header, which a sender can forge, so the intake must check DKIM | Chosen |
| Change each vendor's address | Mail goes direct | PayPal sends notices to the primary address. Stripe sets notices for each user. A login change puts login mail in machine reach | Second stage only |
| Workspace routing rule | One central rule | A central rule is a wider change, and an error reaches every mailbox | Not needed for six filters |
| A third mailbox for machine mail | Keeps customer mail apart | Adds a Workspace seat, a mirror, a key and a second intake. The operator asked for support@ | Hold in reserve if the lanes get crowded |
| SES inbound on a subdomain to a Lambda | No Gmail in the path | Vendors would need a new address, and the login problem stays | Rejected for now |
| Gmail filters written by a service account | Filters as code | Needs a delegated `gmail.settings.basic` key on antony@. That key could forward the operator's mail out | Rejected: the risk is greater than the work of six filters |
| `noreply@` sender for EML2 | Keeps replies out of support@ | A customer who answers a receipt gets no one | Rejected |
| New `receipts@` sender for EML2 | Separates sent mail by kind | Needs an alias and a rule to bring replies to the intake | Rejected: adds a step and no value |

## Decisions for the operator

| Id | Question | Options | Chosen until told otherwise |
|---|---|---|---|
| D1 | Payment notices | (a) Stay at antony@, one message for each payment. (b) Move to support@ as records, and a weekly digest to antony@ lists each donor with a note | (a). Row EML9 builds (b) if the operator asks. With (b), antony@ takes 16% of today's mail in place of 37% |

## The automated processing

### Lanes

The intake gives each new thread in support@ one lane. Code chooses the lane from a registry and the authentication result. No model takes part in this choice.

| Lane | Rule | Result |
|---|---|---|
| customer | The sender is not in the registry and is not automated | One issue, labels `support` and `maintainer-review`, as today |
| record | The sender and the subject are registered as a record, and DKIM passes | No issue. The mail stays in the mailbox. The run counts it |
| notice | The sender and the subject are registered as a notice, and DKIM passes. Also any automated sender outside the registry | One issue, labels `mail-notice` and `maintainer-review` |
| unverified | The sender is in the registry and DKIM fails or does not match | One issue, labels `mail-notice`, `maintainer-review` and `injection-suspected` |
| withheld | The subject looks like login mail | One issue with the sender and the date, and no message text |

- The registry is one file in this repository. Each entry holds a sender domain, a DKIM domain, a subject pattern and a lane. It holds no account detail.
- The check reads the `Authentication-Results` header that Google wrote. It requires `dkim=pass` for the registered domain.
- The result after a forward is a named unknown. Row EML4 forwards one real message and reads the header before the check goes live.
- The intake drops automated senders today, in the Gmail search and in `isCustomerSender`. The lanes replace that skip, so a new automated sender opens a notice and does not vanish.
- A failure shows in an issue. An unknown sender always opens an issue, in the customer lane or the notice lane.
- The logs stay at counts only, one count for each lane, because this repository is public.

### Open in private, then acknowledge

The notice lane follows the support process.

1. `support-mail-intake.yml` opens the issue in the private repository, with the text fenced as data.
2. `support-reader.yml` reads the issue with a model that has no tools. Code accepts one JSON object that fits a new `mail` schema in `app/lib/quarantineReaderSchema.js`.
3. The schema holds `vendor`, `actionRequired`, `deadline`, `summary`, `injectionSuspected` and `piiPresent`. The `vendor` value comes from the registry. The `deadline` value is a date or null. The `summary` has the same limits as support, with no URL.
4. The operator reads the issue and removes `maintainer-review`, or closes the issue. `scripts/maintainer-review-gate.mjs` accepts only the operator's own label removal.
5. After the gate says `approved`, the handler does one thing from a fixed list. It closes the notice, drafts a board row from the checked fields, or runs a registered read-only check.

The handler takes no value from the message. It holds no write access to AWS, to a vendor or to any code.

A daily digest tells the operator that notices wait. It goes to antony@ only when the count is above zero. It holds the count, the nearest deadline and the link to the issue list. It holds no message text.

### Changes come from a trusted source

An alert that can start a change does not travel by email. It follows the path of `app/functions/ops/alarmToGithubIssue.js`.

- A source event reaches a Lambda. The Lambda opens the issue with the ops GitHub App credentials.
- The mail intake token writes issues in the private repository only. The alarm path runs on issues in this repository, so an issue that comes from mail does not enter the alarm path.
- A mail issue never carries the `alarm` label.
- Before any remedy, code reads the source's own record and fails closed, as `scripts/verify-alarm-origin.mjs` does.

| Mail today | Trusted event |
|---|---|
| AWS Health notices | EventBridge rule on `aws.health` in eu-west-2 and us-east-1, to a Lambda and the ops App |
| AWS budgets and cost anomalies | Budget and anomaly SNS topics, to the existing cost alert path. The root account budgets send email only today, so they need a topic |
| Certificate renewal notices | The same rule, on `aws.acm` |
| Stripe account actions and webhook trouble | The signed Stripe webhook, and a read of the Stripe account |
| Domain renewal | A scheduled read of the registrar API |
| Companies House deadlines | A scheduled read of the Companies House company record |

Vendors with no event or API stay in the notice lane. HMRC bulletins are an example.

## Things that break if the order is wrong

- The support@ mailbox has an auto-reply that is on today, and it already answers GitHub mail. Forwarded vendor mail would start a flood of auto-replies. Row EML3 stops this first.
- The company book reads supplier invoices from `mail-antony` only, in `mcp/lib/finance/mail-invoices.js`. The filter keeps a copy in antony@, so filtered invoices stay visible. Mail that moves at the vendor does not. Row EML8 adds `mail-support` before any vendor contact changes.
- Without the lanes, the intake skips some forwarded mail and opens customer issues for the rest. Row EML4 goes live before the first filter.

## The move

Steps 1 to 4 and 7 are Claude Code's. Steps 5, 6 and 8 need the operator's yes for each action.

| Step | Row | Result |
|---|---|---|
| 1 | EML4 | The lanes run in dry-run over live support@ mail |
| 2 | EML5 | The reader handles notices |
| 3 | EML6 | The handler and the digest run |
| 4 | EML8 | The book reads both mailboxes |
| 5 | EML3 | The auto-reply stops for machine senders, and the unsubscribes are done |
| 6 | EML7 | Filters go in by stages: finance first, then notices. Each stage runs for one week |
| 7 | EML10 | The root budgets address changes, and DMARC starts at `p=none` |
| 8 | EML11 | Vendor notification fields change where a vendor has one |

Row EML12 adds the trusted events. It can run at any time after step 3. After step 6, re-run the count. The target is that antony@ holds only the first group.

To undo a stage, delete its filter. The mail then returns to antony@, and the mirror holds the copies.

## Proposed board rows

- [ ] **EML3. Stop the support@ auto-reply for machine senders, and unsubscribe from marketing.** The Gmail auto-reply on support@ answers GitHub and Google addresses. Turn it off, or limit it to people, before any filter forwards vendor mail. Unsubscribe from the senders that the private table marks. Use Claude in Chrome with the operator's yes for each action. **Source**: EML1. **Owner**: operator with Claude Code. **Model**: Sonnet. **Size**: 0 files.
- [ ] **EML4. Add mail lanes to the intake.** Add the sender registry. Change `scripts/support-mail-intake.mjs` so that `buildSearchQuery` and `isCustomerSender` no longer drop automated senders, and each thread gets a lane from the registry and the `Authentication-Results` header. Print one count for each lane. Add a dry-run proof over the live mailbox. Forward one real message and read the header before the DKIM check goes live. Create the `mail-notice` label through `scripts/support-label-sweep.mjs`. **Depends on**: nothing. **Source**: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.
- [ ] **EML5. Read notices in quarantine.** Add the `mail` schema to `app/lib/quarantineReaderSchema.js`, a `prompts/mail-reader.md`, and notice selection in `scripts/support-reader-select.mjs`. Add synthetic fixtures with injected instructions to `support-replay.yml`. **Depends on**: EML4. **Source**: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.
- [ ] **EML6. Handle acknowledged notices, and send the digest.** After `maintainer-review-gate.mjs` says `approved`, do one action from the fixed list: close, draft a board row, or run a registered read-only check. Send the daily digest to antony@ through the EML2 sender. **Depends on**: EML5, and EML2 for the digest. **Source**: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.
- [ ] **EML7. Add the forward filters in stages.** Create the six filters from the private table in the antony@ mailbox, with Claude in Chrome and the operator's yes for each action. Start with finance. Run each stage for one week, and read the lane counts. **Depends on**: EML3, EML4, EML5, EML8. **Source**: EML1. **Owner**: operator with Claude Code. **Model**: Sonnet. **Size**: 0 files.
- [ ] **EML8. Read invoices from both mailboxes.** `mcp/lib/finance/mail-invoices.js` searches `mail-antony` only. Add `mail-support`, and remove a duplicate that a filter copy makes. **Depends on**: nothing. **Source**: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.
- [ ] **EML9. Weekly donor digest, if D1 changes.** Move payment notices to the record lane, and send antony@ one weekly list of donors and their notes. **Depends on**: the operator choosing D1 option (b), EML2, EML7. **Source**: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.
- [ ] **EML10. Move the root budgets address, and publish DMARC.** Change `alertEmail` in the root repository's `RootEnvironment.java` to support@. Add a `_dmarc` record to `root-zone/manual-records.json` at `p=none`, with the reports to support@ and a record lane entry. Raise the policy after 30 clean days. **Depends on**: EML7. **Source**: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.
- [ ] **EML11. Change vendor notification fields.** Research first, from each vendor's API and documents, which vendors have a notification field that is apart from the login. Start with the AWS alternate contacts (`aws account put-alternate-contact`). Give only confirmed labels and values. Leave every login at antony@. **Depends on**: EML7. **Source**: EML1. **Owner**: operator with Claude Code. **Model**: Opus. **Size**: 0 files.
- [ ] **EML12. Send trusted events to private issues.** Add EventBridge rules for `aws.health` and `aws.acm` in `ObservabilityStack.java` and `ObservabilityUE1Stack.java`, to a Lambda on the pattern of `alarmToGithubIssue.js` with the ops App. Add a scheduled read for the domain renewal and the Companies House deadlines. Add an SNS topic to the root account budgets. Add a fail-closed check of the source record, on the pattern of `verify-alarm-origin.mjs`. **Depends on**: nothing. **Source**: EML1. **Owner**: Claude Code. **Model**: Opus for the design, Sonnet to build. **Size**: ~10 files.
