# Support mail analysis — 2026-09

Answers backlog rows 21a and 23a. Sources: the Google Workspace mail mirror
(`support@diyaccounting.co.uk` and `antony@diyaccounting.co.uk`, both fully
indexed with date, sender, subject and path). No customer names, addresses,
company names or quoted personal content appear below; every question is
described in its generic shape.

## Part 1 — last six months (21a)

Range: 2026-03-01 to 2026-09-06.

### Where the real replies live

`support@diyaccounting.co.uk` received 42 messages in the six months.
Its autoresponder fires on every inbound message and says the mailbox "is
monitored infrequently." Only about six of the 42 were live customers; the
rest were spam, vendor mail (GitHub, AWS, HMRC developer notices) or
internal forwards. The director triages the mailbox by forwarding anything
real to his own address and replying from there — so the substantive
customer replies for this period live mostly in the personal mailbox, not
in the support mailbox. Any load estimate has to include both.

Across both mailboxes, 43 threads in the window got a substantive human
reply. A further six support@ messages were spam or vendor mail answered
only by the autoresponder — no human reply, so they carry no drafting load
and are excluded from the table below.

### Categories

| Category | Threads | Reply is template-like |
|---|---|---|
| Donation acknowledgement | 27 | Yes — same three-paragraph letter, name substituted. Three of the 27 grew a bespoke follow-up question afterward (a filing-deadline question, a beta-tester invitation, a product-compatibility question) that a template could not have answered. |
| Known bug notice (a spreadsheet formula fault that shipped in an April package) | 3 | Yes — identical bug bulletin sent to each affected customer. |
| Product roadmap ("does the software support X yet / when") | 6 | Partly — the core answer is reused near-verbatim across customers, but each reply still needs a person to pick the right paragraph and add specifics. |
| Spreadsheet how-to / reconciliation trouble | 6 | No — each is a specific figure or file needing individual diagnosis, sometimes from a screenshot. |
| Filing-app submission failure | 1 | No — a genuine bug, diagnosed and fixed over several exchanges across six months for one customer. |

Total: 43 threads, 30 with a template-like primary reply.

### Verdict

70% of this period's substantive replies (30 of 43) are close enough to a
standing letter that a draft could be generated automatically and just
reviewed before sending. Counting the roadmap category's reusable core
answer, that rises to about 84%. The remaining 16% — spreadsheet
diagnosis and app-bug reports — need a person to read a screenshot or an
error code and reason about one customer's specific numbers; drafting
cannot shortcut that part.

The bigger fact this period surfaces: volume is very low (43 threads in
six months, about 7 a month) and most of it is a recurring shape — thank
someone for a donation, or answer "is X ready yet" — not open-ended
troubleshooting. A drafting assistant would mostly be writing the same
handful of letters, not triaging a queue.

## Part 2 — whole-archive sample, 2012 to now (23a)

Sample: roughly 55 threads spread across 2012–2026, drawn from both
mailboxes and stratified by year, plus the 43 threads from Part 1. Older
threads were read at header and body level; several use HTML email with
the customer's own spreadsheet figures pasted inline, which the sample
skipped over rather than reproduce.

### Volume has collapsed since the archive's early years

| Years | Inbound messages/year (not from the business) |
|---|---|
| 2012–2014 | ~1,300–1,850 |
| 2015–2018 | ~1,050–1,550 |
| 2019–2022 | ~440–740 |
| 2023–2026 | 4–73 |

This count is unfiltered — it includes bounces and third-party mail
alongside real customer questions — but the shape is clear: the mailbox
was busy for a decade, then inbound volume fell by roughly 97% after 2018
and has stayed low. Most of the archive's raw material predates the
current filing service by years.

### First ten article topics

| # | Topic | Question it answers | Sampled threads | Changed over the years? |
|---|---|---|---|---|
| 1 | Which package to buy, or whether this year's package exists yet | "Which of your packages fits my situation, and is the version for my year end out yet?" | 6 | Yes — the answer has moved from a fixed spreadsheet line-up to a growing filing service, so the pointer changes every couple of years. |
| 2 | Linked workbooks break after a new computer or a Mac | "The linked cells in my downloaded package show blank or wrong figures." | 3 | Little — same underlying fix (re-enable links, grant folder access), but the diagnosis got more precise once Mac testing matured. |
| 3 | Year-end figures don't reconcile | "My accuracy check shows an error / my retained profit and dividend figures don't match." | 3 | Little — the check is the same; the specific figures are always new. |
| 4 | Is this software recognised for digital VAT filing | "I can't find your product on HMRC's approved list any more / how do I file digitally with this." | 3 | Yes, substantially — from "use a third-party add-on and check the list yourself" to a first-party filing service now recognised directly. |
| 5 | VAT registration or digital-filing threshold | "My turnover is close to the threshold — do I need to register or file digitally?" | 2 | The method is stable; the threshold figure itself moves with HMRC's own rules. |
| 6 | Getting this year's Corporation Tax return template | "How do I get an updated Corporation Tax filing template for the current year?" | 2 | Yes — the filing route has moved from paper, to an online look-alike template, to a planned in-house service. |
| 7 | Depreciation and fixed-asset treatment | "How do I record depreciation / a fixed asset correctly in the package?" | 1 | Likely little — this is standard accounting method, not tied to a filing deadline. |
| 8 | Getting an old or replacement download | "I can't find my download link / I need a specific past year's package again." | 3 | Yes — from asking staff to resend a paid link, to a free self-serve archive once a version is no longer sold. |
| 9 | A one-off government scheme's entries in the package | "How do I record [a temporary support scheme] in my accounts?" | 1 | The scheme itself ended, so this topic has a shelf life built in. |
| 10 | Roadmap for non-VAT digital filing | "When will you support Self-Employment / Income Tax / Limited Company filing?" | 6 | Yes — the answer has changed release by release as the filing service's scope has grown. |

### Verdict

The archive holds real, recurring questions with a knowable answer, not
just one-off noise — the same handful of topics above turn up across a
decade under different correspondents. An emails-to-articles pipeline has
material to work with.

Two things any build should budget for, not treat as reasons to skip it.
First, several of the strongest topics (digital filing recognition, the
CT600 route, the roadmap questions) have an answer that moves with the
product or with HMRC's own rules, so each article needs a "last checked"
date and an owner who revisits it, not a one-time write. Second, a lot of
the older raw material is HTML mail with the customer's own figures
pasted inline, which costs real editorial time to read through and strip
before any answer can be lifted out and generalised — that cost sits
inside the L-sized pipeline build, not before it.
