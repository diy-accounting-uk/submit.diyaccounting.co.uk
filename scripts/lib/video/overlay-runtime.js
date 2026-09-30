// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/overlay-runtime.js
//
// The in-page half of the video overlay — design section 5. This file is never imported: it is
// read as text by scripts/lib/video/overlay.js and installed with `page.addInitScript`, so it
// runs before page scripts on every navigation and the overlay survives the tour's page loads
// without reinstalling. Self-contained IIFE, no imports, no bundler.
//
// Every visible animation here is a single eased transition, never a repeat (WCAG SC 2.3.1 — no
// content flashes more than three times a second). The heartbeat pixel is the one thing that
// changes every frame; it is 2x2px, near-identical colours, and gets cropped out of stills.

(function () {
  if (window.__svc) return; // already installed on this document

  const NS = "svc-overlay";
  const ACCENT = "#3d7cff";
  const SUCCESS = "#1f9d55";

  const events = [];
  function log(type, detail) {
    events.push({ t: performance.now(), type, detail: detail || null });
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  let root,
    pointerEl,
    ringEl,
    trailCanvas,
    trailCtx,
    headlineBox,
    chapterLabel,
    heartbeatEl,
    timerPill,
    timerLabelEl,
    timerCountEl,
    timerBarEl,
    timerCompressionEl;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  const editTrail = []; // up to 8 {el, until} — fading underline on recently-typed fields

  function buildDom() {
    root = document.createElement("div");
    root.id = NS;
    root.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;";

    trailCanvas = document.createElement("canvas");
    trailCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    root.appendChild(trailCanvas);
    resizeTrailCanvas();
    trailCtx = trailCanvas.getContext("2d");

    ringEl = document.createElement("div");
    ringEl.style.cssText =
      "position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;" +
      `background:${hexToRgba(ACCENT, 0.18)};transition:left 0s,top 0s;`;
    root.appendChild(ringEl);

    pointerEl = document.createElement("div");
    pointerEl.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 28 28" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45))">' +
      '<path d="M3 2 L3 22 L9 17 L13 25 L17 23 L13 15 L21 15 Z" fill="#ffffff" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/>' +
      "</svg>";
    pointerEl.style.cssText = "position:absolute;width:28px;height:28px;margin:-2px 0 0 -2px;";
    root.appendChild(pointerEl);

    chapterLabel = document.createElement("div");
    chapterLabel.style.cssText =
      "position:absolute;top:24px;left:24px;font:24px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;" +
      "color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.7);opacity:0;transition:opacity 250ms ease;";
    root.appendChild(chapterLabel);

    // The headline tag — a short callout label anchored beside the element a step acts on,
    // a compact, left-accented tag. Static once shown (opacity only, matching every other cue here) — the one animated thing about it is
    // its single key word's colour, never a repeat, per WCAG SC 2.3.1.
    headlineBox = document.createElement("div");
    headlineBox.style.cssText =
      "position:absolute;transform:translateX(-50%);max-width:680px;padding:12px 20px;border-radius:8px;" +
      `background:rgba(12,14,18,0.82);border:1px solid rgba(255,255,255,0.25);border-left:3px solid ${ACCENT};` +
      "font:700 30px/38px -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;text-align:center;" +
      "opacity:0;transition:opacity 220ms ease;white-space:normal;";
    root.appendChild(headlineBox);

    timerPill = document.createElement("div");
    timerPill.style.cssText =
      "position:absolute;padding:8px 14px;border-radius:20px;background:rgba(12,14,18,0.82);" +
      "border:1px solid rgba(255,255,255,0.25);font:16px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;" +
      "color:#fff;opacity:0;transition:opacity 250ms ease;min-width:120px;";
    timerLabelEl = document.createElement("div");
    timerLabelEl.style.cssText = "font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:2px;";
    timerCountEl = document.createElement("div");
    timerCountEl.style.cssText = "display:flex;align-items:baseline;gap:6px;";
    const timerNum = document.createElement("span");
    timerNum.className = "svc-timer-num";
    timerCompressionEl = document.createElement("span");
    timerCompressionEl.style.cssText = "font-size:11px;color:#ffd166;opacity:0;transition:opacity 200ms ease;";
    timerCompressionEl.textContent = "×8";
    timerCountEl.appendChild(timerNum);
    timerCountEl.appendChild(timerCompressionEl);
    const barTrack = document.createElement("div");
    barTrack.style.cssText = "margin-top:4px;height:4px;border-radius:2px;background:rgba(255,255,255,0.2);overflow:hidden;";
    timerBarEl = document.createElement("div");
    timerBarEl.style.cssText = `height:100%;width:0%;background:${ACCENT};transition:width 80ms linear,background-color 250ms ease;`;
    barTrack.appendChild(timerBarEl);
    timerPill.appendChild(timerLabelEl);
    timerPill.appendChild(timerCountEl);
    timerPill.appendChild(barTrack);
    root.appendChild(timerPill);

    heartbeatEl = document.createElement("div");
    heartbeatEl.style.cssText = "position:absolute;top:0;left:0;width:2px;height:2px;background:#000001;";
    root.appendChild(heartbeatEl);

    document.documentElement.appendChild(root);
    document.documentElement.style.scrollBehavior = "auto";
    const styleOverride = document.createElement("style");
    styleOverride.textContent = "html{scroll-behavior:auto!important;}";
    document.documentElement.appendChild(styleOverride);

    movePointerImmediate(pointerX, pointerY);
    startHeartbeat();
    startTrailFade();
  }

  function resizeTrailCanvas() {
    const dpr = window.devicePixelRatio || 1;
    trailCanvas.width = window.innerWidth * dpr;
    trailCanvas.height = window.innerHeight * dpr;
    if (trailCtx) trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function movePointerImmediate(x, y) {
    pointerX = x;
    pointerY = y;
    if (!pointerEl) return; // overlay not built yet (see the ensureDom note below)
    pointerEl.style.left = `${x}px`;
    pointerEl.style.top = `${y}px`;
    ringEl.style.left = `${x}px`;
    ringEl.style.top = `${y}px`;
  }

  function stampTrail(x, y) {
    if (!trailCtx) return;
    trailCtx.save();
    trailCtx.globalCompositeOperation = "source-over";
    const gradient = trailCtx.createRadialGradient(x, y, 0, x, y, 10);
    gradient.addColorStop(0, hexToRgba(ACCENT, 0.5));
    gradient.addColorStop(1, hexToRgba(ACCENT, 0));
    trailCtx.fillStyle = gradient;
    trailCtx.beginPath();
    trailCtx.arc(x, y, 10, 0, Math.PI * 2);
    trailCtx.fill();
    trailCtx.restore();
  }

  function startTrailFade() {
    function frame() {
      if (trailCtx) {
        trailCtx.save();
        trailCtx.globalCompositeOperation = "destination-out";
        trailCtx.fillStyle = "rgba(0,0,0,0.035)";
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
        trailCtx.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function startHeartbeat() {
    let flip = false;
    function frame() {
      flip = !flip;
      heartbeatEl.style.background = flip ? "#000001" : "#000002";
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function animate(durationMs, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      function step(now) {
        const elapsed = now - start;
        const t = Math.min(1, durationMs === 0 ? 1 : elapsed / durationMs);
        onFrame(easeInOutQuad(t), t);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  // Quadratic Bezier with a slight arc, eased in/out — borrowed from ghost-cursor's curve idea,
  // without its randomised jitter/overshoot (which exists to defeat bot detection).
  async function pointTo(x, y) {
    ensureDom();
    const x0 = pointerX,
      y0 = pointerY;
    const dx = x - x0,
      dy = y - y0;
    const distance = Math.hypot(dx, dy);
    const duration = Math.min(900, 240 + distance * 0.6);
    const midX = (x0 + x) / 2 - dy * 0.08;
    const midY = (y0 + y) / 2 + dx * 0.08;
    await animate(duration, (e) => {
      const px = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * midX + e * e * x;
      const py = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * midY + e * e * y;
      movePointerImmediate(px, py);
      stampTrail(px, py);
    });
    log("pointTo", { x, y });
  }

  function outlineRect(rect, ms) {
    const box = document.createElement("div");
    box.style.cssText =
      `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;` +
      `border:2px solid ${ACCENT};border-radius:4px;opacity:0;transition:opacity 120ms ease;`;
    root.appendChild(box);
    requestAnimationFrame(() => (box.style.opacity = "1"));
    setTimeout(() => {
      box.style.opacity = "0";
      setTimeout(() => box.remove(), 260);
    }, ms);
  }

  async function click(rect) {
    ensureDom();
    if (!root) return log("click-skipped-not-ready", { rect });
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ripple = document.createElement("div");
    ripple.style.cssText =
      `position:absolute;left:${cx}px;top:${cy}px;width:0;height:0;margin:0;border-radius:50%;` + `border:2px solid ${ACCENT};opacity:0.9;`;
    root.appendChild(ripple);
    outlineRect(rect, 350);
    await animate(450, (e) => {
      const size = 120 * e;
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
      ripple.style.opacity = String(0.9 * (1 - e));
    });
    ripple.remove();
    log("click", { x: cx, y: cy });
  }

  function highlight(rect, holdMs) {
    ensureDom();
    if (!root) return log("highlight-skipped-not-ready", { rect, holdMs });
    const box = document.createElement("div");
    box.style.cssText =
      `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;` +
      `border:3px solid ${ACCENT};border-radius:4px;box-shadow:0 0 10px 2px ${hexToRgba(ACCENT, 0.5)};` +
      "opacity:0;transition:opacity 200ms ease;";
    root.appendChild(box);
    requestAnimationFrame(() => (box.style.opacity = "1"));
    log("highlight", { rect, holdMs });
    setTimeout(() => {
      box.style.opacity = "0";
      setTimeout(() => box.remove(), 260);
    }, holdMs);
    editTrail.push({ rect, until: performance.now() + holdMs + 1500 });
    if (editTrail.length > 8) editTrail.shift();
  }

  function typeChar(rect) {
    ensureDom();
    if (!root) return log("typeChar-skipped-not-ready", { rect });
    const cx = rect.left + rect.width - 6;
    const cy = rect.top + rect.height / 2;
    const pip = document.createElement("div");
    pip.style.cssText =
      `position:absolute;left:${cx}px;top:${cy}px;width:10px;height:10px;margin:-5px 0 0 -5px;` +
      `border-radius:50%;background:${ACCENT};opacity:0.9;`;
    root.appendChild(pip);
    animate(100, (e) => {
      pip.style.opacity = String(0.9 * (1 - e));
    }).then(() => pip.remove());
    log("typeChar", { x: cx, y: cy });
  }

  // placement: {centerX, top, maxWidth} in CSS px, computed in Node by headlinePlacement.js
  // (clear of the step's target, inside the frame) — this only ever renders what it is given.
  // keyWord is matched word by word against the headline's own words (case-insensitive, with
  // leading/trailing punctuation stripped), not as a substring, so it never lights up a word
  // that merely contains it.
  function headline(text, keyWord, placement) {
    ensureDom();
    if (!root) return log("headline-skipped-not-ready", { text });
    if (!text) {
      headlineBox.style.opacity = "0";
      return;
    }
    headlineBox.textContent = "";
    const keyLower = keyWord ? keyWord.toLowerCase() : null;
    const words = text.split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      const bare = word.replace(/^[^0-9a-z]+|[^0-9a-z]+$/gi, "").toLowerCase();
      const span = document.createElement("span");
      span.textContent = word;
      if (keyLower && bare === keyLower) {
        span.style.color = "#ffd166";
        span.style.fontWeight = "800";
      }
      headlineBox.appendChild(span);
      if (i < words.length - 1) headlineBox.appendChild(document.createTextNode(" "));
    });
    if (placement) {
      headlineBox.style.left = `${placement.centerX}px`;
      headlineBox.style.top = `${placement.top}px`;
      headlineBox.style.maxWidth = `${placement.maxWidth}px`;
    }
    headlineBox.style.opacity = "1";
    log("headline", { text, keyWord: keyLower, placement });
  }

  function chapter(text) {
    ensureDom();
    if (!root) return log("chapter-skipped-not-ready", { text });
    chapterLabel.textContent = text;
    chapterLabel.style.opacity = text ? "1" : "0";
  }

  let timerRaf = null;
  let timerStartedAt = 0;
  let timerFullScaleMs = 5000;

  function timerStart(label, fullScaleMs) {
    ensureDom();
    if (!root) return log("timerStart-skipped-not-ready", { label });
    timerFullScaleMs = fullScaleMs || 5000;
    timerStartedAt = performance.now();
    timerLabelEl.textContent = label || "";
    timerBarEl.style.background = ACCENT;
    timerCompressionEl.style.opacity = "0";
    timerPill.style.left = `${pointerX + 24}px`;
    timerPill.style.top = `${pointerY + 24}px`;
    timerPill.style.opacity = "1";
    log("timerStart", { label });
    function frame() {
      const elapsedMs = performance.now() - timerStartedAt;
      const numEl = timerCountEl.querySelector(".svc-timer-num");
      numEl.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;
      const pct = Math.min(100, (elapsedMs / timerFullScaleMs) * 100);
      timerBarEl.style.width = `${pct}%`;
      timerRaf = requestAnimationFrame(frame);
    }
    timerRaf = requestAnimationFrame(frame);
  }

  function timerSetCompressing(active) {
    ensureDom();
    if (!root) return log("timerCompression-skipped-not-ready", { active });
    timerCompressionEl.style.opacity = active ? "1" : "0";
    log("timerCompression", { active });
  }

  async function timerStop() {
    ensureDom();
    if (!root) return log("timerStop-skipped-not-ready", {});
    if (timerRaf) cancelAnimationFrame(timerRaf);
    timerBarEl.style.background = SUCCESS;
    log("timerStop", {});
    await new Promise((r) => setTimeout(r, 400));
    await animate(250, (e) => {
      timerPill.style.opacity = String(1 - e);
    });
  }

  async function scrollTo(x, y, durationMs) {
    const startX = window.scrollX,
      startY = window.scrollY;
    await animate(durationMs, (e) => {
      window.scrollTo(startX + (x - startX) * e, startY + (y - startY) * e);
    });
    log("scroll", { x, y });
  }

  // A stylesheet rule rather than an inline style on each match. The elements a script suppresses
  // are usually the ones a page reveals later from its own script, and an inline display:none set
  // now loses to the display:block that arrives after the feature flag resolves.
  function suppress(selectors) {
    const list = selectors || [];
    if (list.length === 0) return;
    let sheet = document.getElementById("__svc-suppress");
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.id = "__svc-suppress";
      document.head.appendChild(sheet);
    }
    sheet.textContent = list.map((selector) => `${selector}{display:none !important}`).join("\n");
  }

  function mark(name, detail) {
    log("mark", { name, ...detail });
  }

  window.addEventListener("resize", () => {
    if (trailCanvas) resizeTrailCanvas();
  });

  // Idempotent: builds the overlay's DOM the first time any method needs it, and rebuilds it
  // whenever the existing root has come loose from the document — the redirect back from an
  // identity provider's hosted UI can land a call on a document this script has not finished (or
  // has not yet started) drawing on. buildDom() only attaches root to documentElement as its very
  // last step, so a build that threw partway through — or one that simply has not run yet — both
  // show up here as "root missing or not connected", and both get the same fresh rebuild. A
  // document.documentElement that does not exist yet (the instant an addInitScript-injected
  // script starts, before the parser has produced an <html> element) is left for the next call:
  // every __svc method's own not-ready guard covers that no-op.
  function ensureDom() {
    if (root && root.isConnected) return;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (!document.documentElement) return;
    buildDom();
  }

  ready(ensureDom);

  window.__svc = {
    pointTo,
    click,
    typeChar,
    highlight,
    headline,
    chapter,
    timerStart,
    timerSetCompressing,
    timerStop,
    scrollTo,
    suppress,
    mark,
    events,
  };
})();
