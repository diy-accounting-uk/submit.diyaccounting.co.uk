---
paths: app/functions/**/*.js
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Lambda Function Rules

## Structure Pattern

```javascript
export const handler = async (event, context) => {
  try {
    // 1. Extract from event (query, path, headers, body)
    // 2. Validate input
    // 3. Business logic
    // 4. AWS service calls (DynamoDB, Secrets Manager)
    // 5. Return response
    return { statusCode: 200, headers: {...}, body: JSON.stringify(result) };
  } catch (error) {
    logger.error({ error, event }, 'Lambda execution failed');
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
```

## Naming

- Files: `{feature}{Method}.js` (e.g., `hmrcVatReturnPost.js`)
- Handlers: `{feature}Handler` or `ingestHandler`

## Error Handling

- Use Pino logger with structured logging
- Include correlation IDs for tracing
- Return appropriate HTTP status codes
- Never add fallback paths that hide failures

## Security

- Validate all user input
- Use AWS Secrets Manager for secrets (via ARN env vars)
- Check JWT validation in `customAuthorizer.js`
- Verify bundle entitlements before feature access
