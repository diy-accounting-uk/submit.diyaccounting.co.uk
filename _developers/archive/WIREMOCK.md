<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# WireMock Recording and Mock Playback

This document explains how to use WireMock's recording and mock playback features for testing.

## Overview

WireMock can record HTTP interactions with external APIs and then play them back during testing. This is useful for:
- Creating deterministic tests that don't depend on external services
- Testing against APIs that have rate limits or costs
- Developing and testing offline
- Capturing real API responses for regression testing

## How It Works

### Recording Mode
In recording mode, WireMock acts as a proxy that:
1. Forwards requests to the real API (targetBaseUrl)
2. Records the request and response
3. Saves the recordings as stub mapping files

### Mock Mode
In mock mode, WireMock:
1. Loads stub mapping files from the recordings directory
2. Matches incoming requests against the stubs
3. Returns the recorded responses without calling the real API

## Usage

### Recording HTTP Interactions

To record interactions with HMRC APIs during a behavior test:

```bash
# Record bundle behavior test
TEST_WIREMOCK=record npx dotenv -e .env.proxy -- npm run test:bundleBehaviour

# Record VAT obligations test
TEST_WIREMOCK=record npx dotenv -e .env.proxy -- npm run test:getVatObligationsBehaviour

# Record VAT submission test
TEST_WIREMOCK=record npx dotenv -e .env.proxy -- npm run test:submitVatBehaviour
```

Alternatively, you can use the pre-configured npm scripts:

```bash
npm run test:bundleBehaviour-proxy-record
```

### Playing Back Recorded Mocks

To run tests using previously recorded interactions:

```bash
# Use recorded mocks for bundle behavior test
TEST_WIREMOCK=mock npx dotenv -e .env.proxy -- npm run test:bundleBehaviour

# Use recorded mocks for other tests
TEST_WIREMOCK=mock npx dotenv -e .env.proxy -- npm run test:getVatObligationsBehaviour
```

Or use the pre-configured npm scripts:

```bash
npm run test:bundleBehaviour-proxy-mock
```

## Configuration

The WireMock configuration is controlled by environment variables in `.env.proxy`:

```bash
# WireMock mode: "off" (default), "record", or "mock"
TEST_WIREMOCK=off

# WireMock environment/directory name
WIREMOCK_MOCK_ENVIRONMENT=proxy

# Port for WireMock to listen on
WIREMOCK_PORT=9090

# Directory where recordings are saved/loaded
WIREMOCK_RECORD_OUTPUT_DIR=wiremock-recordings/proxy
```

## Recording Directory Structure

Recordings are saved in the following structure:

```
wiremock-recordings/
└── proxy/
    ├── mappings/          # Stub mapping files (request/response definitions)
    │   ├── get-xxx.json
    │   └── post-yyy.json
    └── __files/           # Response body files (optional, for large responses)
        └── body-xxx.json
```

## Stub Mapping Format

Each recording is saved as a JSON file in the `mappings/` directory:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "request": {
    "method": "GET",
    "urlPath": "/hello/world",
    "queryParameters": {
      "param": {
        "equalTo": "value"
      }
    }
  },
  "response": {
    "status": 200,
    "body": "{\"message\": \"Hello World\"}",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

## Tips and Best Practices

1. **Clean Recordings**: Remove any sensitive data (API keys, tokens) from recordings before committing them

2. **Version Control**: Commit recordings to git so tests can run without requiring access to external APIs

3. **Update Recordings**: When the external API changes, re-record to update your stubs:
   ```bash
   rm -rf wiremock-recordings/proxy/mappings/*
   TEST_WIREMOCK=record npx dotenv -e .env.proxy -- npm run test:bundleBehaviour
   ```

4. **Selective Recording**: Record only the tests you need - you don't have to record everything at once

5. **Mock in CI**: Use mock mode in CI/CD pipelines for faster, more reliable tests:
   ```bash
   TEST_WIREMOCK=mock npm test
   ```

## Troubleshooting

### No recordings are created
- Ensure `TEST_WIREMOCK=record` is set
- Check that HMRC_BASE_URI or HMRC_SANDBOX_BASE_URI is configured
- Verify WireMock started successfully (check logs)
- Ensure the test actually makes HTTP requests

### Recordings not matching in mock mode
- Check the URL paths and query parameters match exactly
- WireMock is case-sensitive
- Verify the stub mapping files are valid JSON
- Check WireMock logs for matching details (verbose mode is enabled)

### "UUID has to be represented by standard 36-char representation" error
- The `id` field in stub mapping files must be a valid UUID
- Use a UUID generator or let WireMock generate them automatically during recording

## Technical Details

The WireMock integration is implemented in:
- `behaviour-tests/helpers/wiremock-helper.js` - Core recording and playback logic
- Uses WireMock standalone JAR (version 3.13.2) from the npm package
- Starts WireMock as a child process during test execution
- Automatically configures HMRC API endpoints to route through WireMock

## Further Reading

- [WireMock Documentation](https://wiremock.org/docs/)
- [WireMock Recording](https://wiremock.org/docs/record-playback/)
- [Stub Mapping Format](https://wiremock.org/docs/stubbing/)
