<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Engagement with HMRC and the ICO

Open items where DIY Accounting answers or keeps current with a regulator outside a filing.

## Operator assertions (verbatim)

> Move these out of BACKLOG.md and into PLAN_ENGAGEMENT.md 24, 27c.

## Items

### 24. HMRC Assist for VAT engagement

Boarded as `NEXT.md` O24 on 2026-10-03. HMRC wrote three times: 2026-01-08 (announcement and a survey that closed on 20 January, unanswered), 2026-05-07 (overview session invitations for 22 and 28 May) and 2026-06-30 (the session slides, kept at `../private.diyaccounting.co.uk/hmrc/vat/hmrc-assist/`, not for publication). What the slides say: a rules-based service returning up to five feedback messages on a draft VAT return before it is filed; two JSON endpoints on the Developer Hub, a feedback request (the draft nine boxes, period, tax id, fraud prevention headers) and a presented receipt (tax id, report id, correlation id), both required when integrated, the API optional and free; the same OAuth scope as the VAT (MTD) suite; called after the open obligation is retrieved and before the return is submitted, repeatable within a period. Milestones: sandbox with simulated scenarios from July 2026, early adopters' development window August to December, API deployment ready December, early adopter production from January 2027, go-live April 2027. The route in is `hmrcassist@hmrc.gov.uk`; the draft reply is `../private.diyaccounting.co.uk/hmrc/vat/hmrc-assist/DRAFT_EMAIL_HMRC_ASSIST_VAT.md`. In Submit the call sits on `web/public/hmrc/vat/submitVat.html` between the obligation picker and the submit button.

**Source**: HMRC email 2026-01-08. **Effort**: S. **Value**: Revenue. Early input shapes an integration we will need anyway.

### 27c. ICO certificate refresh

Boarded as `NEXT.md` O27c on 2026-10-03. The certificate sits behind the ICO fee-payer login, independent of the public register search that was down on 2026-09-05. Replace `../private.diyaccounting.co.uk/ico/ICO Registration Certificate - ZB070902 - Diy Accounting Limited.pdf` (registration ZB070902, expiry 2027-05-23) with the current one, same filename, commit

**Source**: Split from #27. **Effort**: S. **Value**: Trust. The data-protection half of the same commitments.
