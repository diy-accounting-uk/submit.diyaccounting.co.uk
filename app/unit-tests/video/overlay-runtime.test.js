// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/overlay-runtime.test.js
//
// overlay-runtime.js is never imported (see its own header) — it is read as text and installed
// with page.addInitScript, so it reads window/document/performance/requestAnimationFrame as
// ambient globals rather than taking them as parameters. Proven the same way
// credentialFieldMaskInitScript is in journey.test.js: stub the globals the source reads, eval
// the source, and drive the installed window.__svc directly.
//
// A minimal fake DOM stands in for the browser: createElement returns a plain node with a
// mutable style object and a tracked parentNode/isConnected, matching just enough of the real
// DOM for ensureDom()'s "root && root.isConnected" check to mean what it means on a real page —
// proving the fix for the redirect back from HMRC's hosted UI landing a call on a document this
// script has not (yet, or any longer) drawn its elements on.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = fs.readFileSync(path.join(__dirname, "../../../scripts/lib/video/overlay-runtime.js"), "utf8");

function markConnected(node) {
  node.isConnected = true;
  node.children.forEach(markConnected);
}

function markDisconnected(node) {
  node.isConnected = false;
  node.children.forEach(markDisconnected);
}

function makeNode(tagName) {
  const node = {
    tagName,
    style: {},
    children: [],
    parentNode: null,
    isConnected: false,
    appendChild(child) {
      node.children.push(child);
      child.parentNode = node;
      if (node.isConnected) markConnected(child);
      return child;
    },
    removeChild(child) {
      node.children = node.children.filter((c) => c !== child);
      child.parentNode = null;
      markDisconnected(child);
      return child;
    },
    remove() {
      if (node.parentNode) node.parentNode.removeChild(node);
    },
    querySelector(selector) {
      const className = selector.replace(/^\./, "");
      const stack = [...node.children];
      while (stack.length) {
        const candidate = stack.shift();
        if (candidate.className === className) return candidate;
        stack.push(...candidate.children);
      }
      return null;
    },
  };
  return node;
}

// Every node connected under documentElement whose own text matches, depth-first.
function findByText(root, text) {
  const stack = [...root.children];
  while (stack.length) {
    const node = stack.shift();
    if (node.textContent === text) return node;
    stack.push(...node.children);
  }
  return null;
}

function findAllById(root, id) {
  const found = [];
  const stack = [...root.children];
  while (stack.length) {
    const node = stack.shift();
    if (node.id === id) found.push(node);
    stack.push(...node.children);
  }
  return found;
}

function fakeCanvasContext() {
  return {
    setTransform() {},
    save() {},
    restore() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
}

function fakeDocument() {
  const documentElement = makeNode("html");
  documentElement.isConnected = true;
  const head = makeNode("head");
  documentElement.appendChild(head);
  return {
    readyState: "loading",
    documentElement,
    head,
    createElement(tag) {
      const node = makeNode(tag);
      if (tag === "canvas") node.getContext = () => fakeCanvasContext();
      return node;
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: text, children: [] };
    },
    addEventListener() {},
    getElementById() {
      return null;
    },
  };
}

describe("overlay-runtime.js", () => {
  let scheduledDomContentLoaded;

  beforeEach(() => {
    scheduledDomContentLoaded = null;
    globalThis.document = fakeDocument();
    // A capture under --scene fast-forward can call an overlay method microseconds after a
    // navigation, before this document's own DOMContentLoaded has fired. Never invoking the
    // scheduled callback in these tests keeps that the case throughout: every assertion below
    // proves the element got built by the method call itself, not by ready()'s own listener.
    globalThis.document.addEventListener = (type, fn) => {
      if (type === "DOMContentLoaded") scheduledDomContentLoaded = fn;
    };
    globalThis.window = { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, addEventListener() {} };
    globalThis.performance = { now: () => 0 };
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.performance;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  function loadRuntime() {
    // Indirect eval runs in the global scope, so the source's free references to window,
    // document, performance, requestAnimationFrame and cancelAnimationFrame resolve against the
    // globals stubbed above — exactly how they resolve for real inside a page.
    (0, eval)(runtimeSource);
    return globalThis.window.__svc;
  }

  test("chapter() builds its element on demand on a document whose DOMContentLoaded has not fired", () => {
    const svc = loadRuntime();
    expect(scheduledDomContentLoaded).toBeTypeOf("function"); // ready() deferred the build; never invoked below

    expect(() => svc.chapter("Sign in to HMRC")).not.toThrow();

    const label = findByText(globalThis.document.documentElement, "Sign in to HMRC");
    expect(label).not.toBeNull();
    expect(label.style.opacity).toBe("1");
    expect(label.isConnected).toBe(true);
  });

  test("caption() builds its element on demand and sets the text", () => {
    const svc = loadRuntime();
    expect(() => svc.caption("Loading your obligations")).not.toThrow();

    const box = findByText(globalThis.document.documentElement, "Loading your obligations");
    expect(box).not.toBeNull();
    expect(box.style.opacity).toBe("1");
  });

  test("headline() builds its element on demand and renders each word as its own node", () => {
    const svc = loadRuntime();
    expect(() => svc.headline("Give permission", "permission", { centerX: 960, top: 200, maxWidth: 400 })).not.toThrow();

    const word = findByText(globalThis.document.documentElement, "permission");
    expect(word).not.toBeNull();
    expect(word.style.color).toBe("#ffd166");
  });

  test("rebuilds its elements once they have come loose from the document", () => {
    const svc = loadRuntime();
    svc.chapter("Sign in to HMRC");

    const [firstRoot] = findAllById(globalThis.document.documentElement, "svc-overlay");
    expect(firstRoot).toBeDefined();
    globalThis.document.documentElement.removeChild(firstRoot);
    expect(firstRoot.isConnected).toBe(false);

    svc.chapter("Authorise DIY Accounting");

    const roots = findAllById(globalThis.document.documentElement, "svc-overlay");
    expect(roots).toHaveLength(1);
    expect(roots[0]).not.toBe(firstRoot);
    expect(roots[0].isConnected).toBe(true);
    expect(findByText(globalThis.document.documentElement, "Authorise DIY Accounting")).not.toBeNull();
  });

  test("does not rebuild, and keeps a single root, across repeated calls once connected", () => {
    const svc = loadRuntime();
    svc.chapter("Sign in to HMRC");
    svc.caption("One moment...");
    svc.chapter("Authorise DIY Accounting");

    expect(findAllById(globalThis.document.documentElement, "svc-overlay")).toHaveLength(1);
  });

  test("is a safe no-op before document.documentElement exists at all", () => {
    globalThis.document.documentElement = null;
    const svc = loadRuntime();

    expect(() => svc.chapter("Sign in to HMRC")).not.toThrow();
  });
});
