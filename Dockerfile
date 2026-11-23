# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Optimized Dockerfile for AWS Lambda with ARM64 architecture
# Uses multi-stage build with cross-compilation:
#   - Builder stage runs on the build host's native arch (x86_64 on GitHub Actions)
#   - Final stage targets ARM64 for Lambda
# All production deps are pure JavaScript, so node_modules are architecture-portable.

# Builder stage: runs natively on the build host (no QEMU emulation)
# Uses node:22-slim instead of the Lambda image — only needs npm for dependency install.
FROM --platform=$BUILDPLATFORM node:24-slim AS builder

WORKDIR /build

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY web/public/submit.catalogue.toml web/public/submit.catalogue.toml
COPY web/public/lib/services/catalogue-aggregates.js web/public/lib/services/catalogue-aggregates.js

# Install only production dependencies
# --ignore-scripts: skip native compilation (none needed for our pure-JS deps)
RUN npm ci --omit=dev --ignore-scripts

# The hosted MCP handler imports the SDK from mcp/node_modules
COPY mcp/package.json mcp/package-lock.json mcp/
RUN npm ci --omit=dev --ignore-scripts --prefix mcp

# Final stage: ARM64 Lambda base image
FROM public.ecr.aws/lambda/nodejs:24

LABEL org.opencontainers.image.licenses="LicenseRef-PolyForm-Internal-Use-1.0.0" \
      org.opencontainers.image.vendor="DIY Accounting Limited" \
      org.opencontainers.image.title="DIY Accounting Submit" \
      org.opencontainers.image.source="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk" \
      org.opencontainers.image.documentation="https://submit.diyaccounting.co.uk/docs/api/" \
      org.opencontainers.image.url="https://submit.diyaccounting.co.uk"

# Copy dependencies from builder (pure JS, architecture-independent)
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/web/public/submit.catalogue.toml ./web/public/submit.catalogue.toml
COPY --from=builder /build/web/public/lib/services/catalogue-aggregates.js ./web/public/lib/services/catalogue-aggregates.js
COPY --from=builder /build/mcp/node_modules ./mcp/node_modules

# Copy application code
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services
# The accounts route and the accounts form share the balance sheet's arithmetic, the approval date rule and the revised receipt rules from here.
COPY web/public/lib/balance-sheet-check.js web/public/lib/balance-sheet-check.js
COPY web/public/lib/approval-date-check.js web/public/lib/approval-date-check.js
COPY web/public/lib/accounts-revision.js web/public/lib/accounts-revision.js
COPY web/public/lib/accounts-notes-check.js web/public/lib/accounts-notes-check.js
COPY web/public/lib/first-accounts.js web/public/lib/first-accounts.js
# The long date the first accounts line prints, which first-accounts.js imports.
COPY web/public/lib/long-period.js web/public/lib/long-period.js
# The Companies House forms table: the filing route, the status poll, the presenter poll and the receipt emails read it.
COPY web/public/lib/companies-house-forms.js web/public/lib/companies-house-forms.js
# The gateway's character rule the form routes and the confirmation statement route share with the pages.
COPY web/public/lib/companies-house-gateway-text.js web/public/lib/companies-house-gateway-text.js
# The company name rule the change of name route shares with its page.
COPY web/public/lib/companies-house-company-name.js web/public/lib/companies-house-company-name.js
# The share capital arithmetic the return of allotment route shares with its page.
COPY web/public/lib/share-capital.js web/public/lib/share-capital.js
# The register check of a revision that names no receipt, shared by the accounts route and its page.
COPY web/public/lib/accounts-revision-register.js web/public/lib/accounts-revision-register.js
# The due list's business id rule and row types, which the due list routes share with the page.
COPY web/public/lib/due/due-business-id.js web/public/lib/due/due-business-id.js
COPY web/public/lib/due/due-row-types.js web/public/lib/due/due-row-types.js
COPY mcp/package.json mcp/package.json
COPY mcp/lib mcp/lib
COPY mcp/bin mcp/bin
COPY submit.passes.toml submit.passes.toml
COPY lifecycle.toml lifecycle.toml
COPY referrals.toml referrals.toml
COPY running-costs.toml running-costs.toml
COPY secrets-rotation.toml secrets-rotation.toml
# stripeReconcile.js reads the donation Payment Links' bundle ids from here to resolve a
# historic charge that carries no bundle metadata of its own.
COPY infra/stripe/stripe.toml infra/stripe/stripe.toml
# adsCostPull.js reads the Ads customer id and API version from here.
COPY infra/google/ads/ads.toml infra/google/ads/ads.toml
# msAdsCostPull.js reads the Microsoft Advertising account and secret names from here.
COPY infra/microsoft/ads/msads.toml infra/microsoft/ads/msads.toml

# Lambda will use CMD override from CDK EcrImageCodeProps
