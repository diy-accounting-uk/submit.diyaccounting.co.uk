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

# Final stage: ARM64 Lambda base image
FROM public.ecr.aws/lambda/nodejs:24

# Copy dependencies from builder (pure JS, architecture-independent)
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/web/public/submit.catalogue.toml ./web/public/submit.catalogue.toml

# Copy application code
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services
COPY submit.passes.toml submit.passes.toml
COPY lifecycle.toml lifecycle.toml
COPY secrets-rotation.toml secrets-rotation.toml

# Lambda will use CMD override from CDK EcrImageCodeProps
