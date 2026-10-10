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
COPY --from=builder /build/mcp/node_modules ./mcp/node_modules

# Copy application code
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services
COPY mcp/package.json mcp/package.json
COPY mcp/lib mcp/lib
COPY mcp/bin mcp/bin
COPY submit.passes.toml submit.passes.toml
COPY lifecycle.toml lifecycle.toml
COPY secrets-rotation.toml secrets-rotation.toml
# stripeReconcile.js reads the donation Payment Links' bundle ids from here to resolve a
# historic charge that carries no bundle metadata of its own.
COPY infra/stripe/stripe.toml infra/stripe/stripe.toml
# adsCostPull.js reads the Ads customer id and API version from here.
COPY infra/google/ads/ads.toml infra/google/ads/ads.toml

# Lambda will use CMD override from CDK EcrImageCodeProps
