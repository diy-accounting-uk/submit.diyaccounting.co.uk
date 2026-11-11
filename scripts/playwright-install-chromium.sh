#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Install Chromium and its system packages for Playwright. Try up to three times.
# The runner's apt mirror sometimes cannot resolve its host name ("Temporary failure
# resolving 'azure.archive.ubuntu.com'"). Each new try refreshes the apt lists first.
# Usage: scripts/playwright-install-chromium.sh

set -uo pipefail

attempts=3
for attempt in $(seq 1 "$attempts"); do
  if npx playwright install chromium --with-deps; then
    exit 0
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "Playwright install failed (try $attempt of $attempts); refreshing apt lists and trying again in 30 seconds"
    sleep 30
    sudo apt-get update -o Acquire::Retries=3 || true
  fi
done
echo "Playwright install failed after $attempts tries" >&2
exit 1
