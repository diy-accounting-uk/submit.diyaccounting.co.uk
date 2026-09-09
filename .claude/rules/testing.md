---
paths:
  - app/unit-tests/**/*.js
  - app/system-tests/**/*.js
  - web/unit-tests/**/*.js
  - web/browser-tests/**/*.js
  - behaviour-tests/**/*.js
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Testing Rules

## Test File Naming

- Pattern: `*.test.js`
- Location matches source structure

## Frameworks

| Type | Framework | Config |
|------|-----------|--------|
| Unit/System | Vitest | `vitest.config.js` |
| Browser/Behaviour | Playwright | `playwright.config.js` |

## Unit Tests

- Fast, isolated, no external dependencies
- Use `happy-dom` for DOM testing
- Mock external APIs with MSW

## System Tests

- Use `testcontainers` pattern with Docker
- Real DynamoDB via dynalite
- Real OAuth2 via mock server

## Browser Tests

- Playwright with real browser
- Test UI components and navigation

## Behaviour Tests

- End-to-end user journeys
- Page object pattern
- Environment variants: `-proxy`, `-ci`, `-prod`
- Always pipe output to file (too verbose for console)

## Writing New Tests

- Business logic: Unit tests expected
- API endpoints: System + behaviour tests
- UI changes: Browser tests
- Critical flows only: Behaviour tests
