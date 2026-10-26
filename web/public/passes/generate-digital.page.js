// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

const getIdToken = () => {
  try {
    return localStorage.getItem("cognitoIdToken");
  } catch {
    return null;
  }
};

// Parse an SVG string as XML and put it in the container as nodes.
function setSvgContent(container, svgText) {
  const svgDocument = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (svgDocument.querySelector("parsererror")) {
    throw new Error("SVG is not well-formed");
  }
  container.replaceChildren(document.importNode(svgDocument.documentElement, true));
}

let __generatedPassUrl = "";
let __generatedPassCode = "";
let __generatedQrSvg = "";

// --- View existing pass (when ?code= parameter is present)
async function viewExistingPass(code) {
  const passUrl = `${window.location.origin}/bundles.html?pass=${encodeURIComponent(code)}`;
  __generatedPassCode = code;
  __generatedPassUrl = passUrl;

  document.getElementById("generatedPassCode").textContent = code;
  document.getElementById("generatedPassUrl").textContent = passUrl;
  document.getElementById("passCodeSmall").textContent = code;

  try {
    const qrSvg = await QRCode.toString(passUrl, {
      type: "svg",
      width: 250,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    __generatedQrSvg = qrSvg;
    setSvgContent(document.getElementById("generatedPassQrCode"), qrSvg);
  } catch (qrErr) {
    console.warn("Failed to generate QR code:", qrErr);
  }

  // Hide the generation form, show the result
  document.getElementById("tokenInfo").style.display = "none";
  document.getElementById("generatePassBtn").style.display = "none";
  document.querySelector("[for='passNotes']")?.closest("div")?.style.setProperty("display", "none");
  document.getElementById("passResult").style.display = "block";
}

// --- Initialise page
async function initPage() {
  checkAuthStatus();

  // If ?code= param is present, show existing pass QR instead of generation form
  const urlParams = new URLSearchParams(window.location.search);
  const existingCode = urlParams.get("code");
  if (existingCode) {
    await viewExistingPass(existingCode);
    return;
  }

  const idToken = getIdToken();
  if (!idToken) {
    showStatus("Please log in to generate passes.", "warning");
    document.getElementById("generatePassBtn").disabled = true;
    return;
  }

  // Fetch token info
  try {
    const res = await window.fetchWithIdToken("/api/v1/bundle");
    const data = await res.json();
    const bundles = data.bundles || [];
    const totalRemaining = bundles.filter((b) => b.allocated).reduce((sum, b) => sum + (b.tokensRemaining || 0), 0);

    // Read token cost from catalogue
    let tokenCost = 3;
    try {
      const catRes = await fetch("/submit.catalogue.toml");
      if (catRes.ok) {
        const catText = await catRes.text();
        const cat = window.TOML ? window.TOML.parse(catText) : null;
        if (cat && cat.activities) {
          const activity = cat.activities.find((a) => a.id === "generate-pass-digital");
          if (activity && activity.tokenCost !== undefined) tokenCost = activity.tokenCost;
        }
      }
    } catch {}

    document.getElementById("tokenCostDisplay").textContent = tokenCost;
    document.getElementById("tokensRemainingDisplay").textContent = totalRemaining;
    document.getElementById("tokenInfo").style.display = "block";

    const btn = document.getElementById("generatePassBtn");
    if (totalRemaining >= tokenCost) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
      showStatus("You don't have enough tokens to generate a pass.", "warning");
    }
  } catch (err) {
    console.warn("Failed to fetch token info:", err);
    document.getElementById("generatePassBtn").disabled = false;
  }
}

// --- Generate pass
document.getElementById("generatePassBtn").addEventListener("click", async () => {
  const btn = document.getElementById("generatePassBtn");
  const idToken = getIdToken();
  if (!idToken) {
    showStatus("Please log in first.", "warning");
    return;
  }

  btn.textContent = "Generating...";
  btn.disabled = true;

  try {
    const notes = document.getElementById("passNotes").value.trim() || undefined;
    const res = await window.fetchWithIdToken("/api/v1/pass/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passTypeId: "digital-pass", notes }),
    });

    const body = await res.json();

    if (!res.ok) {
      showStatus(body.message || body.error || "Failed to generate pass", "error");
      btn.textContent = "Generate pass";
      btn.disabled = false;
      return;
    }

    // Display result
    __generatedPassCode = body.code;
    __generatedPassUrl = `${window.location.origin}/bundles.html?pass=${encodeURIComponent(body.code)}`;

    document.getElementById("generatedPassCode").textContent = body.code;
    document.getElementById("generatedPassUrl").textContent = __generatedPassUrl;
    document.getElementById("passCodeSmall").textContent = body.code;

    // Generate QR code SVG client-side
    try {
      const qrSvg = await QRCode.toString(__generatedPassUrl, {
        type: "svg",
        width: 250,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      __generatedQrSvg = qrSvg;
      setSvgContent(document.getElementById("generatedPassQrCode"), qrSvg);
    } catch (qrErr) {
      console.warn("Failed to generate QR code:", qrErr);
    }

    // Update token display
    if (body.tokensRemaining !== undefined) {
      document.getElementById("tokensRemainingDisplay").textContent = body.tokensRemaining;
      document.getElementById("tokensAfter").textContent =
        `${body.tokensConsumed} tokens consumed. ${body.tokensRemaining} tokens remaining.`;
    }

    document.getElementById("passResult").style.display = "block";
    btn.textContent = "Generate another";
    btn.disabled = false;
    showStatus("Pass generated successfully!", "success");
  } catch (err) {
    showStatus(`Failed to generate pass: ${err?.message || err}`, "error");
    btn.textContent = "Generate pass";
    btn.disabled = false;
  }
});

// --- Copy URL
document.getElementById("copyUrlBtn").addEventListener("click", async () => {
  if (!__generatedPassUrl) return;
  try {
    await navigator.clipboard.writeText(__generatedPassUrl);
    document.getElementById("copyUrlBtn").textContent = "Copied!";
    setTimeout(() => {
      document.getElementById("copyUrlBtn").textContent = "Copy link";
    }, 2000);
  } catch {
    showStatus("Failed to copy to clipboard", "error");
  }
});

// --- Copy code
document.getElementById("copyCodeBtn").addEventListener("click", async () => {
  if (!__generatedPassCode) return;
  try {
    await navigator.clipboard.writeText(__generatedPassCode);
    document.getElementById("copyCodeBtn").textContent = "Copied!";
    setTimeout(() => {
      document.getElementById("copyCodeBtn").textContent = "Copy code";
    }, 2000);
  } catch {
    showStatus("Failed to copy to clipboard", "error");
  }
});

// --- Download SVG
document.getElementById("downloadSvgBtn").addEventListener("click", () => {
  if (!__generatedQrSvg) return;
  const blob = new Blob([__generatedQrSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pass-${__generatedPassCode}.svg`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Download PNG
document.getElementById("downloadPngBtn").addEventListener("click", async () => {
  if (!__generatedPassUrl) return;
  try {
    const dataUrl = await QRCode.toDataURL(__generatedPassUrl, {
      width: 600,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `pass-${__generatedPassCode}.png`;
    a.click();
  } catch {
    showStatus("Failed to generate PNG", "error");
  }
});

// --- Page init
try {
  sessionStorage.removeItem("currentActivity");
} catch {}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
