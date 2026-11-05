#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability DEV-16 Fetch the local TLS certificate
# - **Use when:** a developer sets up local HTTPS for local.submit.diyaccounting.co.uk, or the stored certificate has been renewed.
# - **Does:** local-tls-fetch.sh reads the Secrets Manager secret `ci/submit/local-tls/certificate` with the `diya-submit-ci` profile. It writes fullchain.pem and privkey.pem (mode 600) to the directory that app/bin/server.js reads. The local-tls-renew.yml workflow is the only writer of the secret.
# - **Run:** `scripts/local-tls-fetch.sh`
# - **Entry:** `scripts/local-tls-fetch.sh`
# - **Files:** scripts/local-tls-fetch.sh, app/bin/server.js, .github/workflows/local-tls-renew.yml
# - **Keywords:** local tls, certificate, fullchain, privkey, secrets manager, local.submit, https
# - **Related:** OPS-171, DEV-15
# @end-capability

#
# scripts/local-tls-fetch.sh
#
# Writes the stored local TLS certificate to the directory the local HTTPS server reads.
# Usage: scripts/local-tls-fetch.sh

set -euo pipefail

PROFILE="${AWS_PROFILE:-diya-submit-ci}"
REGION="eu-west-2"
SECRET_ID="ci/submit/local-tls/certificate"
LINEAGE_DIR="$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk"

SECRET="$(aws --profile "$PROFILE" secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" --region "$REGION" --query SecretString --output text)"

umask 077
mkdir -p "$LINEAGE_DIR"
printf '%s' "$SECRET" | jq -r .fullchain > "$LINEAGE_DIR/fullchain.pem.new"
printf '%s' "$SECRET" | jq -r .privkey > "$LINEAGE_DIR/privkey.pem.new"
chmod 600 "$LINEAGE_DIR/fullchain.pem.new" "$LINEAGE_DIR/privkey.pem.new"
mv "$LINEAGE_DIR/fullchain.pem.new" "$LINEAGE_DIR/fullchain.pem"
mv "$LINEAGE_DIR/privkey.pem.new" "$LINEAGE_DIR/privkey.pem"

NOT_AFTER="$(openssl x509 -in "$LINEAGE_DIR/fullchain.pem" -noout -enddate | cut -d= -f2)"
echo "Certificate written to $LINEAGE_DIR (expires $NOT_AFTER)"
