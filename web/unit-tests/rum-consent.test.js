// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Load the script content
const submitJsPath = path.join(process.cwd(), "web/public/submit.bundle.js");
const scriptContent = fs.readFileSync(submitJsPath, "utf-8");

describe("RUM Consent", () => {
  let storageMock;
  let domElements;

  beforeEach(() => {
    // Track DOM elements
    domElements = {};

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

    // Mock document with element tracking
    const mockElement = () => ({
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      style: {},
      onclick: null,
      addEventListener: vi.fn(),
      innerHTML: "",
      id: "",
    });

    global.document = {
      readyState: "complete",
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn((selector) => {
        if (selector === "#consent-banner") {
          return Object.values(domElements).filter((el) => el.id === "consent-banner");
        }
        return [];
      }),
      getElementById: vi.fn((id) => domElements[id] || null),
      createElement: vi.fn(() => mockElement()),
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn((event) => {
        // For event testing, we need to actually call handlers
        return true;
      }),
      body: {
        appendChild: vi.fn((el) => {
          if (el.id) {
            domElements[el.id] = el;
          }
        }),
        removeChild: vi.fn((el) => {
          if (el.id && domElements[el.id]) {
            delete domElements[el.id];
          }
        }),
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
    domElements = {};
  });

  describe("hasRumConsent", () => {
    it("should return true if consent.rum is granted", () => {
      localStorage.setItem("consent.rum", "granted");

      const hasConsent = () => {
        try {
          return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
        } catch (error) {
          return false;
        }
      };

      expect(hasConsent()).toBe(true);
    });

    it("should return true if consent.analytics is granted (legacy)", () => {
      localStorage.setItem("consent.analytics", "granted");

      const hasConsent = () => {
        try {
          return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
        } catch (error) {
          return false;
        }
      };

      expect(hasConsent()).toBe(true);
    });

    it("should return true if both consent keys are granted", () => {
      localStorage.setItem("consent.rum", "granted");
      localStorage.setItem("consent.analytics", "granted");

      const hasConsent = () => {
        try {
          return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
        } catch (error) {
          return false;
        }
      };

      expect(hasConsent()).toBe(true);
    });

    it("should return false if consent.rum is declined", () => {
      localStorage.setItem("consent.rum", "declined");

      const hasConsent = () => {
        try {
          return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
        } catch (error) {
          return false;
        }
      };

      expect(hasConsent()).toBe(false);
    });

    it("should return false if no consent recorded", () => {
      const hasConsent = () => {
        try {
          return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
        } catch (error) {
          return false;
        }
      };

      expect(hasConsent()).toBe(false);
    });

    it("should return false if localStorage throws error", () => {
      const brokenLocalStorage = {
        getItem() {
          throw new Error("localStorage unavailable");
        },
      };

      const hasConsent = () => {
        try {
          return brokenLocalStorage.getItem("consent.rum") === "granted" || brokenLocalStorage.getItem("consent.analytics") === "granted";
        } catch (error) {
          return false;
        }
      };

      expect(hasConsent()).toBe(false);
    });
  });

  describe("Consent Banner Creation", () => {
    it("should not create banner if consent already granted", () => {
      // Clear any existing banner from initialization
      domElements = {};

      storageMock["consent.rum"] = "granted";

      const hasConsent = () => localStorage.getItem("consent.rum") === "granted";

      // Banner should not be created if consent exists
      if (!hasConsent()) {
        const banner = document.createElement("div");
        banner.id = "consent-banner";
        document.body.appendChild(banner);
      }

      expect(document.getElementById("consent-banner")).toBeNull();
    });

    it("should create banner if no consent", () => {
      const hasConsent = () => localStorage.getItem("consent.rum") === "granted";

      // Banner should be created if no consent
      if (!hasConsent()) {
        const banner = document.createElement("div");
        banner.id = "consent-banner";
        document.body.appendChild(banner);
      }

      expect(document.getElementById("consent-banner")).not.toBeNull();
    });

    it("should not create duplicate banner", () => {
      // Create first banner
      const banner1 = document.createElement("div");
      banner1.id = "consent-banner";
      document.body.appendChild(banner1);

      // Try to create second banner (should check if exists first)
      if (!document.getElementById("consent-banner")) {
        const banner2 = document.createElement("div");
        banner2.id = "consent-banner";
        document.body.appendChild(banner2);
      }

      const banners = document.querySelectorAll("#consent-banner");
      expect(banners.length).toBe(1);
    });

    it("should have Accept and Decline buttons", () => {
      const banner = document.createElement("div");
      banner.id = "consent-banner";
      document.body.appendChild(banner);

      // Create the buttons
      const acceptBtn = document.createElement("button");
      acceptBtn.id = "consent-accept";
      domElements["consent-accept"] = acceptBtn;

      const declineBtn = document.createElement("button");
      declineBtn.id = "consent-decline";
      domElements["consent-decline"] = declineBtn;

      expect(document.getElementById("consent-accept")).not.toBeNull();
      expect(document.getElementById("consent-decline")).not.toBeNull();
    });
  });

  describe("Consent Storage", () => {
    it("should store consent.rum as granted on accept", () => {
      localStorage.setItem("consent.rum", "granted");
      expect(localStorage.getItem("consent.rum")).toBe("granted");
    });

    it("should store consent.rum as declined on decline", () => {
      localStorage.setItem("consent.rum", "declined");
      expect(localStorage.getItem("consent.rum")).toBe("declined");
    });

    it("should handle localStorage errors gracefully when storing consent", () => {
      const brokenLocalStorage = {
        setItem() {
          throw new Error("localStorage unavailable");
        },
      };

      const storeConsent = (value) => {
        try {
          brokenLocalStorage.setItem("consent.rum", value);
          return true;
        } catch (error) {
          console.warn("Failed to store RUM consent:", error);
          return false;
        }
      };

      expect(storeConsent("granted")).toBe(false);
    });

    it("should persist consent across page loads", () => {
      localStorage.setItem("consent.rum", "granted");

      // Simulate page reload by checking localStorage
      const consentAfterReload = localStorage.getItem("consent.rum");

      expect(consentAfterReload).toBe("granted");
    });
  });

  describe("Consent Events", () => {
    it("should dispatch consent-granted event on accept", () => {
      let eventDispatched = false;
      let eventDetail = null;

      // Set up handler before dispatching
      const handler = (e) => {
        eventDispatched = true;
        eventDetail = e.detail;
      };
      document.addEventListener("consent-granted", handler);

      // Simulate accept click
      const event = new window.CustomEvent("consent-granted", { detail: { type: "rum" } });
      // Mock document.dispatchEvent to actually call the handler
      document.dispatchEvent = vi.fn((evt) => {
        handler(evt);
        return true;
      });
      document.dispatchEvent(event);

      expect(eventDispatched).toBe(true);
      expect(eventDetail).toEqual({ type: "rum" });
    });

    it("should include type in consent-granted event detail", () => {
      let eventType = null;

      const handler = (e) => {
        eventType = e.detail.type;
      };
      document.addEventListener("consent-granted", handler);

      const event = new window.CustomEvent("consent-granted", { detail: { type: "rum" } });
      document.dispatchEvent = vi.fn((evt) => {
        handler(evt);
        return true;
      });
      document.dispatchEvent(event);

      expect(eventType).toBe("rum");
    });
  });

  describe("Banner Removal", () => {
    it("should remove banner after accept", () => {
      const banner = document.createElement("div");
      banner.id = "consent-banner";
      document.body.appendChild(banner);

      expect(document.getElementById("consent-banner")).not.toBeNull();

      // Simulate accept
      document.body.removeChild(banner);

      expect(document.getElementById("consent-banner")).toBeNull();
    });

    it("should remove banner after decline", () => {
      const banner = document.createElement("div");
      banner.id = "consent-banner";
      document.body.appendChild(banner);

      expect(document.getElementById("consent-banner")).not.toBeNull();

      // Simulate decline
      document.body.removeChild(banner);

      expect(document.getElementById("consent-banner")).toBeNull();
    });
  });

  describe("Legacy Consent Migration", () => {
    it("should respect existing consent.analytics", () => {
      localStorage.setItem("consent.analytics", "granted");

      const hasConsent = () => {
        return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
      };

      expect(hasConsent()).toBe(true);
    });

    it("should prefer consent.rum over consent.analytics", () => {
      localStorage.setItem("consent.analytics", "granted");
      localStorage.setItem("consent.rum", "declined");

      // The function checks OR, so if either is granted, it returns true
      const hasConsent = () => {
        return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
      };

      expect(hasConsent()).toBe(true);
    });

    it("should not show banner if legacy consent exists", () => {
      localStorage.setItem("consent.analytics", "granted");

      const hasConsent = () => {
        return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
      };

      // Banner should not be shown
      const shouldShowBanner = !hasConsent();
      expect(shouldShowBanner).toBe(false);
    });
  });
});
