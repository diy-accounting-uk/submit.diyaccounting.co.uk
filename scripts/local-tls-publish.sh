#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/local-tls-publish.sh
#
# certbot --deploy-hook target: publishes a renewed local.submit.diyaccounting.co.uk
# certificate to AWS Secrets Manager so CI reads the same cert as the developer's browser.
# certbot sets RENEWED_LINEAGE to the live cert directory before running this hook.

set -euo pipefail

aws --profile submit-ci secretsmanager put-secret-value \
  --secret-id ci/submit/local-tls/certificate \
  --region eu-west-2 \
  --secret-string "$(jq -n \
     --rawfile c "$RENEWED_LINEAGE/fullchain.pem" \
     --rawfile k "$RENEWED_LINEAGE/privkey.pem" \
     '{fullchain:$c, privkey:$k}')"
