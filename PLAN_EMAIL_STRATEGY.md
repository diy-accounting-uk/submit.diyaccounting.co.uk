<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: email strategy

Machine mail reaches support@diyaccounting.co.uk because each sender changes its destination. We contact the sender, or change the vendor's own setting. Mail that needs the operator stays at antony@diyaccounting.co.uk. This plan covers row EML1 and sets the sender address for row EML2. The exact sender addresses are in the private repository at `operator/EMAIL_DESTINATIONS_2026-11-05.md`. The full sender sort is in `operator/EMAIL_SENDERS_2026-11-04.md`.

## Operator assertions (verbatim)

> Please add a board task to look into and advise on a new email strategy. I would like to send mail which can be processed automatically to support@diyaccounting.co.uk and all things that I should either be notified about or should respond personally to antony@diyaccounting.co.uk, the output of the task should be the plan to complete the move including adding automated processing to enable this following a similar process for messages to the support requests where they are opened in private and need to be acknowledged (changes from alerts would need to come direct from a trusted source e.g. AWS lambda using a gh app credentials)

> No, I don't want to use forward filters the plan should list the email senders going to a destination account that we want to change and we'll contact the sender to change the desination.

## Advice

1. Each sender changes its own destination. The plan lists the senders, and the change for each one is a vendor setting, an API call, a code change or a contact.
2. Keep every vendor login at antony@. Change only the address for notices, billing or contacts. A message from a sender that has not changed stays at antony@, so a new kind of login mail stays with the operator.
3. Never send a login code, a password reset or a token notice to support@. A person reads that mailbox.
4. Where a vendor has one address for login and notices, the sender stays at antony@ until the vendor offers a separate notice address.
5. An email starts a review and never starts a change. A change comes from a trusted event, or from a check that reads the vendor's own record.

## The sort

The window is 2025-11-04 to 2026-11-02. The shares are of the inbound mail to the antony@ mailbox.

| Group | Share | Kinds |
|---|---|---|
| Stays at antony@ | 37% | Payment notices, people, login mail, regulator staff, statutory reminders, vendor actions, bank, domain registrar, bounces, waitlist and feedback |
| Changes to support@ | 29% | Invoices, receipts, payouts, filing records, AWS cost and notices, platform notices, Google Ads notices, HMRC developer bulletins |
| Unsubscribe | 3% | Marketing and cold mail |
| Stops by itself | 31% | SNS subscription confirmations |

- The SNS confirmations came from a topic for each deployment. The change to one topic for each environment ends them.
- Payment notices are 21% of the total. They stay at antony@ because the operator answers them by hand. See decision D1.
- Nearly all the mail that changes has a DKIM signature from the domain of the sender, so code can check the origin.

## Senders to change

Every row changes the destination from the operator mailbox (or an alias of it) to the support mailbox. Counts are messages in 12 months. Row ids S1 to S15 are the keys for the private table.

| Id | Sender | Count | Method |
|---|---|---|---|
| S1 | AWS billing and invoices | 28 | API and Filter |
| S2 | AWS health and account notices | 39 | API |
| S3 | AWS budgets and cost anomalies | 40 | Code |
| S4 | AWS Free Tier alerts | 23 | API and Filter |
| S5 | PayPal receipts and reports | 125 | Contact |
| S6 | Stripe payouts and reports | 57 | Console |
| S7 | Google billing, Cloud, Workspace, Search Console, Analytics | 45 | API and Console |
| S8 | Google Ads notices | 34 | Console |
| S9 | npm publish notices | 25 | Filter |
| S10 | Microsoft Advertising notices | 6 | Console |
| S11 | GitHub account and billing notices | 2 | API |
| S12 | Linktree billing | 1 | None |
| S13 | Companies House filing records | 26 | Filter |
| S14 | HMRC filing confirmations | 8 | Console and Filter |
| S15 | HMRC developer bulletins | 14 | Console |

The method for each row, in order, as the research of 2026-11-06 left it. The confirmed calls, labels and current values, and the one open read for each row that still has one, are in `../private.diyaccounting.co.uk/operator/EMAIL_DESTINATIONS_2026-11-05.md`.

- S1: The AWS billing alternate contact, set for each account with `aws account put-alternate-contact --alternate-contact-type BILLING`, with each account's own profile. It adds support@. admin@ stays on invoices, because AWS keeps the root user on billing and invoice mail, so a mail filter moves that copy. No account has an alternate contact today.
- S2: The operations alternate contact for each account, then the removal of the primary contact from the Health Operations and Marketplace categories in AWS User Notifications. The first removal shows whether AWS accepts it.
- S3: `alertEmail` in the root repository's `RootEnvironment.java`. This is a code change in our own repository.
- S4: The S1 billing alternate contact receives the alerts. admin@ keeps a copy, which a mail filter moves.
- S5: PayPal sends notices to the primary address. The notification settings have an unconfirmed label. Contact PayPal for a separate notice address.
- S6: Stripe sets notices for each user. Add a user at support@ and set its notifications. The settings label is unconfirmed.
- S7: Google Cloud Essential Contacts for billing, technical and security notices; its API is enabled in no project, so the read needs the console or the API enabled first. Workspace product notices cannot go to support@, because the secondary email must be outside the domain, so a mail filter moves them. Suspension, past due and declined-payment notices stay at antony@ because they need a person the same day.
- S8: Notification preferences for each user in Google Ads, by an added user at support@. The label is unconfirmed.
- S9: npm sends to the account address, which is also the login. A mail filter moves the notices, unless the profile page offers a separate notice address.
- S10: The notification contact in the Microsoft Advertising account settings. The label is unconfirmed.
- S11: The organisation billing email, by `gh api -X PATCH /orgs/diy-accounting-uk -f billing_email=<address>`. The enterprise billing email is already support@.
- S12: No change. The subscription has ended.
- S13: The records go to the filer's sign-in email, not to the XML presenter contact. A mail filter moves them.
- S14: Seven of the eight are Developer Hub reports to the application's team members: add support@ to the team. The CT600 receipt and the payment confirmation go to the online services sign-in, so a mail filter moves them.
- S15: The email preferences in the Developer Hub. The label is unconfirmed.

Who contacts the vendor: the operator sends each message from antony@. Claude Code drafts it with the `email-draft` skill.

## The address for EML2

The sender for customer mail is `support@diyaccounting.co.uk`.

- The From and the Reply-To are both support@. A customer reply reaches the support mailbox, where a person reads it.
- SES sends the mail from the submit-prod account, and a domain identity for `diyaccounting.co.uk` signs it with DKIM.
- A custom MAIL FROM subdomain and an SES event topic take the bounces and the complaints. Bounces do not reach the support@ inbox.
- The operator copies of subscribe and redeem go to `antony@diyaccounting.co.uk`, because the operator must be told of these events.
- The SNS alarm topic has no email subscriber, so EML2 has no alarm address to reuse. The operator copy needs its own setting. Row EML2 reads "the addresses that the AWS alarms go to", and that text needs this change.
- EML2 needs SES production access and the DKIM records. Both accounts are in the SES sandbox today, and neither holds an identity.

Alternatives for the sender address:

| Alternative | Against | Verdict |
|---|---|---|
| `noreply@` sender | A customer who answers a receipt gets no one | Rejected |
| New `receipts@` sender | Needs an alias and a rule to bring replies to support@ | Rejected: adds a step and no value |

## Decision for the operator

| Id | Question | Options | Chosen until told otherwise |
|---|---|---|---|
| D1 | Payment notices (PayPal and Stripe payment received, 342 messages a year) | (a) Stay at antony@, one message for each payment. (b) Join S5 and S6 as senders to change, with a weekly digest to antony@ that lists each donor | (a) |

## Changes come from a trusted source

An alert that can start a change does not travel by email. It follows the path of `app/functions/ops/alarmToGithubIssue.js`.

- A source event reaches a Lambda. The Lambda opens the issue with the ops GitHub App credentials.
- Before any remedy, code reads the source's own record and fails closed, as `scripts/verify-alarm-origin.mjs` does.

| Mail today | Trusted event |
|---|---|
| AWS Health notices | EventBridge rule on `aws.health` in eu-west-2 and us-east-1, to a Lambda and the ops App |
| AWS budgets and cost anomalies | Budget and anomaly SNS topics, to the existing cost alert path. The root account budgets send email only today, so they need a topic |
| Certificate renewal notices | The same rule, on `aws.acm` |
| Stripe account actions and webhook trouble | The signed Stripe webhook, and a read of the Stripe account |
| Domain renewal | A scheduled read of the registrar API |
| Companies House deadlines | A scheduled read of the Companies House company record |

Vendors with no event or API send their mail to support@, where a person reads it. HMRC bulletins are an example.

## Order of the work

- The company book reads supplier invoices from `mail-antony` only, in `mcp/lib/finance/mail-invoices.js`. Invoices that move at the vendor leave that mailbox. Row EML8 adds `mail-support` before S1, S5, S6 or S7 change.

| Step | Row | Result |
|---|---|---|
| 1 | EML8 | The book reads both mailboxes |
| 2 | EML3 | The unsubscribes are done |
| 3 | EML10 | The root budgets address changes (S3), and DMARC starts at `p=none` |
| 4 | EML11 | The sender changes S1 to S15, finance first, each stage for one week |

The trusted events (EML12) are live on prod. After step 4, re-run the count. The target is that antony@ holds only the first group.

To undo a change, set the vendor's destination back to antony@.

## Proposed board rows

- [ ] **EML10. Move the root budgets address, and publish DMARC.** Change `alertEmail` in the root repository's `RootEnvironment.java` to support@ (S3). Add a `_dmarc` record to `root-zone/manual-records.json` at `p=none`, with the reports to support@. Raise the policy after 30 clean days. On the board the build to an open PR is EML10, and the operator's yes to the merge and the root deploy is OEML10. **Depends on**: EML8. **Source: EML1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.
- [ ] **EML11. Change the sender destinations S1 to S15.** Research first, from each vendor's API and documents, the setting or the contact route for each row, and confirm each label named unconfirmed. Give only confirmed labels and values (board row EML11a, which writes them into `../private.diyaccounting.co.uk/operator/EMAIL_DESTINATIONS_2026-11-05.md`). Make the API changes (S1, S2, S7 Essential Contacts) with the operator's yes for each action. Draft the contact messages with the `email-draft` skill for the operator to send. Start with finance (S1, S4, S5, S6, S7), then the rest. Run each stage for one week and read the lane counts. Leave every login at antony@. **Depends on**: EML3, EML8. **Source**: EML1. **Owner**: operator with Claude Code. **Model**: Opus. **Size**: 0 files.
