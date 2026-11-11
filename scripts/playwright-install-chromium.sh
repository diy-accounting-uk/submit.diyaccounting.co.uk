#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Install Chromium for Playwright. The GitHub runner image already holds the system packages
# Chromium needs, so the script downloads the browser only and starts it once. It installs the
# system packages with apt only when that start fails, because the runner's apt mirror is
# sometimes unreachable ("Temporary failure resolving 'azure.archive.ubuntu.com'") or very slow.
# Usage: scripts/playwright-install-chromium.sh

set -uo pipefail

chromium_starts() {
  node -e "require('playwright').chromium.launch().then((b) => b.close()).catch((e) => { console.error(e.message); process.exit(1); })"
}

use_archive_mirror() {
  # The runner's sources read the host from the mirror list /etc/apt/apt-mirrors.txt.
  sudo sed -i 's|azure.archive.ubuntu.com|archive.ubuntu.com|g' /etc/apt/apt-mirrors.txt /etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2>/dev/null || true
  sudo apt-get update -o Acquire::Retries=3 || true
}

attempts=3
for attempt in $(seq 1 "$attempts"); do
  if npx playwright install chromium; then
    break
  fi
  if [ "$attempt" -eq "$attempts" ]; then
    echo "Chromium download failed after $attempts tries" >&2
    exit 1
  fi
  echo "Chromium download failed (try $attempt of $attempts); trying again in 30 seconds"
  sleep 30
done

if chromium_starts; then
  echo "Chromium starts with the runner's system packages"
  exit 0
fi

echo "Chromium does not start; installing its system packages with apt"
if ! getent hosts azure.archive.ubuntu.com >/dev/null; then
  echo "azure.archive.ubuntu.com does not resolve; using archive.ubuntu.com"
  use_archive_mirror
fi
for attempt in $(seq 1 "$attempts"); do
  if npx playwright install-deps chromium && chromium_starts; then
    exit 0
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "System package install failed (try $attempt of $attempts); refreshing apt lists and trying again in 30 seconds"
    sleep 30
    use_archive_mirror
  fi
done
echo "Chromium system packages failed after $attempts tries" >&2
exit 1
