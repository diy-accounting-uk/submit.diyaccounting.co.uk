import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const envLoaderPath = path.join(process.cwd(), "web/public/lib/env-loader.js");
const authUrlBuilderPath = path.join(process.cwd(), "web/public/lib/auth-url-builder.js");

// Helper to load and evaluate a script in a mock browser environment
function evaluateScript(filePath, context) {
  const content = fs.readFileSync(filePath, "utf-8");
  // Wrap in a function that provides the necessary globals
  const wrapper = new Function("window", "fetch", "Headers", "localStorage", "sessionStorage", "console", content);
  wrapper(context, global.fetch, global.Headers, context.localStorage, context.sessionStorage, context.console);
}

const envFile = `
# This is a comment
COGNITO_CLIENT_ID=client123
COGNITO_BASE_URI=https://auth.example.com/
HMRC_CLIENT_ID=hmrc-live-id
HMRC_BASE_URI=https://api.service.hmrc.gov.uk/
HMRC_SANDBOX_CLIENT_ID=hmrc-sandbox-id
HMRC_SANDBOX_BASE_URI=https://test-api.service.hmrc.gov.uk
DIY_SUBMIT_BASE_URL=https://submit.example.com/
`;

describe("Auth URL Generation", () => {
  let mockWindow;

  function respondWithEnv({ delayMs = 0 } = {}) {
    global.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          const respond = () => resolve({ ok: true, text: () => Promise.resolve(envFile) });
          if (delayMs > 0) setTimeout(respond, delayMs);
          else respond();
        }),
    );
  }

  function loadScripts() {
    evaluateScript(envLoaderPath, mockWindow);
    evaluateScript(authUrlBuilderPath, mockWindow);
  }

  beforeEach(() => {
    mockWindow = {
      location: {
        origin: "https://submit.diyaccounting.co.uk",
      },
      console: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    global.fetch = vi.fn();
    vi.stubGlobal("fetch", global.fetch);
    global.Headers = class {
      constructor(init) {
        this.map = new Map(Object.entries(init || {}));
      }
      get(k) {
        return this.map.get(k);
      }
    };
    vi.stubGlobal("Headers", global.Headers);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("env-loader fetches /submit.env on load and resolves envReady with the parsed values", async () => {
    respondWithEnv();
    loadScripts();

    expect(global.fetch).toHaveBeenCalledWith("/submit.env", { cache: "no-store" });

    await expect(mockWindow.envReady).resolves.toEqual({
      COGNITO_CLIENT_ID: "client123",
      COGNITO_BASE_URI: "https://auth.example.com/",
      HMRC_CLIENT_ID: "hmrc-live-id",
      HMRC_BASE_URI: "https://api.service.hmrc.gov.uk/",
      HMRC_SANDBOX_CLIENT_ID: "hmrc-sandbox-id",
      HMRC_SANDBOX_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      DIY_SUBMIT_BASE_URL: "https://submit.example.com/",
    });
  });

  it("env-loader rejects envReady when /submit.env is not served", async () => {
    global.fetch.mockResolvedValue({ ok: false });
    loadScripts();

    await expect(mockWindow.envReady).rejects.toThrow("Failed to load /submit.env");
  });

  it("buildCognitoAuthUrl generates correct URL", async () => {
    respondWithEnv();
    loadScripts();

    const url = await mockWindow.authUrlBuilder.buildCognitoAuthUrl("xyz789", "nonce456");

    expect(url).toContain("https://auth.example.com/oauth2/authorize");
    expect(url).toContain("client_id=client123");
    expect(url).toContain("state=xyz789");
    expect(url).toContain("nonce=nonce456");
    expect(url).toContain("redirect_uri=" + encodeURIComponent("https://submit.example.com/auth/loginWithCognitoCallback.html"));
  });

  it("buildCognitoAuthUrl waits for a slow /submit.env instead of failing", async () => {
    respondWithEnv({ delayMs: 500 });
    loadScripts();

    // Build the URL immediately, as a user clicking sign-in before the fetch lands does
    const urlPromise = mockWindow.authUrlBuilder.buildCognitoAuthUrl("slow-state", "slow-nonce");

    await expect(urlPromise).resolves.toContain("https://auth.example.com/oauth2/authorize");
    await expect(urlPromise).resolves.toContain("client_id=client123");
    await expect(urlPromise).resolves.toContain("state=slow-state");
  });

  it("buildHmrcAuthUrl waits for a slow /submit.env instead of failing", async () => {
    respondWithEnv({ delayMs: 500 });
    loadScripts();

    const urlPromise = mockWindow.authUrlBuilder.buildHmrcAuthUrl("slow-state", "read:vat", "live");

    await expect(urlPromise).resolves.toContain("https://api.service.hmrc.gov.uk/oauth/authorize");
    await expect(urlPromise).resolves.toContain("client_id=hmrc-live-id");
  });

  it("buildHmrcAuthUrl generates correct URL for live", async () => {
    respondWithEnv();
    loadScripts();

    const url = await mockWindow.authUrlBuilder.buildHmrcAuthUrl("abc123", "read:vat", "live");

    expect(url).toContain("https://api.service.hmrc.gov.uk/oauth/authorize");
    expect(url).toContain("client_id=hmrc-live-id");
    expect(url).toContain("scope=read%3Avat");
    expect(url).toContain("state=abc123");
    expect(url).toContain("redirect_uri=" + encodeURIComponent("https://submit.example.com/activities/submitVatCallback.html"));
  });

  it("buildHmrcAuthUrl generates correct URL for synthetic", async () => {
    respondWithEnv();
    loadScripts();

    const url = await mockWindow.authUrlBuilder.buildHmrcAuthUrl("def456", "write:vat", "synthetic");

    expect(url).toContain("https://test-api.service.hmrc.gov.uk/oauth/authorize");
    expect(url).toContain("client_id=hmrc-sandbox-id");
    expect(url).toContain("scope=write%3Avat");
    expect(url).toContain("state=def456");
  });
});
