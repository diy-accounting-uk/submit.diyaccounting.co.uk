<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Key-Gated Open Source: A Practical Approach to Transparent Source Protection

**Abstract**

We present *key-gated open source*, a software distribution pattern that combines the transparency benefits of open source licensing with practical protection against wholesale code reuse. Unlike source-available licenses that impose legal restrictions, or obfuscation that degrades code quality, key-gated open source encrypts essential modules while maintaining full OSI-compliant licensing. The approach requires no legal innovation—it leverages standard cryptographic primitives and runtime module loading to create a practical barrier to competition while preserving auditability, community engagement, and open source ecosystem benefits. We describe the implementation, analyze the security model, and discuss appropriate use cases.

---

## 1. Introduction

Open source software faces a fundamental tension: the transparency that enables trust, security auditing, and community contribution also enables competitors to deploy functionally identical services with minimal investment. Traditional responses to this tension fall into three categories:

1. **Proprietary licensing**: Withholding source code entirely
2. **Source-available licensing**: Publishing source with usage restrictions (BSL, FSL, SSPL)
3. **Open core**: Open sourcing commodity components while keeping differentiating features proprietary

Each approach involves trade-offs. Proprietary licensing sacrifices transparency. Source-available licenses sacrifice OSI compliance and may affect ecosystem benefits (CI/CD pricing, community perception). Open core creates maintenance burden and unclear boundaries.

We propose a fourth approach: **key-gated open source**. The complete source code is published under a standard open source license (e.g., AGPL-3.0), but essential modules are encrypted. Without the decryption key, the software will not execute. Competitors must either obtain the key (kept secret by the maintainer) or re-implement the encrypted modules from scratch.

## 2. Threat Model

Key-gated open source addresses a specific threat: **low-effort cloning** by competitors who would otherwise fork, rebrand, and deploy with minimal modification.

It does *not* address:
- Determined reverse engineering (always possible given sufficient resources)
- Legal disputes over licensing terms
- Nation-state adversaries

The security goal is **raising the effort bar**, not preventing all competition. For niche SaaS applications, the effort required to re-implement encrypted modules may exceed the effort of building from scratch, eliminating the advantage of cloning.

## 3. Implementation

### 3.1 Cryptographic Scheme

We employ hybrid encryption combining RSA and AES:

1. Generate RSA-4096 keypair (public key published, private key secret)
2. For each protected module:
   - Generate random AES-256 key and 96-bit IV
   - Encrypt module source with AES-256-GCM (authenticated encryption)
   - Encrypt AES key with RSA-OAEP using public key
   - Package as: `[key_length][encrypted_aes_key][iv][auth_tag][ciphertext]`

### 3.2 Runtime Loading

Protected modules are loaded at runtime via a synchronous decryption and evaluation mechanism:

```javascript
import { loadProtectedModuleSync } from './battery-pack/loader.js';

const impl = loadProtectedModuleSync(
  new URL('./core.impl.js.enc', import.meta.url)
);

export const { processData } = impl;
```

The loader:
1. Checks cache (decrypt once per process)
2. Retrieves private key from environment or file
3. Decrypts ciphertext
4. Evaluates decrypted JavaScript in module context
5. Returns exports

### 3.3 Key Distribution

Private keys are distributed through standard secrets management:
- **Development**: File in project root (gitignored)
- **CI/CD**: Environment variable (GitHub Secrets, etc.)
- **Production**: Cloud secrets manager (AWS Secrets Manager, HashiCorp Vault)

## 4. License Compliance

Key-gated open source is compatible with OSI-approved licenses including copyleft licenses like AGPL-3.0. The Open Source Definition requires:

1. Free redistribution
2. Source code availability
3. Derived works allowed
4. Integrity of author's source code
5. No discrimination against persons or fields
6. Distribution of license
7. License not specific to a product
8. License not restricting other software
9. License technology-neutral

Encrypted blobs satisfy these requirements: the source code (including encrypted files) is freely redistributable, anyone can fork and modify, and the license imposes no usage restrictions. The encryption key is operational data, analogous to API credentials or database passwords—necessary for operation but not part of the source code distribution.

This interpretation aligns with common practice: many open source projects require external services (databases, APIs, cloud infrastructure) that are not themselves open source.

## 5. Security Analysis

### 5.1 Cryptographic Strength

The scheme uses well-established primitives:
- RSA-4096 with OAEP padding (quantum-resistant timeline: ~15-20 years)
- AES-256-GCM (256-bit security, authenticated encryption)
- Cryptographically secure random IV per encryption

Breaking the encryption without the key is computationally infeasible.

### 5.2 Practical Attacks

**Key compromise**: If the private key leaks, all encrypted modules are exposed. Mitigation: standard key management hygiene, rotation capability.

**Reverse engineering**: A determined attacker can analyze the wrapper modules, understand the expected interface, and re-implement. This is by design—the goal is effort, not impossibility.

**Runtime extraction**: An attacker with access to a running process could extract decrypted modules from memory. Mitigation: this requires deployment access, which implies trust.

### 5.3 Comparison with Alternatives

| Approach | Transparency | OSI Compliant | Clone Protection | Effort to Bypass |
|----------|--------------|---------------|------------------|------------------|
| Proprietary | None | No | Legal | Reverse engineering |
| Source-available | Full | No | Legal | Licensing violation |
| Obfuscation | Degraded | Yes | None | De-obfuscation |
| **Key-gated** | Full | Yes | Practical | Re-implementation |

## 6. Appropriate Use Cases

Key-gated open source is appropriate when:

1. **Transparency is required** for trust, auditing, or regulatory compliance
2. **OSI compliance matters** for ecosystem benefits or community perception
3. **The protected code is non-trivial** to re-implement
4. **The threat is casual cloning**, not determined adversaries

Examples: niche B2B SaaS, regulated industry software, projects with complex domain logic.

It is *not* appropriate when:
- Perfect protection is required (use proprietary)
- The protected code is trivial (obfuscation provides no value)
- Legal enforcement is preferred (use source-available licenses)

## 7. Combining with Copyleft

Key-gated open source pairs effectively with strong copyleft licenses like AGPL-3.0. If a competitor re-implements the encrypted modules and distributes or deploys as a network service, they must publish their implementation under the same license.

This creates a strategic choice for competitors:
1. Re-implement and publish (contributing to the ecosystem)
2. Build entirely from scratch (no code reuse benefit)
3. Negotiate a commercial license with the maintainer

## 8. Conclusion

Key-gated open source provides a middle path between full openness and proprietary protection. By separating legal rights (preserved via open source licensing) from practical executability (restricted via encryption), it enables maintainers to balance transparency with business sustainability.

The approach requires no legal innovation, uses standard cryptographic tools, and integrates with existing development workflows. For appropriate use cases—niche applications where re-implementation effort provides sufficient deterrence—it offers a practical solution to the open source sustainability challenge.

---

## References

1. Open Source Initiative. "The Open Source Definition." https://opensource.org/osd
2. MariaDB Corporation. "Business Source License 1.1." https://mariadb.com/bsl11/
3. Sentry. "Functional Source License." https://fsl.software/
4. Keygen. "Fair Core License." https://fcl.dev/
5. NIST. "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM)." SP 800-38D.

---

*Battery Pack reference implementation: https://github.com/[repository]*
