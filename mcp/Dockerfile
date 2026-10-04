# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# The submission MCP's stdio server as an image: an MCP client runs it with
# `docker run -i --rm ghcr.io/diy-accounting-uk/diya-submit-mcp`. Build from the directory scripts/stage-package.js writes.

FROM node:24-slim

LABEL org.opencontainers.image.source="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk"
LABEL org.opencontainers.image.description="DIY Accounting Submit's MCP server over stdio"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY lib ./lib

USER node
ENTRYPOINT ["node", "bin/diya-submit-mcp.js"]
