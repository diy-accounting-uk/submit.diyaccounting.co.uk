<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the DIY Accounting brand

> The work this plan describes is in `../spreadsheets.diyaccounting.co.uk/`; bare paths are relative to that repository's root. Its rows are on this repository's `NEXT.md`.

Split out of `../developers/spreadsheets/archive/PLAN_LICENSING_UPLIFT.md` on 2026-09-10. That plan was about changing the licence,
which is done. What is left of the brand is two separate things, and both live here: **one source
for the marks, palette and tokens**, and **a name we do not hold**.

They belong together because they are the same subject from two sides — what our brand is, and what
of it someone else has.

## Part one: one brand source

Four repositories each carry their own copy of the logo, the favicon and the colour tokens, and
they have drifted: two favicon identities, a blue token that does not match its mark, teal left over
in www. One package, built once and consumed everywhere, ends that and lets the guidelines say what
the marks mean rather than each repository guessing.

| # | Task | Gates | Owner |
| --- | --- | --- | --- |
| LU-12 | The baseline: from the audit's branding inventory, the one palette, type stack, logo set and naming table the brand repository starts from; every inconsistency listed with its resolution | audit | Opus | `_developers/brand-baseline.md` (new, this repo, moves to the brand repository at LU-13) |
| LU-13 | The brand repository: structure, the SVG marks and generated renders, `tokens.css` and `tokens.json`, the words, the canonical legal texts, `LICENSE` and `TRADEMARKS.md`, the guidelines document | LU-12, H-LU-6 | Opus for the guidelines and words; Sonnet for tokens, renders and structure | the new repository |
| LU-14 | The brand package: `package.json`, the render build, a publish workflow that publishes to npm and rolls the patch version on every green push to main, with a test that every asset the guidelines name exists | LU-13 | Sonnet | the new repository's `.github/workflows/`, `scripts/` |
| LU-15 | Consumption: each of `spreadsheets`, `submit` and `www` pins the package, copies assets and tokens at build, imports the tokens, and deletes its local copies; one PR per repository; the footer, favicon and title conventions read from the words file | LU-14 | Sonnet, one agent per repository | each repository's `package.json`, build scripts, stylesheets, `public/` |
| LU-16 | The guidelines page: www builds `/brand` from the package's guidelines document and publishes the SVG marks for download under the trademark rules | LU-14 | Sonnet | `www.diyaccounting.co.uk` |
| H-LU-6 | Create the `diy-accounting-uk/brand` repository (public, empty) | — | operator, or the session on the operator's word | github.com |
| H-LU-7 | Review the guidelines and the marks on sight before LU-15 pins them | LU-13 | operator | the brand repository |

`H-LU-6` creates the repository and needs nothing first. `H-LU-7` is a review on sight, which is
why it is a person's row rather than a check: a mark either looks right or it does not.

---

## Part two: the marks themselves

The filing pack is already built and sits in `../developers/spreadsheets/trade-marks/`: the free searches and
their results, the goods and services wording for classes 9, 42 and 35 drawn from the IPO's
pre-approved terms, the first-use evidence with dates, and a series-rule check.

That check reached a verdict worth knowing before anyone opens the form: **the marks are not a
series**, so they file as separate applications rather than one series application. That changes
both the form and the cost.

| # | Task | Gates | Owner | Where |
| --- | --- | --- | --- | --- |
| H-LU-4 | File the UK applications on gov.uk from the pack: DIYA-GL as a standard application; DIY ACCOUNTING SUBMIT and DIY ACCOUNTING SPREADSHEETS via Right Start, each on its own, with the stylised marks beside them; DIY ACCOUNTING on its own via Right Start as the probe | LU-10 | operator | gov.uk |

Budget if every application proceeds to registration: about **£1,435** for the four word marks in
three classes, plus the stylised marks. The bare **DIY ACCOUNTING** application is deliberately a
probe — £185 for the examiner's view on whether twenty years of trading has made the bare name
distinctive. If it is refused, that £185 is the whole cost and the composite marks still carry the
brand.

This is also what part three rests on: without a registration there is little to argue from, which is
why `DC-2` waits on this row rather than running beside it.

---

## Part three: `diyaccounting.com`

### The position

`diyaccounting.com` is registered to someone else and listed for sale at **USD 5,000**. We trade as
DIY Accounting on `diyaccounting.co.uk`, which we hold in Route 53, auto-renewing to 2027-08-12.

**The asking price is far beyond what the name is worth to us. Even USD 1,000 would be too much.**
That is the operator's position and it is the frame for everything below: this is not a purchase
waiting for a budget, it is a question waiting for an answer.

### What the answer has to cover

1. **What the holding actually is.** A parked listing that has never resolved to a business is a
   different thing from a site someone trades on. Which one it is decides whether any challenge
   has a basis at all.
2. **Whether a UKIPO registration changes anything.** `H-LU-4` files DIY ACCOUNTING and its
   composites. A registered mark is what a complaint would rest on; without one there is little to
   argue from. This is why this plan waits on that filing rather than running beside it.
3. **What a UDRP complaint costs and needs.** The fee, the evidence, the odds, and the time. A
   complaint that costs more than the name is worth is not a route, it is a more expensive way of
   paying the asking price.
4. **Whether the price moves.** A listing is an asking price, not a valuation. Whether it has sat
   unsold for years is a fact worth knowing before anyone talks to anyone.

### What this plan is not

It is not an instruction to buy the domain, and no row here authorises spending anything. If the
answer is that recovery costs more than the name is worth, that is a complete and successful
outcome for this plan: the question stops being open and nobody wonders about it again.

Nothing in the product depends on this. `diyaccounting.co.uk` carries the business, and the
DIYA-GL names are being registered under `H-LU-5` in the uplift plan.

### Rows

| #      | Task                                                                                                                  | Gates   | Owner    |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| DC-1   | Establish what the holding is: parked or trading, how long held, whether it has ever resolved to a business             | —       | operator |
| DC-2   | Establish what a UDRP complaint would cost and require, and whether our facts support one                               | H-LU-4  | operator |
| DC-3   | Record the answer and close: either a route worth taking at a price worth paying, or the reason there is not one        | DC-1, DC-2 | operator |

DC-1 needs nothing from anyone and can be answered today. DC-2 waits on the trade mark filing,
because the answer changes entirely depending on whether we hold a registration.

### Why this is worth an hour and not a day

A term we trade under, unclaimed in the most obvious namespace, is how `diyaccounting.com` came to
be held by someone else in the first place. The lesson is already applied — `H-LU-5` registers the
DIYA-GL names before anyone else can. This plan exists so the older mistake is understood rather
than repeated, and so the question does not resurface every year with nobody remembering what was
already established.
