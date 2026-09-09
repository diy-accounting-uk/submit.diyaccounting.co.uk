<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Here a few competing objectives that I think we can solve but let's talk though the options. Here are the things I would like to have. 1. An experience in the 'proxy' and 'ci' that
allows me to have a 'prod' like testable deployed app with, for example, a live like HMRC endopoint that only differs from prod because the nominally 'live' secret is actually the
sandbox secret, cognito auth (but the ci instance with a cognito native account instead of Google), a test Stripe account, real Telegram groups but the ci named ones. 2. A way to test
the production catalogue, pass, activity, token and submission behaviours in ci. 3. A way to run the sythentic tests against 'prod' with the prod bundles being selected, but the
actual filings going to the sandbox and the payments going via a test stripe. 4. In ci the Telegram config is only aware of a test and a live destination channel 'diy-ci-test' and
'diy-ci-live' and ci picks between them based on cognito native vs social user pool, while prod is only aware of a test and a live destination channel 'diy-prod-test' and
'diy-prod-live'. 5. (and this is a change from the original brief) telegram channels 'diy-ci-ops' and 'diy-prod-ops' which is where the system alerts go, I haven't created these but I
can, I want to plan first. 6. The ability to give a human tester a pass to access the day guest package in prod but when they submit it's to the HMRC sandbox and test stripe, and a
pass to access the resident pro bundle but when they submit it's to the HMRC sandbox and test stripe. 7. I can manually issue special test passes which trigger this behaviour while
issuing passes to live beta test customers that sumit to live HMRC and pay with live Stripe. 8. (optional but perhaps useful to reverse a mistep) Ditch the 'test' product catalog
item, this might be getting in the way by over fitting tests so we have too many test specific code paths.
