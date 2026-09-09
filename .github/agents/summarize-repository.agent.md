---
name: Summarize Repository
description: Produces an information-dense overview of the repository structure and context.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Repository Summarizer Agent

Purpose: Generate a hierarchical, information-dense summary of the repository to provide context for AI agents or developers.

## Responsibilities

1. **Architecture Overview**: Describe the top-level directory structure and the core technology stack (AWS serverless, Node.js, Java CDK).
2. **Component Mapping**: Create a detailed map of directories down to individual files, with a brief sentence on the purpose of each.
3. **Build & Script Context**: Summarize the operations supported by `package.json` and `pom.xml` (e.g., build, test, deploy scripts).
4. **Environment Configuration**: Detail the purpose of each `.env.*` file and list the required environment variables.
5. **Workflow Analysis**: Describe the GitHub Actions workflows and what they accomplish.
6. **Deployment Model**: Explain how components interact in both the local Express environment and the AWS Lambda environment.

## Output Requirements

- Use Markdown headers to organize the summary.
- Use tables for file and directory listings.
- Maintain a high density of information without unnecessary fluff.
- Highlight security and environment considerations up front.

## Success Criteria

- A comprehensive, easy-to-read summary that covers all major areas of the repository.
- Accurate mapping of files to their functional roles.
- Clear explanation of build and deployment processes.

> Avoid reformatting files you are not otherwise changing; prefer to match the existing local style where strict formatting updates would be jarring.
