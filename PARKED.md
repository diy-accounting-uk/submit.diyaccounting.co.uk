<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Parked during cool-down

One line each; the operator triages when cool-down lifts.

- ci self-destruct leaves `ApiStack` DELETE_FAILED on the Billing Cognito authorizer
  (`AWS::ApiGatewayV2::Authorizer`, "InternalFailure"): `ci-claud824f` at 23:41 UTC on 2026-09-14
  and `ci-claud727f` at 18:23 UTC on 2026-09-15. `destroy-ci.yml`'s sweep force-deletes it on its
  next firing, so nothing stands for long; the self-destruct Lambda could retry with
  `--deletion-mode FORCE_DELETE_STACK` itself, or `ApiStack` could delete the authorizer before the
  API. Not a customer-facing degradation; the sweep covers it.
