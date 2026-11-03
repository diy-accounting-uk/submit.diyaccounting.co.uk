// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/productVersion.js
// The name and release version from package.json: the VAT fraud headers and the CT600
// channel Version both send them.

import { readFileSync } from "fs";

const { name: rawPackageName, version: packageVersion } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));

export const PRODUCT_VERSION = packageVersion;
// Strip npm scope prefix (e.g., @org/package -> package) for cleaner HMRC product name
export const PACKAGE_NAME = rawPackageName.startsWith("@") ? rawPackageName.split("/")[1] : rawPackageName;
