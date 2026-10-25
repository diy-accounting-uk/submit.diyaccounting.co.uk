// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

const getIdToken = () => {
  try {
    return localStorage.getItem("cognitoIdToken");
  } catch {
    return null;
  }
};

let __generatedPassUrl = "";
let __generatedPassCode = "";
let __generatedWords = [];
let __frontSvg = "";
let __backSvg = "";
let __selectedProductType = "tshirt";

// --- Product type selector
document.querySelectorAll("[data-product-type]").forEach((radio) => {
  radio.addEventListener("change", () => {
    __selectedProductType = radio.getAttribute("data-product-type");
    // Re-render previews if pass already generated
    if (__generatedPassCode) {
      renderFrontPreview();
      renderBackPreview();
    }
  });
});

// --- Generate front SVG: words stacked vertically
function generateFrontSvg(words, productType) {
  const fontSize = 36;
  const lineHeight = 48;
  const padding = 30;
  const width = 300;
  const height = padding * 2 + words.length * lineHeight;

  let textElements = "";
  words.forEach((word, i) => {
    const y = padding + (i + 1) * lineHeight - 10;
    textElements += `  <text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#1a1a2e">${escapeXml(word)}</text>\n`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
${textElements}</svg>`;
}

// --- Generate back SVG: QR code with passphrase text below
function generateBackSvg(qrSvgContent, code) {
  const qrSize = 200;
  const totalWidth = 300;
  const textY = qrSize + 30;
  const totalHeight = textY + 30;
  const qrOffsetX = (totalWidth - qrSize) / 2;

  // Extract inner content of QR SVG
  const innerMatch = qrSvgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const qrInner = innerMatch ? innerMatch[1] : qrSvgContent;
  const viewBoxMatch = qrSvgContent.match(/viewBox="([^"]*)"/);
  const qrViewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${qrSize} ${qrSize}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <rect width="${totalWidth}" height="${totalHeight}" fill="white"/>
  <svg x="${qrOffsetX}" y="0" width="${qrSize}" height="${qrSize}" viewBox="${qrViewBox}">
    ${qrInner}
  </svg>
  <text x="${totalWidth / 2}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="11" fill="#555">${escapeXml(code)}</text>
</svg>`;
}

function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Parse an SVG string as XML and put it in the container as nodes.
function setSvgContent(container, svgText) {
  // The SVG is built by this page; a declaration would mean something else wrote it.
  if (svgText.includes("<!")) {
    throw new Error("SVG must not carry a DOCTYPE or entity declaration");
  }
  const svgDocument = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (svgDocument.querySelector("parsererror")) {
    throw new Error("SVG is not well-formed");
  }
  container.replaceChildren(document.importNode(svgDocument.documentElement, true));
}

function renderFrontPreview() {
  const frontEl = document.getElementById("frontPreview");
  __frontSvg = generateFrontSvg(__generatedWords, __selectedProductType);
  setSvgContent(frontEl, __frontSvg);
}

async function renderBackPreview() {
  const qrContainer = document.getElementById("generatedPassQrCode");
  try {
    const qrSvg = await QRCode.toString(__generatedPassUrl, {
      type: "svg",
      width: 200,
      margin: 2,
      errorCorrectionLevel: "H",
    });
    __backSvg = generateBackSvg(qrSvg, __generatedPassCode);
    setSvgContent(qrContainer, __backSvg);
  } catch (err) {
    console.warn("Failed to generate QR code:", err);
  }
}

// --- View existing pass (when ?code= parameter is present)
async function viewExistingPass(code) {
  const passUrl = `${window.location.origin}/bundles.html?pass=${encodeURIComponent(code)}`;
  __generatedPassCode = code;
  __generatedPassUrl = passUrl;
  __generatedWords = code.split("-");

  document.getElementById("generatedPassCode").textContent = code;
  document.getElementById("generatedPassUrl").textContent = passUrl;
  document.getElementById("passCodeSmall").textContent = code;

  renderFrontPreview();
  await renderBackPreview();

  // Hide the generation form, show the result
  document.getElementById("tokenInfo").style.display = "none";
  document.getElementById("generatePassBtn").style.display = "none";
  document.querySelector("[for='passNotes']")?.closest("div")?.style.setProperty("display", "none");
  document.getElementById("productTypeOptions").style.display = "none";
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
          const activity = cat.activities.find((a) => a.id === "generate-pass-physical");
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
      body: JSON.stringify({ passTypeId: "physical-pass", notes }),
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
    __generatedPassUrl = body.url;
    __generatedWords = body.code.split("-");

    document.getElementById("generatedPassCode").textContent = body.code;
    document.getElementById("generatedPassUrl").textContent = body.url;
    document.getElementById("passCodeSmall").textContent = body.code;

    // Render front and back previews
    renderFrontPreview();
    await renderBackPreview();

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

// --- Download front SVG
document.getElementById("downloadFrontSvg").addEventListener("click", () => {
  if (!__frontSvg) return;
  const blob = new Blob([__frontSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pass-${__generatedPassCode}-front.svg`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Download back SVG
document.getElementById("downloadBackSvg").addEventListener("click", () => {
  if (!__backSvg) return;
  const blob = new Blob([__backSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pass-${__generatedPassCode}-back.svg`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Download back PNG
document.getElementById("downloadBackPng").addEventListener("click", async () => {
  if (!__generatedPassUrl) return;
  try {
    const dataUrl = await QRCode.toDataURL(__generatedPassUrl, {
      width: 600,
      margin: 2,
      errorCorrectionLevel: "H",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `pass-${__generatedPassCode}-back.png`;
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
