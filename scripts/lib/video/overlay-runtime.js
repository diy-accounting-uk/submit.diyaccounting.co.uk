// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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

  let root, pointerEl, ringEl, trailCanvas, trailCtx, captionBox, chapterLabel, heartbeatEl, timerPill, timerLabelEl, timerCountEl, timerBarEl, timerCompressionEl;
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

    captionBox = document.createElement("div");
    captionBox.style.cssText =
      "position:absolute;left:50%;bottom:90px;transform:translateX(-50%);max-width:1440px;" +
      "padding:24px;border-radius:8px;background:rgba(12,14,18,0.82);border:1px solid rgba(255,255,255,0.25);" +
      "font:40px/56px -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;text-align:center;" +
      "opacity:0;transition:opacity 250ms ease;white-space:pre-line;";
    root.appendChild(captionBox);

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
    if (!pointerEl) return; // overlay not built yet (see the ready(buildDom) note below)
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
    if (!root) return log("click-skipped-not-ready", { rect });
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ripple = document.createElement("div");
    ripple.style.cssText =
      `position:absolute;left:${cx}px;top:${cy}px;width:0;height:0;margin:0;border-radius:50%;` +
      `border:2px solid ${ACCENT};opacity:0.9;`;
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

  function caption(text) {
    if (!root) return log("caption-skipped-not-ready", { text });
    if (!text) {
      captionBox.style.opacity = "0";
      return;
    }
    captionBox.textContent = text;
    captionBox.style.opacity = "1";
    log("caption", { text });
  }

  function chapter(text) {
    if (!root) return log("chapter-skipped-not-ready", { text });
    chapterLabel.textContent = text;
    chapterLabel.style.opacity = text ? "1" : "0";
  }

  let timerRaf = null;
  let timerStartedAt = 0;
  let timerFullScaleMs = 5000;

  function timerStart(label, fullScaleMs) {
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
    if (!root) return log("timerCompression-skipped-not-ready", { active });
    timerCompressionEl.style.opacity = active ? "1" : "0";
    log("timerCompression", { active });
  }

  async function timerStop() {
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

  function suppress(selectors) {
    for (const selector of selectors || []) {
      document.querySelectorAll(selector).forEach((el) => {
        el.style.display = "none";
      });
    }
  }

  function mark(name, detail) {
    log("mark", { name, ...detail });
  }

  window.addEventListener("resize", () => {
    if (trailCanvas) resizeTrailCanvas();
  });

  // document.documentElement does not exist yet at the point an addInitScript-injected script
  // runs (it runs at document creation, before the parser has produced an <html> element), so
  // the DOM build waits for DOMContentLoaded. Every __svc method below no-ops if called before
  // that — root is undefined — rather than throwing: a step running under --scene fast-forward's
  // near-zero pacing can legitimately call an overlay method microseconds after a navigation.
  ready(buildDom);

  window.__svc = {
    pointTo,
    click,
    typeChar,
    highlight,
    caption,
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
