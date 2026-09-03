# ITSA Minimum Functionality Standards vs the Planned Build

Sources read 2026-09-03:

- [Making Tax Digital for Income Tax end-to-end service guide](https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/index.html) — last updated 7 August 2026
- [How to integrate with HMRC APIs](https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/how-to-integrate.html) — the minimum functionality standards and Production Approvals Checklist
- [Individual Calculations (MTD) API docs](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0) and the other MTD ITSA API reference pages — each carries the same production-access notice as of 2026-09-03

Phase 1 is backlog row 10: sandbox integration with the self-employment quarterly update APIs
(Business Details, Obligations, Self Employment Business). Phase 2 is row 11: annual summaries,
final declaration, then the recognition application. Mapped against `STRATEGY.md` and
`_developers/backlog/self-employed-api-operations.md`.

## The requirement that changes the plan

HMRC's own API documentation states, as of 2026-09-03: **"HMRC is no longer accepting production
credential access requests for new 2026–27 quarterly update products, as the market window for
these products has now closed."** The sentence repeats on the end-to-end service guide and on
each of the eight MTD ITSA API reference pages checked.

This reads as a closure of new production onboarding for the current (2026-27) tax year's
quarterly-update software category, not a closure of sandbox access — the how-to-integrate guide
still describes sandbox testing and the approvals checklist as open steps. Two things are not
stated on any page checked: whether a new window opens for 2027-28 (the year the £30k mandation
wave actually files under), and what a new entrant needs to do to be considered for that window.
`STRATEGY.md`'s W3 goal ("listed and filing real quarterly updates well before April 2027") assumes
production recognition is obtainable on our timeline; that assumption needs checking against this
closure before row 11 commits further effort. HMRC's software-vendor contact is
makingtaxdigital-softwarevendors@hmrc.gov.uk (SDSTeam@hmrc.gov.uk is the address already in use for
VAT).

## Requirements table

| Requirement | HMRC reference | Phase 1 | Phase 2 | Not planned | Notes |
|---|---|---|---|---|---|
| Fraud prevention header data on every call | How to integrate | Yes | | | Already built and HMRC-evaluated for VAT (`STRATEGY.md`); same header library applies to ITSA calls. |
| Obtain a business ID per customer business | Business Details API | Yes | | | Row 10 lists Business Details explicitly. |
| Create and maintain digital records, or digitally link to software that does | How to integrate | Yes | | | Met by the spreadsheet-plus-bridging model already used for VAT; no new build. |
| Submit quarterly update information for each mandated income source | Self Employment Business, Obligations APIs | Yes | | | Row 10's core: `_developers/backlog/self-employed-api-operations.md` specs the period-summary endpoints. |
| View an estimate of income tax liability, with the required disclaimer shown first | Individual Calculations API | | Yes | | Not in row 10's three named APIs; the disclaimer text itself is a new UI requirement, not just an API call. |
| Make required adjustments and finalise business income for the year | Business Source Adjustable Summary, Individuals Tax Liability Adjustments APIs | | Yes | | This is the "annual summaries" half of row 11. |
| Carry business losses forward, back, or sideways | Individual Losses API | | Yes | | Not named in either backlog row today; row 11 needs to absorb it explicitly. |
| Submit non-mandated income sources, or divert the customer to software that can | How to integrate | | | Not yet planned | No property-income or other non-self-employment source is in scope; `self-employed-api-operations.md` covers self-employment only. |
| Submit the tax return itself (final declaration), or divert the customer to software that can | How to integrate; Individuals Tax Liability Adjustments API | | Yes | | Row 11's "final declaration." |
| Property Business API (landlord income) | Property Business API | | | Not yet planned | The £20k-£30k mandation wave STRATEGY.md targets is described as sole traders; landlord support has no row in either backlog phase. |

## Requirements neither phase covers yet

- Non-mandated income sources beyond self-employment (property, other), or a documented
  diversion path to software that handles them.
- Loss carry-forward/back/sideways (Individual Losses API) — not named in row 10 or row 11 today.
- The in-year/intent-to-finalise disclaimer HMRC requires before showing a calculation.
- Confirming whether HMRC will accept a new production application for the 2027-28 quarterly
  update window, given the 2026-27 window is closed to new entrants.
