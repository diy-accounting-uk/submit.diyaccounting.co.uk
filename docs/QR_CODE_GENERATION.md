<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# QR Code Generation for Pass Details

## Overview

The `generate-pass.yml` workflow now automatically generates QR codes for each pass invitation code. These QR codes can be scanned to quickly access the bundle redemption page.

## Features

Each generated pass includes:
- **QR Code PNG** (300x300 pixels) - Downloadable from workflow artifacts
- **Terminal QR Code** - Displayed in workflow logs for quick verification
- **Pass Details JSON** - Complete metadata including QR code filename

## How to Use

### 1. Generate Passes

Run the `generate-pass.yml` workflow from GitHub Actions:

```
Actions → Generate Pass → Run workflow
```

Configure:
- **Pass Type**: Select from dropdown (day-guest-test-pass, day-guest-pass, etc.)
- **Environment**: ci or prod
- **Quantity**: Number of passes to generate
- **Email**: (Optional) Restrict pass to specific email
- **Notes**: (Optional) Admin notes

### 2. View QR Codes in Workflow Output

The workflow logs display:
- Pass details (code, URL, bundle, validity, etc.)
- ASCII QR code for each pass (visible in terminal)

### 3. Download QR Code Images

From the workflow summary:
1. Scroll to **Artifacts** section
2. Download `passes-{type}-{run-id}` artifact
3. Extract the zip file

The artifact contains:
```
passes-output.json          # Pass details in JSON format
qr-codes/
  qr-{pass-code-1}.png     # QR code for first pass
  qr-{pass-code-2}.png     # QR code for second pass
  ...
```

### 4. Use QR Codes

QR codes can be:
- **Printed** on invitations or marketing materials
- **Embedded** in emails or PDFs
- **Shared** on social media or messaging apps
- **Displayed** on screens at events

When scanned, the QR code redirects to:
```
https://{environment}.submit.diyaccounting.co.uk/bundles.html?pass={code}
```

## Pass Details JSON

The `passes-output.json` file contains complete metadata:

```json
[
  {
    "code": "tiger-happy-mountain-silver",
    "url": "https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver",
    "bundleId": "day-guest",
    "passTypeId": "day-guest-test-pass",
    "maxUses": 1,
    "usesRemaining": 1,
    "validFrom": "2026-01-01T00:00:00.000Z",
    "validUntil": "2026-01-08T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "qrCodeFile": "qr-tiger-happy-mountain-silver.png"
  }
]
```

## Programmatic Usage

### Generate QR Code Locally

```javascript
import { generatePassQrCodeBuffer } from './app/lib/qrCodeGenerator.js';
import fs from 'fs';

// Generate PNG QR code
const buffer = await generatePassQrCodeBuffer({
  code: 'my-pass-code',
  url: 'https://submit.diyaccounting.co.uk/bundles.html?pass=my-pass-code',
});

fs.writeFileSync('qr-code.png', buffer);
```

### Customize QR Code Options

```javascript
const buffer = await generatePassQrCodeBuffer({
  code: 'my-pass-code',
  url: 'https://submit.diyaccounting.co.uk/bundles.html?pass=my-pass-code',
  options: {
    width: 400,              // Width in pixels (default: 300)
    margin: 2,               // Margin in modules (default: 4)
    errorCorrectionLevel: 'H' // L, M, Q, H (default: 'M')
  }
});
```

## QR Code Specifications

- **Format**: PNG image
- **Size**: 300x300 pixels (default)
- **Error Correction**: Medium (M) - recovers from ~15% damage
- **Encoding**: UTF-8 URL string
- **Content**: Full redemption URL with pass code

## Testing

Unit tests:
```bash
npm run test:unit -- app/unit-tests/lib/qrCodeGenerator.test.js
```

System tests:
```bash
npx vitest --run app/system-tests/qrCodeGeneration.system.test.js
```

## Related Documentation

- `submit.passes.toml` - Pass type definitions
- `app/services/passService.js` - Pass creation service
- `.github/workflows/generate-pass.yml` - Pass generation workflow
