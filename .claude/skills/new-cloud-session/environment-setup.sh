#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited
#
# The setup script of the claude.ai/code cloud environment "DIY Accounting Submit", which holds the
# submit-cloud-<codename> work repositories (PLAN_CLOUD_COLLABORATION.md). It is pasted into the
# environment's "Setup script" box; this copy is the record. The environment also sets:
#   BASH_DEFAULT_TIMEOUT_MS=3600000
#   BASH_MAX_TIMEOUT_MS=3600000
#   JAVA_HOME=/opt/jdk25
#   VITEST_MAX_WORKERS=4        (CP1: vitest.config.js reads it; default 50%)
#   PW_BROWSER_WORKERS=2        (CP1: the browser-tests project reads it; default 1)
#   PW_VIDEO=off and PW_TRACE=off (CP1: the browser-tests project drops video and trace)
#   MAVEN_ARGS=-Dmaven.resolver.transport=wagon (Maven's native transport does not trust the VM's proxy certificate)
# Network access: Full.
set -euo pipefail
# Node 24 (package.json engines); /opt/node22/bin precedes /usr/local/bin on PATH
if ! /usr/local/bin/node --version 2>/dev/null | grep -q '^v24'; then
f=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | grep -o 'node-v24[^ ]*-linux-x64.tar.xz' | head -1)
curl -fsSL "https://nodejs.org/dist/latest-v24.x/$f" | tar -xJ -C /usr/local --strip-components=1
fi
if [ -d /opt/node22/bin ]; then ln -sf /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx /opt/node22/bin/; fi
# JDK 25 (pom.xml target); JAVA_HOME=/opt/jdk25 is set in the environment variables
if [ ! -x /opt/jdk25/bin/java ]; then
mkdir -p /opt/jdk25
curl -fsSL "https://api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jdk/hotspot/normal/eclipse" | tar -xz -C /opt/jdk25 --strip-components=1
ln -sf /opt/jdk25/bin/* /usr/local/bin/
fi
node --version
java -version
# Dependencies and the Playwright browser, in each work repository checkout (the script starts in
# /home/user, one level above the checkout)
for d in submit-cloud-*/; do
if [ -f "$d/package-lock.json" ]; then
(cd "$d" && npm ci && (cd mcp && npm ci) && npx playwright install --with-deps chromium)
fi
done
