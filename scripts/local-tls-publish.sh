#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd

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
