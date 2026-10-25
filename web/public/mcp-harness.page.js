// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The chat harness: plays a scripted conversation (mcp-harness/<name>.json, chosen by ?script=)
// and makes each tool turn a real MCP tool call through the server's harness endpoint. When a
// tool answers with a link to a browser step, the iframe follows it.

(function () {
  const DEFAULT_SCRIPT = "list-vat-obligations";
  const LINK_FIELDS = ["authorizationUrl", "authorisationUrl", "authUrl", "browserStepUrl", "url", "link"];

  const chat = document.getElementById("chat");
  const frame = document.getElementById("browserStep");
  const browserStatus = document.getElementById("browserStatus");
  const nextButton = document.getElementById("nextTurn");
  const playAllButton = document.getElementById("playAll");
  const restartButton = document.getElementById("restart");

  let script = null;
  const answers = {};
  let nextIndex = 0;
  let busy = false;
  const harnessSession = `harness-${crypto.randomUUID()}`;

  function scriptName() {
    const requested = new URLSearchParams(window.location.search).get("script") || DEFAULT_SCRIPT;
    return /^[a-z0-9-]+$/.test(requested) ? requested : DEFAULT_SCRIPT;
  }

  function addTurn(role, text, id) {
    const turn = document.createElement("div");
    turn.className = "harness-turn";
    turn.dataset.role = role;
    if (id) turn.dataset.turnId = id;
    const body = document.createElement("div");
    body.textContent = text;
    turn.appendChild(body);
    chat.appendChild(turn);
    return turn;
  }

  function browserStepLink(result) {
    if (!result || typeof result !== "object") return null;
    for (const field of LINK_FIELDS) {
      const value = result[field];
      if (typeof value === "string" && /^(https?:\/\/|\/)/.test(value)) return value;
    }
    return null;
  }

  function showBrowserStep(url) {
    frame.hidden = false;
    frame.src = url;
    browserStatus.textContent = `Browser step: ${url}`;
  }

  // A string argument of the form "${turnId.path.to.value}" takes that value from an earlier tool
  // answer; a "[*]" step in the path collects the field from every item of an array.
  function resolveReference(reference) {
    const [turnId, ...steps] = reference.split(".");
    let value = answers[turnId];
    for (const step of steps) {
      const each = step.endsWith("[*]");
      const field = each ? step.slice(0, -3) : step;
      value = value?.[field];
      if (each) {
        const rest = steps.slice(steps.indexOf(step) + 1);
        return (value ?? []).map((item) => rest.reduce((inner, name) => inner?.[name], item));
      }
    }
    return value;
  }

  function resolveArguments(value) {
    if (typeof value === "string") {
      const match = /^\$\{([^}]+)\}$/.exec(value);
      return match ? resolveReference(match[1]) : value;
    }
    if (Array.isArray(value)) return value.map(resolveArguments);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, resolveArguments(inner)]));
    }
    return value;
  }

  async function callTool(turn) {
    const response = await fetch("/api/v1/dev/mcp-harness/call", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-harness-session": harnessSession },
      body: JSON.stringify({ tool: turn.tool, arguments: resolveArguments(turn.arguments || {}) }),
    });
    if (!response.ok) throw new Error(`The harness endpoint answered HTTP ${response.status}`);
    return response.json();
  }

  async function playTurn(turn) {
    if (turn.role !== "tool") {
      addTurn(turn.role, turn.text, turn.id);
      return;
    }
    const card = addTurn("tool", `Calling ${turn.tool}`, turn.id);
    const output = document.createElement("pre");
    card.appendChild(output);
    try {
      const { ok, result } = await callTool(turn);
      card.dataset.outcome = ok ? "ok" : "error";
      if (turn.id) answers[turn.id] = result;
      output.textContent = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      const link = ok ? browserStepLink(result) : null;
      if (link) showBrowserStep(link);
    } catch (error) {
      card.dataset.outcome = "error";
      output.textContent = error.message;
    }
  }

  async function advance() {
    if (busy || !script || nextIndex >= script.turns.length) return false;
    busy = true;
    nextButton.disabled = true;
    try {
      await playTurn(script.turns[nextIndex]);
      nextIndex += 1;
    } finally {
      busy = false;
      nextButton.disabled = nextIndex >= script.turns.length;
    }
    return true;
  }

  async function playAll() {
    playAllButton.disabled = true;
    while (await advance()) {
      // Each turn waits for the one before it.
    }
    playAllButton.disabled = false;
  }

  function restart() {
    chat.textContent = "";
    frame.hidden = true;
    frame.removeAttribute("src");
    browserStatus.textContent = "No browser step yet. A tool that hands back a link opens it here.";
    nextIndex = 0;
    for (const key of Object.keys(answers)) delete answers[key];
    nextButton.disabled = false;
  }

  function renderConfig() {
    const serverName = script.config.serverName;
    const hostedUrl = `${window.location.origin}${script.config.hostedPath}`;
    document.getElementById("configHosted").textContent = `claude mcp add --transport http ${serverName} ${hostedUrl}`;
    document.getElementById("configStdio").textContent = `claude mcp add ${serverName} -- ${script.config.stdioCommand}`;
    document.getElementById("configConnector").textContent = hostedUrl;
  }

  async function renderToolList() {
    try {
      const response = await fetch("/api/v1/dev/mcp-harness/tools", { headers: { "x-harness-session": harnessSession } });
      if (!response.ok) return;
      const { tools } = await response.json();
      document.getElementById("toolList").textContent =
        `The server offers ${tools.length} tools: ${tools.map((tool) => tool.name).join(", ")}.`;
    } catch {
      // The list is a convenience; the conversation does not need it.
    }
  }

  async function start() {
    const response = await fetch(`mcp-harness/${scriptName()}.json`);
    script = await response.json();
    document.getElementById("scriptTitle").textContent = script.title;
    renderConfig();
    renderToolList();
    nextButton.addEventListener("click", advance);
    playAllButton.addEventListener("click", playAll);
    restartButton.addEventListener("click", restart);
  }

  start();
})();
