# PLAN: CI certificate renewal is blocked on a missing DNS validation record

Status: **renewed to 2027-03-15; closes when #62 (detection check) merges**
(raised 2026-08-30; deadline 2026-09-04)

## Operator assertions (verbatim)

> also it's the ci environment not prod.

Severity follows from that: this breaks CI, not customer filing. Production runs
in a different account with its own certificate.

## The problem

ACM cannot renew the certificate automatically. DNS validation is failing for one
domain, and the certificate expires in five days.

| | |
|---|---|
| Certificate | `arn:aws:acm:us-east-1:367191799875:certificate/40b0df57-78f4-4167-b457-775da3e13210` |
| Account | 367191799875 (submit-ci) |
| Region | us-east-1 (so it fronts CloudFront) |
| Primary domain | `*.submit.diyaccounting.co.uk`, 5 domains total |
| Expires | 2026-09-04 23:59:59 UTC |
| Failing domain | **`ci-auth.diyaccounting.co.uk`** — its validation CNAME is not present |
| Raised | AWS Health event 2026-08-29 01:27 UTC |

`ci-auth.diyaccounting.co.uk` is the Cognito custom domain for the CI environment.
Its validation record belongs in the Route53 hosted zone in the **management**
account (887764105431), which the root repo owns. The certificate lives in
submit-ci. That split is the shape of the problem.

## What breaks if it expires

CI loses HTTPS. Synthetic tests, behaviour tests and deploy smoke tests against the
CI environment all fail, so the estate loses its pre-production gate during a
fortnight of active change (cross-account backups, the GA4 pipeline, the
reconciliation programme).

Customer filing is unaffected. Recovery after expiry is reissue rather than
anything worse, so this is urgent by date and moderate by consequence. Do not let
it displace the statutory items on the board.

## Immediate fix

1. Read the required CNAME. Read-only, no approval needed:

   ```bash
   aws --profile submit-ci acm describe-certificate \
     --region us-east-1 \
     --certificate-arn arn:aws:acm:us-east-1:367191799875:certificate/40b0df57-78f4-4167-b457-775da3e13210 \
     --query 'Certificate.DomainValidationOptions[?DomainName==`ci-auth.diyaccounting.co.uk`].ResourceRecord'
   ```

2. Add that CNAME to the hosted zone in the management account. This is a mutating
   AWS write in an account the workspace rules guard: present the command and wait
   for approval before running it.

3. ACM retries validation once the record resolves, normally within the hour. Poll
   `describe-certificate` until `DomainValidationOptions[].ValidationStatus` reads
   `SUCCESS` for every domain and `Status` reads `ISSUED`.

## Resolution 2026-08-30

- The validation CNAME was added to zone Z0315522208PWZSSBI9AL with operator approval at
  ~21:10 UTC; `ci-auth.diyaccounting.co.uk` flipped to `SUCCESS` at 21:16 UTC. ACM reissued the
  certificate the same evening: RenewalStatus SUCCESS, NotAfter 2027-03-15.
- Durable fix: the detection route, PR #62 (`certificate-check.yml`) — weekly, fails when
  any in-use ACM certificate in ci or prod (both regions) has a domain not validating or
  expires within 30 days. Chosen over a CDK-managed record because the record lives in the
  management account's zone, which this repo's CDK cannot own.

## Evidence gathered 2026-08-30

- Renewal is `PENDING_VALIDATION` on exactly one domain, `ci-auth.diyaccounting.co.uk`;
  the other four validation CNAMEs are still present in zone Z0315522208PWZSSBI9AL.
- The certificate was issued 2026-02-19 by DNS validation, so the ci-auth CNAME existed
  then and was removed later.
- CloudTrail (management account, us-east-1, where Route53's global events land): 230
  `ChangeResourceRecordSets` events between 2026-06-02 and 2026-08-30, none touching any
  `ci-auth` record. The 2026-08-25 destroy dispatches are ruled out; the removal predates
  2026-06-02, outside the 90-day lookup window, so the actor is not attributable.
- Verdict: B is ruled out for the recent destroys; whether the February record was removed
  by an older teardown or by hand is not recoverable. The durable fix must not depend on
  knowing, so build the detection check.

## Root cause to establish before closing

The record is absent. Two candidate explanations, and they imply different fixes:

**A. It was never created.** The certificate is requested in submit-ci with DNS
validation, but the hosted zone is in the management account, so CDK could not
create the record cross-account and it was added by hand once. Nothing then keeps
it in place.

**B. A teardown removed it.** Targeted `destroy-prod` runs were dispatched on
2026-08-25 to remove three duplicate deployments. If a destroy can delete a
validation record while leaving the certificate, this recurs at every renewal
following every destroy — and the estate's stated teardown philosophy is that
stacks must be cleanly destroyable, so destroys will keep happening.

B is the one worth ruling in or out first, because it predicts recurrence. Check
CloudTrail in the management account for `ChangeResourceRecordSets` deletions
touching `_*.ci-auth.diyaccounting.co.uk` around the destroy dispatches.

## Durable fix

Whichever cause holds, the validation record should be infrastructure rather than a
manual step. The work is a cross-account DNS record owned by the root repo's CDK,
created alongside the certificate and not removable by a submit-side destroy.

If that turns out to be awkward, the fallback is a check rather than a fix: an
alarm or scheduled job that fails when any ACM certificate in the estate has a
domain whose `ValidationStatus` is not `SUCCESS`. That converts a five-day
scramble into a notification months ahead, and it generalises to every certificate
rather than this one.

Either way, do not close this on the record being added. It closes when the same
failure cannot happen silently again.

## Verification criteria

- `describe-certificate` reports `Status: ISSUED` and `ValidationStatus: SUCCESS`
  for all five domains, before 2026-09-04.
- The CI environment serves HTTPS and its synthetic test goes green.
- Root cause is stated in this plan as A or B, with the evidence that settled it.
- The validation record is either CDK-managed, or a detection check exists that
  would have caught this at least a month before expiry. Say which was chosen.

## Related

- `root.diyaccounting.co.uk` owns Route53 and the management account.
- Issue #43 carries the drift findings; a missing DNS record that CloudFormation
  believes it created is drift by another name, and worth cross-checking there.
