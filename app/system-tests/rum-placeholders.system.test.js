// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("RUM Placeholder Replacement", () => {
  const htmlFiles = [
    "web/public/index.html",
    "web/public/privacy.html",
    // Add more files that have RUM meta tags
  ];

  // Test that source files contain placeholders (before deployment)
  it.each(htmlFiles)("should contain placeholders in source file %s", (filePath) => {
    const content = readFileSync(join(process.cwd(), filePath), "utf-8");

    // Source files should have placeholders
    expect(content).toContain("${RUM_APP_MONITOR_ID}");
    expect(content).toContain("${AWS_REGION}");
    expect(content).toContain("${RUM_IDENTITY_POOL_ID}");
    expect(content).toContain("${RUM_GUEST_ROLE_ARN}");
  });

  it("should have rum:appMonitorId meta tag in index.html", () => {
    const content = readFileSync(join(process.cwd(), "web/public/index.html"), "utf-8");
    expect(content).toMatch(/meta name="rum:appMonitorId"/);
  });

  it("should have rum:region meta tag in index.html", () => {
    const content = readFileSync(join(process.cwd(), "web/public/index.html"), "utf-8");
    expect(content).toMatch(/meta name="rum:region"/);
  });

  it("should have rum:identityPoolId meta tag in index.html", () => {
    const content = readFileSync(join(process.cwd(), "web/public/index.html"), "utf-8");
    expect(content).toMatch(/meta name="rum:identityPoolId"/);
  });

  it("should have rum:guestRoleArn meta tag in index.html", () => {
    const content = readFileSync(join(process.cwd(), "web/public/index.html"), "utf-8");
    expect(content).toMatch(/meta name="rum:guestRoleArn"/);
  });

  it("should have RUM meta tags with placeholder values", () => {
    const content = readFileSync(join(process.cwd(), "web/public/index.html"), "utf-8");

    // Verify placeholders are present (not replaced yet in source)
    const appMonitorMatch = content.match(/meta name="rum:appMonitorId" content="([^"]*)"/);
    const regionMatch = content.match(/meta name="rum:region" content="([^"]*)"/);
    const poolMatch = content.match(/meta name="rum:identityPoolId" content="([^"]*)"/);
    const roleMatch = content.match(/meta name="rum:guestRoleArn" content="([^"]*)"/);

    expect(appMonitorMatch).toBeTruthy();
    expect(regionMatch).toBeTruthy();
    expect(poolMatch).toBeTruthy();
    expect(roleMatch).toBeTruthy();

    // In source files, these should be placeholders
    expect(appMonitorMatch[1]).toBe("${RUM_APP_MONITOR_ID}");
    expect(regionMatch[1]).toBe("${AWS_REGION}");
    expect(poolMatch[1]).toBe("${RUM_IDENTITY_POOL_ID}");
    expect(roleMatch[1]).toBe("${RUM_GUEST_ROLE_ARN}");
  });
});

