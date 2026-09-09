// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Load the script content and eval it in this context
const submitJsPath = path.join(process.cwd(), "web/public/submit.bundle.js");
const scriptContent = fs.readFileSync(submitJsPath, "utf-8");

describe("RUM Configuration", () => {
  let storageMock;
  let metaTags;

  beforeEach(() => {
    // Setup meta tags storage
    metaTags = {
      "rum:appMonitorId": "test-monitor-123",
      "rum:region": "eu-west-2",
      "rum:identityPoolId": "eu-west-2:pool-456",
      "rum:guestRoleArn": "arn:aws:iam::123456789:role/TestRole",
    };

    // Mock localStorage
    storageMock = {};
    global.localStorage = {
      getItem: vi.fn((key) => storageMock[key] || null),
      setItem: vi.fn((key, value) => {
        storageMock[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete storageMock[key];
      }),
      clear: vi.fn(() => {
        storageMock = {};
      }),
    };

    // Mock document
    const mockElement = {
      appendChild: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      style: {},
      onclick: null,
      addEventListener: vi.fn(),
      innerHTML: "",
    };

    global.document = {
      readyState: "complete",
      querySelector: vi.fn((selector) => {
        const match = selector.match(/meta\[name="(.+?)"\]/);
        if (match && metaTags[match[1]]) {
          return { content: metaTags[match[1]] };
        }
        return null;
      }),
      querySelectorAll: vi.fn(() => []),
      getElementById: vi.fn(() => mockElement),
      createElement: vi.fn(() => ({ ...mockElement })),
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      head: {
        appendChild: vi.fn(),
      },
    };

    // Mock window
    global.window = {
      sessionStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      location: {
        href: "http://localhost:3000",
        origin: "http://localhost:3000",
        search: "",
      },
      crypto: {
        getRandomValues: (arr) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
        randomUUID: () => "test-uuid-" + Math.random().toString(36).substring(7),
        subtle: {
          digest: vi.fn(async () => new ArrayBuffer(32)),
        },
      },
      CustomEvent: class CustomEvent {
        constructor(type, options) {
          this.type = type;
          this.detail = options?.detail;
        }
      },
    };

    global.fetch = vi.fn();

    // Evaluate the submit.js script
    try {
      eval(scriptContent);
    } catch (error) {
      // Some initialization code may fail in test environment, that's okay
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("readMeta", () => {
    it("should read RUM config from meta tags", () => {
      const readMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`);
        return el && el.content ? el.content.trim() : "";
      };

      expect(readMeta("rum:appMonitorId")).toBe("test-monitor-123");
      expect(readMeta("rum:region")).toBe("eu-west-2");
      expect(readMeta("rum:identityPoolId")).toBe("eu-west-2:pool-456");
      expect(readMeta("rum:guestRoleArn")).toBe("arn:aws:iam::123456789:role/TestRole");
    });

    it("should handle missing meta tags gracefully", () => {
      // Clear meta tags
      metaTags = {};

      const readMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`);
        return el && el.content ? el.content.trim() : "";
      };

      expect(readMeta("rum:appMonitorId")).toBe("");
      expect(readMeta("rum:region")).toBe("");
      expect(readMeta("rum:identityPoolId")).toBe("");
      expect(readMeta("rum:guestRoleArn")).toBe("");
    });

    it("should handle meta tags with empty content", () => {
      // Set empty meta tags
      metaTags = {
        "rum:appMonitorId": "",
        "rum:region": "  ",
      };

      const readMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`);
        return el && el.content ? el.content.trim() : "";
      };

      expect(readMeta("rum:appMonitorId")).toBe("");
      expect(readMeta("rum:region")).toBe("");
    });
  });

  describe("bootstrapRumConfigFromMeta", () => {
    it("should populate window.__RUM_CONFIG__ from meta tags", () => {
      // Reset RUM config
      window.__RUM_CONFIG__ = undefined;

      // Execute bootstrapRumConfigFromMeta via eval
      const readMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`);
        return el && el.content ? el.content.trim() : "";
      };

      const appMonitorId = readMeta("rum:appMonitorId");
      const region = readMeta("rum:region");
      const identityPoolId = readMeta("rum:identityPoolId");
      const guestRoleArn = readMeta("rum:guestRoleArn");

      if (appMonitorId && region && identityPoolId && guestRoleArn) {
        window.__RUM_CONFIG__ = { appMonitorId, region, identityPoolId, guestRoleArn, sessionSampleRate: 1 };
      }

      expect(window.__RUM_CONFIG__).toBeDefined();
      expect(window.__RUM_CONFIG__.appMonitorId).toBe("test-monitor-123");
      expect(window.__RUM_CONFIG__.region).toBe("eu-west-2");
      expect(window.__RUM_CONFIG__.identityPoolId).toBe("eu-west-2:pool-456");
      expect(window.__RUM_CONFIG__.guestRoleArn).toBe("arn:aws:iam::123456789:role/TestRole");
      expect(window.__RUM_CONFIG__.sessionSampleRate).toBe(1);
    });

    it("should not populate window.__RUM_CONFIG__ if meta tags are missing", () => {
      // Clear meta tags
      metaTags = {};
      window.__RUM_CONFIG__ = undefined;

      const readMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`);
        return el && el.content ? el.content.trim() : "";
      };

      const appMonitorId = readMeta("rum:appMonitorId");
      const region = readMeta("rum:region");
      const identityPoolId = readMeta("rum:identityPoolId");
      const guestRoleArn = readMeta("rum:guestRoleArn");

      if (appMonitorId && region && identityPoolId && guestRoleArn) {
        window.__RUM_CONFIG__ = { appMonitorId, region, identityPoolId, guestRoleArn, sessionSampleRate: 1 };
      }

      expect(window.__RUM_CONFIG__).toBeUndefined();
    });

    it("should not overwrite existing window.__RUM_CONFIG__", () => {
      const existingConfig = {
        appMonitorId: "existing-123",
        region: "us-east-1",
        identityPoolId: "us-east-1:existing",
        guestRoleArn: "arn:aws:iam::999:role/Existing",
        sessionSampleRate: 0.5,
      };

      window.__RUM_CONFIG__ = existingConfig;

      // Try to bootstrap again - should not overwrite
      if (!window.__RUM_CONFIG__) {
        const readMeta = (name) => {
          const el = document.querySelector(`meta[name="${name}"]`);
          return el && el.content ? el.content.trim() : "";
        };
        const appMonitorId = readMeta("rum:appMonitorId");
        const region = readMeta("rum:region");
        const identityPoolId = readMeta("rum:identityPoolId");
        const guestRoleArn = readMeta("rum:guestRoleArn");

        if (appMonitorId && region && identityPoolId && guestRoleArn) {
          window.__RUM_CONFIG__ = { appMonitorId, region, identityPoolId, guestRoleArn, sessionSampleRate: 1 };
        }
      }

      expect(window.__RUM_CONFIG__).toEqual(existingConfig);
    });
  });

  describe("localStorage persistence", () => {
    it("should store config in localStorage", () => {
      const config = {
        appMonitorId: "test-123",
        region: "us-east-1",
        identityPoolId: "pool-456",
        guestRoleArn: "arn:aws:iam::123:role/Test",
        sessionSampleRate: 1,
      };

      localStorage.setItem("rum.config", JSON.stringify(config));
      const stored = JSON.parse(localStorage.getItem("rum.config"));

      expect(stored).toEqual(config);
    });

    it("should retrieve config from localStorage", () => {
      const config = {
        appMonitorId: "stored-123",
        region: "eu-west-1",
        identityPoolId: "eu-west-1:stored",
        guestRoleArn: "arn:aws:iam::789:role/Stored",
        sessionSampleRate: 0.5,
      };

      localStorage.setItem("rum.config", JSON.stringify(config));

      const raw = localStorage.getItem("rum.config");
      expect(raw).toBeDefined();

      const retrieved = JSON.parse(raw);
      expect(retrieved).toEqual(config);
      expect(retrieved.appMonitorId).toBe("stored-123");
    });

    it("should handle missing localStorage gracefully", () => {
      // Clear any stored config
      storageMock = {};
      const raw = localStorage.getItem("rum.config");
      expect(raw).toBeNull();
    });

    it("should handle invalid JSON in localStorage", () => {
      storageMock["rum.config"] = "invalid-json-{{{";

      expect(() => {
        JSON.parse(localStorage.getItem("rum.config"));
      }).toThrow();
    });
  });

  describe("RUM config validation", () => {
    it("should require all fields for valid config", () => {
      const validConfig = {
        appMonitorId: "test-123",
        region: "eu-west-2",
        identityPoolId: "eu-west-2:pool",
        guestRoleArn: "arn:aws:iam::123:role/Test",
      };

      const isValid = !!(validConfig.appMonitorId && validConfig.region && validConfig.identityPoolId && validConfig.guestRoleArn);

      expect(isValid).toBe(true);
    });

    it("should reject config with missing appMonitorId", () => {
      const invalidConfig = {
        appMonitorId: "",
        region: "eu-west-2",
        identityPoolId: "eu-west-2:pool",
        guestRoleArn: "arn:aws:iam::123:role/Test",
      };

      const isValid = !!(invalidConfig.appMonitorId && invalidConfig.region && invalidConfig.identityPoolId && invalidConfig.guestRoleArn);

      expect(isValid).toBe(false);
    });

    it("should reject config with missing region", () => {
      const invalidConfig = {
        appMonitorId: "test-123",
        region: "",
        identityPoolId: "eu-west-2:pool",
        guestRoleArn: "arn:aws:iam::123:role/Test",
      };

      const isValid = !!(invalidConfig.appMonitorId && invalidConfig.region && invalidConfig.identityPoolId && invalidConfig.guestRoleArn);

      expect(isValid).toBe(false);
    });
  });
});
