# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/zap/zap-hooks.py
#
# Hook file for zap-baseline.py (--hook). It requests every path in seed-urls.json so the
# spider's site tree and the passive scan include the pages and API routes that no link reaches,
# then writes the URLs the scan holds to zap-urls.json for scripts/check-zap-urls.js.

import json

SEED_FILE = "/zap/hooks/seed-urls.json"
URLS_FILE = "/zap/wrk/zap-urls.json"


def zap_started(zap, target):
    with open(SEED_FILE) as seed_file:
        paths = json.load(seed_file)["paths"]
    base = target.rstrip("/")
    for path in paths:
        zap.core.access_url(base + path, followredirects="true")


def zap_pre_shutdown(zap):
    with open(URLS_FILE, "w") as urls_file:
        json.dump({"urls": zap.core.urls()}, urls_file)
