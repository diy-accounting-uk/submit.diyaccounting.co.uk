<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Gov-Vendor-License-IDs

The Submit service is a web application delivered as a SaaS. Its source is
available under the PolyForm Internal Use License 1.0.0. It does not install
licensed software on the client device, and it does not use per-device or
per-user vendor license keys.

In accordance with HMRC Fraud Prevention guidance, this header is omitted
because the data does not exist.

HMRC confirmed: "Please omit the header" (4 Feb 2026 review).

# Gov-Client-Public-Port

Extracted server-side from the `CloudFront-Viewer-Address` header, which provides
the client's IP and source port in the format `ip:port` (IPv4) or `[ipv6]:port`.
CloudFront adds this header automatically. The EdgeStack Origin Request Policy
forwards it to API Gateway using `OriginRequestHeaderBehavior.all("CloudFront-Viewer-Address")`.

# Gov-Vendor-Public-IP

Detected at Lambda cold start by calling `https://checkip.amazonaws.com`.
The result is cached in a module-level variable for the lifetime of the Lambda
execution environment (warm invocations reuse the cached value).

This MUST be different from Gov-Client-Public-IP. The code intentionally does NOT
fall back to the client IP when vendor IP detection fails — the header is omitted
instead, as HMRC rejects submissions where vendor IP equals client IP.
