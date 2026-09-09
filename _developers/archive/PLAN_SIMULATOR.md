<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Simulator Deployment Plan

Host a public, read-only simulator of the DIY Accounting Submit application for demonstration and help documentation purposes.

## Goals

1. **Always-on demo** - Users can try the app without signing up
2. **Embedded in help** - iframe on `/simulator.html` alongside Help and User Guide
3. **Zero footprint** - No logging, no persistence, no durable state
4. **Accessible clarity** - Screen readers and robots must know this is a simulator
5. **Cheap hosting** - Lambda with cold start is acceptable

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Production Site (submit.diyaccounting.co.uk)                   │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ about.html  │  │ help/       │  │ simulator.html          │  │
│  │             │  │ index.html  │  │                         │  │
│  │ [Help&FAQs] │  │             │  │  ┌───────────────────┐  │  │
│  │ [UserGuide] │  │             │  │  │ SIMULATOR LABEL   │  │  │
│  │ [Simulator] │──┼─────────────┼──│  ├───────────────────┤  │  │
│  └─────────────┘  └─────────────┘  │  │                   │  │  │
│                                    │  │  <iframe src=     │  │  │
│                                    │  │   "https://       │  │  │
│                                    │  │   simulator...."> │  │  │
│                                    │  │                   │  │  │
│                                    │  └───────────────────┘  │  │
│                                    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                              │
                                              │ iframe
                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Simulator (simulator.submit.diyaccounting.co.uk)               │
│  Lambda Function URL or API Gateway                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Lambda Web Adapter                                     │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │  Express Server (merged)                          │  │    │
│  │  │                                                   │  │    │
│  │  │  Static files:  web/public/* (modified)           │  │    │
│  │  │  API routes:    /api/v1/* (from server.js)        │  │    │
│  │  │  Mock HMRC:     /oauth/*, /vat/* (http-simulator) │  │    │
│  │  │  Mock Auth:     hardcoded demo user session       │  │    │
│  │  │                                                   │  │    │
│  │  │  State: In-memory only (resets on cold start)     │  │    │
│  │  │  Logging: Disabled                                │  │    │
│  │  │  DynamoDB: None                                   │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Existing Code to Leverage

### app/http-simulator/
Already provides mock HMRC API with in-memory state:
- `state/store.js` - In-memory Maps for tokens, returns, auth codes
- `routes/vat-returns.js` - Mock VAT return submission
- `routes/vat-obligations.js` - Mock obligations with scenarios
- `routes/hmrc-oauth.js` - Mock HMRC OAuth flow
- `routes/local-oauth.js` - Mock local authentication

### app/bin/server.js
Express server that serves:
- Static files from `web/public/`
- API routes (bundle, HMRC token, VAT operations)
- Virtual `/submit.env` endpoint

## Implementation Phases

### Phase 1: Merged Simulator Server

Create `app/bin/simulator-server.js` that combines:

```javascript
// Merge existing functionality
import { createApp as createSimulatorApp } from "../http-simulator/server.js";
import express from "express";
import path from "path";

export function createSimulatorServer() {
  const app = express();

  // Disable all logging
  // No morgan, no console.log, no logger

  // Inject demo user session (no real auth)
  app.use((req, res, next) => {
    req.user = { sub: "demo-user", email: "demo@simulator.local" };
    next();
  });

  // Mount http-simulator routes for mock HMRC/OAuth
  const simulatorApp = createSimulatorApp();
  app.use(simulatorApp);

  // Serve modified static files (with simulator markup)
  app.use(express.static(path.join(__dirname, "../../web/public-simulator")));

  // In-memory bundle store (no DynamoDB)
  const bundles = new Map();
  app.get("/api/v1/account/bundles", (req, res) => {
    res.json({ bundles: Array.from(bundles.values()) });
  });
  // ... etc

  return app;
}
```

### Phase 2: Static File Transformation

At build time, transform `web/public/` → `web/public-simulator/`:

1. **HTML modifications** (all `.html` files):
   ```html
   <!-- Inject after <body> -->
   <div class="simulator-banner" role="alert" aria-live="polite">
     <span aria-hidden="true">⚠️</span>
     SIMULATOR - Demo Mode - No real data is submitted
   </div>

   <!-- Add to <html> tag -->
   <html lang="en" data-simulator="true">

   <!-- Add meta tags -->
   <meta name="robots" content="noindex, nofollow, noarchive">
   <meta name="simulator" content="true">
   ```

2. **CSS additions** (`submit.css`):
   ```css
   /* Simulator banner - always visible */
   .simulator-banner {
     position: fixed;
     top: 0;
     left: 0;
     right: 0;
     background: #ff6b6b;
     color: white;
     text-align: center;
     padding: 8px;
     font-weight: bold;
     z-index: 10000;
     font-size: 14px;
   }

   /* Offset body content */
   html[data-simulator="true"] body {
     padding-top: 40px;
   }

   /* Visual indicator on all interactive elements */
   html[data-simulator="true"] .btn,
   html[data-simulator="true"] button {
     position: relative;
   }

   html[data-simulator="true"] .btn::after,
   html[data-simulator="true"] button::after {
     content: "(demo)";
     font-size: 10px;
     opacity: 0.7;
     margin-left: 4px;
   }
   ```

3. **robots.txt** (for simulator subdomain):
   ```
   User-agent: *
   Disallow: /
   ```

4. **JavaScript modifications**:
   - Remove RUM/analytics initialization
   - Disable any real API calls to production
   - Replace Cognito auth with mock session

### Phase 3: Lambda Deployment

Use AWS Lambda Web Adapter:

```yaml
# In CDK (SimulatorStack.java)
Function simulatorFunction = Function.Builder.create(this, "SimulatorFunction")
    .runtime(Runtime.NODEJS_20_X)
    .handler("run.sh")  // Lambda Web Adapter entrypoint
    .code(Code.fromAsset("../app", AssetOptions.builder()
        .bundling(...)
        .build()))
    .memorySize(512)
    .timeout(Duration.seconds(30))
    .environment(Map.of(
        "AWS_LWA_INVOKE_MODE", "response_stream",
        "PORT", "8080"
    ))
    .layers(List.of(
        LayerVersion.fromLayerVersionArn(this, "LambdaAdapter",
            "arn:aws:lambda:eu-west-2:753240598075:layer:LambdaAdapterLayerX86:22")
    ))
    .build();

// Function URL (no API Gateway needed)
FunctionUrl functionUrl = simulatorFunction.addFunctionUrl(FunctionUrlOptions.builder()
    .authType(FunctionUrlAuthType.NONE)  // Public access
    .cors(FunctionUrlCorsOptions.builder()
        .allowedOrigins(List.of("https://submit.diyaccounting.co.uk"))
        .build())
    .build());
```

### Phase 4: Simulator Page

Create `web/public/simulator.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <title>Simulator - DIY Accounting Submit</title>
  <meta name="description" content="Try DIY Accounting Submit in demo mode. No account required.">
  <link rel="stylesheet" href="./submit.css">
  <style>
    .simulator-container {
      position: relative;
      width: 100%;
      height: calc(100vh - 200px);
      min-height: 600px;
      border: 3px solid #ff6b6b;
      border-radius: 8px;
      overflow: hidden;
    }

    .simulator-overlay-label {
      position: absolute;
      top: 10px;
      right: 10px;
      background: #ff6b6b;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      z-index: 100;
      pointer-events: none;
    }

    .simulator-frame {
      width: 100%;
      height: 100%;
      border: none;
    }

    .simulator-notice {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <a href="#mainContent" class="skip-link">Skip to main content</a>
  <header>
    <!-- Standard header nav -->
  </header>

  <main id="mainContent">
    <h1>Try the Simulator</h1>

    <div class="simulator-notice" role="alert">
      <strong>Demo Mode:</strong> This is a fully functional simulator.
      No real VAT returns are submitted. No account is required.
      Data resets periodically.
    </div>

    <nav class="about-nav-links" aria-label="Help navigation">
      <a href="help/index.html" class="about-nav-link">Help & FAQs</a>
      <a href="guide/index.html" class="about-nav-link">User Guide</a>
    </nav>

    <div class="simulator-container" role="region" aria-label="DIY Accounting Submit Simulator">
      <div class="simulator-overlay-label" aria-hidden="true">SIMULATOR</div>
      <iframe
        src="https://simulator.submit.diyaccounting.co.uk/"
        class="simulator-frame"
        title="DIY Accounting Submit Simulator - Demo Mode"
        sandbox="allow-scripts allow-forms allow-same-origin"
        loading="lazy">
      </iframe>
    </div>

    <p>
      <a href="index.html">Ready to use the real application? Go to the home page →</a>
    </p>
  </main>

  <footer><!-- Standard footer --></footer>
</body>
</html>
```

### Phase 5: Behaviour Test

Add simple click-through test for simulator page:

```javascript
// behaviour-tests/simulator.behaviour.test.js

test("Simulator page loads and iframe is interactive", async ({ page }) => {
  // Navigate to simulator page
  await page.goto(`${baseUrl}/simulator.html`);

  // Verify page structure
  await expect(page.locator("h1")).toContainText("Simulator");
  await expect(page.locator(".simulator-notice")).toBeVisible();
  await expect(page.locator(".simulator-container")).toBeVisible();

  // Verify iframe loaded
  const iframe = page.frameLocator(".simulator-frame");
  await expect(iframe.locator("body")).toBeVisible({ timeout: 30000 });

  // Verify simulator banner inside iframe
  await expect(iframe.locator(".simulator-banner")).toBeVisible();
  await expect(iframe.locator(".simulator-banner")).toContainText("SIMULATOR");

  // Click through basic navigation inside iframe
  await iframe.locator("a.info-link").click();
  await expect(iframe.locator("h1")).toContainText("About");

  // Verify Help link works
  await iframe.locator("a.about-nav-link:has-text('Help')").click();
  await expect(iframe.locator("h1")).toContainText("Help");

  // Navigate back to home via home icon
  await iframe.locator("a.home-link").click();

  // Test complete - simulator is clickable
  console.log("Simulator iframe is interactive and navigable");
});
```

## Build Script

Create `scripts/build-simulator.js`:

```javascript
// Transform web/public → web/public-simulator
// 1. Copy all files
// 2. Inject simulator markup into HTML files
// 3. Modify submit.css with simulator styles
// 4. Create robots.txt
// 5. Remove analytics/RUM code
```

## Security Considerations

1. **No secrets** - Simulator has no access to production secrets
2. **No persistence** - In-memory state only, resets on cold start
3. **No logging** - No CloudWatch logs, no RUM, no analytics
4. **Sandboxed iframe** - `sandbox` attribute limits capabilities
5. **Clear labeling** - Cannot be mistaken for production
6. **ARIA announcements** - Screen readers informed this is demo mode

### Phase 6: Guided Journey Automation

Add buttons that automate click-throughs of specific journeys inside the iframe - like Playwright running in the browser.

**UI Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  Try the Simulator                                           │
│                                                              │
│  Watch a demo journey:                                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐  │
│  │ ▶ Submit VAT    │ │ ▶ View Return   │ │ ▶ Obligations  │  │
│  │   Return        │ │                 │ │                │  │
│  └─────────────────┘ └─────────────────┘ └────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Step 2 of 5: Entering VAT figures...            [⏸][⏹] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    SIMULATOR                           │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │   [Element highlighted with pulsing border]      │  │  │
│  └──┴──────────────────────────────────────────────────┴──┘  │
└──────────────────────────────────────────────────────────────┘
```

**Create `web/public/widgets/simulator-journeys.js`:**

```javascript
// Guided journey automation for simulator iframe
class SimulatorJourney {
  constructor(iframe, statusEl) {
    this.doc = iframe.contentDocument;
    this.statusEl = statusEl;
    this.currentStep = 0;
    this.steps = [];
    this.paused = false;
    this.aborted = false;
  }

  async highlight(selector) {
    const el = this.doc.querySelector(selector);
    if (!el) return null;
    el.classList.add('simulator-highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return el;
  }

  async click(selector, description) {
    this.updateStatus(description);
    const el = await this.highlight(selector);
    await this.wait(800);
    el?.click();
    el?.classList.remove('simulator-highlight');
    await this.waitForLoad();
  }

  async fill(selector, value, description) {
    this.updateStatus(description);
    const el = await this.highlight(selector);
    await this.wait(500);
    if (el) {
      el.value = '';
      for (const char of value) {
        el.value += char;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await this.wait(50); // Typewriter effect
      }
    }
    el?.classList.remove('simulator-highlight');
  }

  async wait(ms) {
    while (this.paused && !this.aborted) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (this.aborted) throw new Error('Journey aborted');
    return new Promise(r => setTimeout(r, ms));
  }

  async waitForLoad() {
    await this.wait(1000); // Wait for navigation
  }

  updateStatus(message) {
    this.currentStep++;
    this.statusEl.textContent = `Step ${this.currentStep} of ${this.steps.length}: ${message}`;
  }
}

// Journey: Submit VAT Return
async function journeySubmitVat(journey) {
  journey.steps = ['Navigate', 'Enter VRN', 'Fill Box 1', 'Fill Box 2', 'Submit', 'View Receipt'];

  await journey.click('[data-activity="submit-vat"]', 'Selecting Submit VAT Return...');
  await journey.fill('#vrn', '123456789', 'Entering VAT Registration Number...');
  await journey.fill('#periodKey', '24A1', 'Entering period key...');
  await journey.click('#fetchObligationsBtn', 'Fetching obligations...');
  await journey.wait(2000);
  await journey.fill('#vatDueSales', '1000.00', 'Entering VAT due on sales (Box 1)...');
  await journey.fill('#vatDueAcquisitions', '0.00', 'Entering VAT due on acquisitions (Box 2)...');
  await journey.fill('#vatReclaimedCurrPeriod', '250.00', 'Entering VAT reclaimed (Box 4)...');
  await journey.fill('#totalValueSalesExVAT', '5000', 'Entering total sales (Box 6)...');
  await journey.fill('#totalValuePurchasesExVAT', '1250', 'Entering total purchases (Box 7)...');
  await journey.fill('#totalValueGoodsSuppliedExVAT', '0', 'Entering goods supplied to EU (Box 8)...');
  await journey.fill('#totalAcquisitionsExVAT', '0', 'Entering acquisitions from EU (Box 9)...');
  await journey.click('#submitVatBtn', 'Submitting VAT return to HMRC...');
  await journey.wait(3000);
  journey.updateStatus('Complete! Receipt shown above.');
}

// Journey: View Obligations
async function journeyViewObligations(journey) {
  journey.steps = ['Navigate', 'Enter VRN', 'Fetch', 'View Results'];

  await journey.click('[data-activity="obligations"]', 'Selecting View Obligations...');
  await journey.fill('#vrn', '123456789', 'Entering VAT Registration Number...');
  await journey.click('#fetchObligationsBtn', 'Fetching obligations from HMRC...');
  await journey.wait(2000);
  journey.updateStatus('Complete! Obligations displayed above.');
}

// Journey: View Submitted Return
async function journeyViewReturn(journey) {
  journey.steps = ['Navigate', 'Enter VRN', 'Enter Period', 'Fetch', 'View'];

  await journey.click('[data-activity="view-return"]', 'Selecting View VAT Return...');
  await journey.fill('#vrn', '123456789', 'Entering VAT Registration Number...');
  await journey.fill('#periodKey', '24A1', 'Entering period key...');
  await journey.click('#fetchReturnBtn', 'Fetching return from HMRC...');
  await journey.wait(2000);
  journey.updateStatus('Complete! Return details displayed above.');
}

export { SimulatorJourney, journeySubmitVat, journeyViewObligations, journeyViewReturn };
```

**CSS for highlight effect (add to simulator pages):**

```css
/* Injected into simulator iframe */
.simulator-highlight {
  outline: 3px solid #ff6b6b !important;
  outline-offset: 2px;
  animation: pulse-highlight 1s ease-in-out infinite;
  position: relative;
  z-index: 1000;
}

@keyframes pulse-highlight {
  0%, 100% { outline-color: #ff6b6b; box-shadow: 0 0 10px rgba(255, 107, 107, 0.5); }
  50% { outline-color: #ff9999; box-shadow: 0 0 20px rgba(255, 107, 107, 0.8); }
}
```

**Updated simulator.html with journey buttons:**

```html
<div class="journey-buttons" role="group" aria-label="Demo journeys">
  <button type="button" class="journey-btn" data-journey="submit-vat">
    <span class="journey-icon">▶</span>
    <span class="journey-label">Submit VAT Return</span>
  </button>
  <button type="button" class="journey-btn" data-journey="view-obligations">
    <span class="journey-icon">▶</span>
    <span class="journey-label">View Obligations</span>
  </button>
  <button type="button" class="journey-btn" data-journey="view-return">
    <span class="journey-icon">▶</span>
    <span class="journey-label">View Return</span>
  </button>
</div>

<div class="journey-status" role="status" aria-live="polite">
  <span id="journeyStatusText">Select a demo journey above to watch it in action</span>
  <div class="journey-controls" style="display: none;">
    <button type="button" id="pauseBtn" aria-label="Pause">⏸</button>
    <button type="button" id="stopBtn" aria-label="Stop">⏹</button>
  </div>
</div>

<script type="module">
  import { SimulatorJourney, journeySubmitVat, journeyViewObligations, journeyViewReturn }
    from './widgets/simulator-journeys.js';

  const journeys = {
    'submit-vat': journeySubmitVat,
    'view-obligations': journeyViewObligations,
    'view-return': journeyViewReturn,
  };

  let activeJourney = null;

  document.querySelectorAll('.journey-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const journeyName = btn.dataset.journey;
      const iframe = document.querySelector('.simulator-frame');
      const statusEl = document.getElementById('journeyStatusText');

      // Reset iframe to home
      iframe.contentWindow.location.href = '/index.html';
      await new Promise(r => setTimeout(r, 1500));

      activeJourney = new SimulatorJourney(iframe, statusEl);
      document.querySelector('.journey-controls').style.display = 'flex';

      try {
        await journeys[journeyName](activeJourney);
      } catch (e) {
        if (e.message !== 'Journey aborted') console.error(e);
      }

      document.querySelector('.journey-controls').style.display = 'none';
      activeJourney = null;
    });
  });

  document.getElementById('pauseBtn').addEventListener('click', () => {
    if (activeJourney) {
      activeJourney.paused = !activeJourney.paused;
      document.getElementById('pauseBtn').textContent = activeJourney.paused ? '▶' : '⏸';
    }
  });

  document.getElementById('stopBtn').addEventListener('click', () => {
    if (activeJourney) activeJourney.aborted = true;
  });
</script>
```

## Cost Estimate

- **Lambda**: ~$0/month at low traffic (free tier: 1M requests, 400,000 GB-seconds)
- **Function URL**: Free (no API Gateway)
- **CloudFront** (optional): ~$1/month for caching
- **Route53**: Already have the hosted zone

## Task Breakdown

### Core Simulator
1. [ ] Create `app/bin/simulator-server.js` - merged Express server
2. [ ] Create `scripts/build-simulator.js` - HTML/CSS transformation
3. [ ] Add simulator CSS to `submit.css`
4. [ ] Create `web/public/simulator.html` - host page with iframe
5. [ ] Add link to simulator from about.html (alongside Help/Guide)
6. [ ] Create `SimulatorStack.java` - Lambda + Function URL
7. [ ] Create `simulator.behaviour.test.js` - click-through test
8. [ ] Add deployment config for simulator subdomain
9. [ ] Test locally with `npm run start:simulator`
10. [ ] Deploy and verify

### Guided Journeys
11. [ ] Create `web/public/widgets/simulator-journeys.js` - journey automation
12. [ ] Add journey button styles to `submit.css`
13. [ ] Add highlight animation CSS to simulator build
14. [ ] Implement Submit VAT journey
15. [ ] Implement View Obligations journey
16. [ ] Implement View Return journey
17. [ ] Add pause/stop controls
18. [ ] Test journeys work with mock HMRC responses
19. [ ] Add journey tests to `simulator.behaviour.test.js`

## Future Enhancements

- **Speed control**: Slow/normal/fast journey playback
- **Voiceover**: Narrated journeys (text-to-speech or pre-recorded)
- **Mobile-friendly**: Responsive iframe container with touch support
- **Fargate upgrade**: When traffic justifies always-on compute
- **Analytics**: Track which journeys users watch most
