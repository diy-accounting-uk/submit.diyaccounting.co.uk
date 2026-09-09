#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# One-way pull from the analytics lake's nightly raw export into the workspace root, the shape
# of drive/pull.sh: sync mirrors the remote, so an object removed from the lake (by its
# lifecycle rule) is removed locally too, and local-only edits under the target directory are
# overwritten. index/corpus.toml's `analytics` source reads the destination tree; run `reindex`
# after a pull to pick up the new day.
#
# Usage:
#   AWS_PROFILE=submit-ci scripts/analytics-pull.sh ci
#   AWS_PROFILE=submit-prod scripts/analytics-pull.sh prod
set -euo pipefail

ENV_NAME="${1:-ci}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HERE/../analytics/${ENV_NAME}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
LAKE="${ENV_NAME}-env-analytics-lake-${ACCOUNT}"

mkdir -p "$DEST"

echo "Environment:  ${ENV_NAME}"
echo "Lake bucket:  ${LAKE}"
echo "Destination:  ${DEST}"

aws s3 sync "s3://${LAKE}/exports/${ENV_NAME}/" "$DEST" --delete
