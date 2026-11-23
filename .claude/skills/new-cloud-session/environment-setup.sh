#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited
#
# The setup script of the claude.ai/code cloud environment "DIY Accounting Submit", which holds the
# submit-cloud-<codename> work repositories (../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_CLOUD_COLLABORATION.md). It is pasted into the
# environment's "Setup script" box; this copy is the record. The same script serves an environment that
# holds spreadsheets-cloud-<codename> work repositories: each section runs for the checkouts it names.
# The environment also sets:
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
# age v1.3.2 (the collaborate skill decrypts the AWS credentials handoff with it); the sha256 is the
# one GitHub records for the release asset, and cloud-credentials.yml pins the same release
if ! /usr/local/bin/age --version 2>/dev/null | grep -qx 'v1.3.2'; then
curl -fsSL -o /tmp/age.tar.gz https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz
echo "cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10  /tmp/age.tar.gz" | sha256sum -c -
tar -xzf /tmp/age.tar.gz -C /tmp
install -m 0755 /tmp/age/age /tmp/age/age-keygen /usr/local/bin/
rm -rf /tmp/age /tmp/age.tar.gz
fi
# AWS CLI v2 (scripts/proxy-secrets.sh) and ssh-keygen (the collaborate skill's handoff key);
# the VM image has neither
if ! command -v aws >/dev/null 2>&1; then
curl -fsSL -o /tmp/awscliv2.zip https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
(cd /tmp && unzip -q -o awscliv2.zip && ./aws/install --update)
rm -rf /tmp/aws /tmp/awscliv2.zip
fi
if ! command -v ssh-keygen >/dev/null 2>&1; then
apt-get update -qq && apt-get install -y -qq openssh-client
fi
node --version
java -version
age --version
aws --version
# Dependencies and the Playwright browser, in each work repository checkout (the script starts in
# /home/user, one level above the checkout)
for d in submit-cloud-*/; do
if [ -f "$d/package-lock.json" ]; then
(cd "$d" && npm ci && (cd mcp && npm ci) && npx playwright install --with-deps chromium)
fi
done
# A spreadsheets-cloud-<codename> checkout: the npm test router's calc tier recalculates the workbooks
# with LibreOffice (without it the verdict is PARTIAL), and its browser tier needs the Playwright
# Chromium. Neither is installed for a submit checkout alone.
for d in spreadsheets-cloud-*/; do
if [ -f "$d/package-lock.json" ]; then
if ! command -v soffice >/dev/null 2>&1; then
apt-get update -qq && apt-get install -y -qq --no-install-recommends libreoffice-calc
fi
soffice --version
(cd "$d" && npm ci && npx playwright install --with-deps chromium)
fi
done
