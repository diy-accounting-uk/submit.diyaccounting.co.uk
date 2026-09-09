<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Claude Code Memory - Key-Gated Open Source (Battery Pack)

## Quick Reference

This repository implements **key-gated open source** — a pattern for protecting open source projects by encrypting essential modules while keeping the source code publicly visible and properly licensed.

**Core concept**: The source code is genuinely open source (AGPL-3.0), but key components are encrypted. Without the private key, the code won't run. Competitors must re-implement the encrypted modules from scratch.

## Repository Structure

```
.
├── app/lib/battery-pack/     # The encryption library
│   ├── index.js              # Main exports
│   ├── crypto.js             # RSA+AES hybrid encryption
│   ├── loader.js             # Runtime decryption and module loading
│   ├── cli.js                # Command-line tools
│   └── test/                 # Unit tests
├── scripts/
│   └── battery-pack.sh       # Convenience wrapper for CLI
├── _developers/
│   ├── KEY_GATED_OPEN_SOURCE.md    # Concept explanation
│   └── KEY_GATED_OPEN_SOURCE.pdf   # Academic-style paper
├── .github/workflows/
│   └── battery-pack-example.yml    # CI integration example
├── CLAUDE.md                 # This file
├── README.md                 # User-facing documentation
├── LICENSE                   # MIT License (for the tool itself)
└── battery-pack.pub          # Example public key (for demos only)
```

## How It Works

1. **Keypair**: RSA-4096 keypair. Public key committed, private key secret.
2. **Encryption**: AES-256-GCM encrypts the module, RSA-OAEP encrypts the AES key.
3. **Loading**: At runtime, `loadProtectedModuleSync()` decrypts and evals the module.
4. **Caching**: Decrypted modules cached per-process. Decrypt once, use many times.

## Key Commands

```bash
# Generate keypair (one-time setup)
node app/lib/battery-pack/cli.js keygen

# Encrypt a module
node app/lib/battery-pack/cli.js encrypt path/to/module.js

# Decrypt (for debugging)
node app/lib/battery-pack/cli.js decrypt path/to/module.js.enc

# Run tests
node --test app/lib/battery-pack/test/*.test.js
```

## Integration Pattern

Protected modules use a **wrapper pattern**:

```javascript
// app/services/myService.js (committed, readable)
import { loadProtectedModuleSync } from '../lib/battery-pack/index.js';

const impl = loadProtectedModuleSync(
  new URL('./myService.impl.js.enc', import.meta.url)
);

export const { doThing, doOtherThing } = impl;
```

Consuming code imports normally — no changes needed:

```javascript
// app/functions/handler.js (unchanged)
import { doThing } from '../services/myService.js';
```

## Private Key Sources (checked in order)

1. `BATTERY_PACK_PRIVATE_KEY` env var (base64-encoded PEM)
2. `BATTERY_PACK_PRIVATE_KEY_FILE` env var (path to file)
3. `./battery-pack.key` file in project root
4. `BATTERY_PACK_PRIVATE_KEY_ARN` env var (AWS Secrets Manager, async only)

## Development Workflow

**Local development**: Place `battery-pack.key` in project root. Tests and server just work.

**CI**: Set `BATTERY_PACK_PRIVATE_KEY` secret in GitHub Actions.

**Production**: Either decrypt at build time (simpler) or use AWS Secrets Manager ARN.

## Code Quality Rules

Same as the parent submit.diyaccounting.co.uk project:

- No unnecessary formatting changes
- No fallback paths for silent failures
- No backwards-compatible aliases — update all callers
- Tests must pass: `node --test app/lib/battery-pack/test/*.test.js`

## What to Encrypt

Good candidates (essential, non-trivial):
- API client implementations
- Core business logic
- Authentication handlers
- License/entitlement checkers

Bad candidates (too easy to replace or needs to be readable):
- Utility functions
- Configuration
- UI components

## Security Model

This is **deterrence, not DRM**:
- Determined attackers can reverse-engineer
- The goal is raising effort bar, not perfect protection
- Combines with AGPL: if they re-implement and share, they must share under AGPL

## Testing

```bash
# Run all battery-pack tests
node --test app/lib/battery-pack/test/*.test.js

# Quick validation
node -e "import('./app/lib/battery-pack/index.js').then(m => console.log('Exports:', Object.keys(m)))"
```

## License

The battery-pack tool itself is MIT licensed (permissive, for wide adoption).
Projects using it can be any license (AGPL recommended for the key-gating strategy).
