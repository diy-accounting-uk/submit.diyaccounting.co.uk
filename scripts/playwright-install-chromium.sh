#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Install Chromium and its system packages for Playwright. Try up to three times.
# The runner's apt mirror sometimes cannot resolve its host name ("Temporary failure
# resolving 'azure.archive.ubuntu.com'"). When that name does not resolve, apt is pointed at
# archive.ubuntu.com before the first try. The runner's sources read the host from the mirror
# list /etc/apt/apt-mirrors.txt, so that file changes too.
# Usage: scripts/playwright-install-chromium.sh

set -uo pipefail

use_archive_mirror() {
  sudo sed -i 's|azure.archive.ubuntu.com|archive.ubuntu.com|g' /etc/apt/apt-mirrors.txt /etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2>/dev/null || true
  sudo apt-get update -o Acquire::Retries=3 || true
}

if ! getent hosts azure.archive.ubuntu.com >/dev/null; then
  echo "azure.archive.ubuntu.com does not resolve; using archive.ubuntu.com"
  use_archive_mirror
fi

attempts=3
for attempt in $(seq 1 "$attempts"); do
  if npx playwright install chromium --with-deps; then
    exit 0
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "Playwright install failed (try $attempt of $attempts); refreshing apt lists and trying again in 30 seconds"
    sleep 30
    use_archive_mirror
  fi
done
echo "Playwright install failed after $attempts tries" >&2
exit 1
