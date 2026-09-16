#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/github-actions-permissions.sh
#
# Narrows which actions this repository's workflows may use: GitHub-owned and
# Marketplace-verified actions, plus the third-party actions the workflows name.
# With --require-sha it also turns on sha_pinning_required, which refuses any
# `uses:` line still on a tag; run that only once every workflow is pinned.
#
#   scripts/github-actions-permissions.sh                # allow list only
#   scripts/github-actions-permissions.sh --require-sha  # allow list and SHA pinning
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-diy-accounting-uk/submit.diyaccounting.co.uk}"
REQUIRE_SHA=false
[[ "${1:-}" == "--require-sha" ]] && REQUIRE_SHA=true

# Every third-party action the workflows use; actions/* and github/* are
# covered by github_owned_allowed.
PATTERNS='["aws-actions/configure-aws-credentials@*","docker/setup-buildx-action@*","docker/setup-qemu-action@*","astral-sh/setup-uv@*","softprops/action-gh-release@*","google-github-actions/auth@*"]'

echo "Setting allowed_actions=selected, sha_pinning_required=${REQUIRE_SHA} on ${REPO}"
gh api -X PUT "repos/${REPO}/actions/permissions" \
  -F enabled=true -f allowed_actions=selected -F "sha_pinning_required=${REQUIRE_SHA}"

echo "Setting the selected-actions allow list"
printf '{"github_owned_allowed":true,"verified_allowed":true,"patterns_allowed":%s}' "${PATTERNS}" \
  | gh api -X PUT "repos/${REPO}/actions/permissions/selected-actions" --input -

gh api "repos/${REPO}/actions/permissions"
echo
gh api "repos/${REPO}/actions/permissions/selected-actions"
echo
