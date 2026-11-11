#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Install Chromium and its system packages for Playwright. Try up to three times.
# The runner's apt mirror sometimes cannot resolve its host name ("Temporary failure
# resolving 'azure.archive.ubuntu.com'"). After a failed try, apt is pointed at
# archive.ubuntu.com instead and its lists are refreshed.
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
    sudo sed -i 's|azure.archive.ubuntu.com|archive.ubuntu.com|g' /etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2>/dev/null || true
    sudo apt-get update -o Acquire::Retries=3 || true
  fi
done
echo "Playwright install failed after $attempts tries" >&2
exit 1
