// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Daily line charts for the operator dashboard, drawn as inline SVG from snapshot.dailyCharts:
// one chart per objective, one point per day, a line per component and a total line where the
// parts add up. A legend button hides or shows a line, a double-click on it shows only that line (again, all lines), Show all and Hide all set every line at once, and a legend button's tooltip says what the line is; moving over the chart reads one day.

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_HEIGHT = 220;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 46 };
const COLOUR_COUNT = 8;
const DASH_BY_CYCLE = ["", "6 3", "2 3"];

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const axisNumberFormat = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const readoutNumberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const UNIT_PREFIX = { gbp: "£", usd: "$" };

function formatDay(isoDay) {
  return dayFormat.format(new Date(isoDay + "T00:00:00Z"));
}

function formatAxisValue(unit, value) {
  if (unit === "ratio") return axisNumberFormat.format(value * 100) + "%";
  return (UNIT_PREFIX[unit] || "") + axisNumberFormat.format(value);
}

function formatReadoutValue(unit, value) {
  if (unit === "ratio") return readoutNumberFormat.format(value * 100) + "%";
  return (UNIT_PREFIX[unit] || "") + readoutNumberFormat.format(value);
}

// The smallest 1, 2, 2.5 or 5 times a power of ten that is not below the value.
function niceCeiling(value) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => fraction <= candidate);
  return step * magnitude;
}

// The first date label starts at the axis, the last ends at the right edge, the rest centre.
function axisAnchor(position, count) {
  if (position === 0) return "start";
  return position === count - 1 ? "end" : "middle";
}

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function lineStyleFor(series, componentIndex) {
  if (series.isTotal) return { colour: "var(--c-ink)", dash: "", width: 2.5 };
  const cycle = Math.floor(componentIndex / COLOUR_COUNT);
  return {
    colour: "var(--chart-" + ((componentIndex % COLOUR_COUNT) + 1) + ")",
    dash: DASH_BY_CYCLE[Math.min(cycle, DASH_BY_CYCLE.length - 1)],
    width: 1.75,
  };
}

function lineStylesFor(seriesList) {
  let componentIndex = 0;
  return seriesList.map((series) => (series.isTotal ? lineStyleFor(series, 0) : lineStyleFor(series, componentIndex++)));
}

function drawChart(state) {
  const { chart, days, svg, readout } = state;
  const mode = chart.modes[state.modeIndex];
  const unit = mode.unit || chart.unit;
  const visible = mode.series.filter((series) => !state.hidden.has(series.id));
  const styles = lineStylesFor(mode.series);

  const width = Math.max(state.card.clientWidth - 2, 240);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  svg.setAttribute("viewBox", "0 0 " + width + " " + CHART_HEIGHT);
  svg.setAttribute("width", width);
  svg.setAttribute("height", CHART_HEIGHT);
  svg.replaceChildren();

  const maxValue = niceCeiling(Math.max(0, ...visible.flatMap((series) => series.values)));
  const xAt = (index) => MARGIN.left + (days.length === 1 ? 0 : (index / (days.length - 1)) * plotWidth);
  const yAt = (value) => MARGIN.top + plotHeight - (value / maxValue) * plotHeight;

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (maxValue / 4) * tick;
    svg.appendChild(svgElement("line", { x1: MARGIN.left, x2: width - MARGIN.right, y1: yAt(value), y2: yAt(value), class: "chart-grid" }));
    const label = svgElement("text", { "x": MARGIN.left - 6, "y": yAt(value) + 4, "text-anchor": "end", "class": "chart-axis" });
    label.textContent = formatAxisValue(unit, value);
    svg.appendChild(label);
  }
  [0, Math.round((days.length - 1) / 3), Math.round(((days.length - 1) * 2) / 3), days.length - 1].forEach((index, position, all) => {
    const label = svgElement("text", {
      "x": xAt(index),
      "y": CHART_HEIGHT - 6,
      "text-anchor": axisAnchor(position, all.length),
      "class": "chart-axis",
    });
    label.textContent = formatDay(days[index]);
    svg.appendChild(label);
  });

  mode.series.forEach((series, seriesIndex) => {
    if (state.hidden.has(series.id)) return;
    const style = styles[seriesIndex];
    const points = series.values.map((value, index) => xAt(index).toFixed(1) + "," + yAt(value).toFixed(1)).join(" ");
    const attributes = {
      points,
      "fill": "none",
      "stroke": style.colour,
      "stroke-width": style.width,
      "stroke-linejoin": "round",
      "class": "chart-line",
    };
    if (style.dash) attributes["stroke-dasharray"] = style.dash;
    svg.appendChild(svgElement("polyline", attributes));
  });

  const guide = svgElement("line", { y1: MARGIN.top, y2: MARGIN.top + plotHeight, class: "chart-guide", visibility: "hidden" });
  svg.appendChild(guide);
  const overlay = svgElement("rect", {
    x: MARGIN.left,
    y: MARGIN.top,
    width: plotWidth,
    height: plotHeight,
    fill: "transparent",
    class: "chart-overlay",
  });
  svg.appendChild(overlay);

  const describeDay = (index) => {
    const parts = visible
      .filter((series) => series.values[index] !== 0 || series.isTotal)
      .map((series) => series.label + " " + formatReadoutValue(unit, series.values[index]));
    return formatDay(days[index]) + ": " + (parts.length > 0 ? parts.join(", ") : "nothing");
  };
  const showIndex = (index) => {
    guide.setAttribute("x1", xAt(index));
    guide.setAttribute("x2", xAt(index));
    guide.setAttribute("visibility", "visible");
    readout.textContent = describeDay(index);
  };
  overlay.addEventListener("pointermove", (event) => {
    const box = overlay.getBoundingClientRect();
    const fraction = box.width === 0 ? 1 : (event.clientX - box.left) / box.width;
    showIndex(Math.min(days.length - 1, Math.max(0, Math.round(fraction * (days.length - 1)))));
  });
  overlay.addEventListener("pointerleave", () => {
    guide.setAttribute("visibility", "hidden");
    readout.textContent = describeDay(days.length - 1);
  });
  readout.textContent = describeDay(days.length - 1);

  const everyValueZero = visible.every((series) => series.values.every((value) => value === 0));
  state.empty.hidden = !everyValueZero;
  svg.setAttribute(
    "aria-label",
    chart.title +
      ", daily over the last " +
      days.length +
      " days. " +
      (everyValueZero ? "No data." : "Latest " + describeDay(days.length - 1)),
  );
}

// Whether the visible lines are exactly the one named, which is what a double-click leaves.
function isIsolated(state, seriesId) {
  const mode = state.chart.modes[state.modeIndex];
  return mode.series.every((series) => (series.id === seriesId) === !state.hidden.has(series.id));
}

function syncLegend(state) {
  state.legend.querySelectorAll(".chart-legend-item").forEach((button) => {
    button.setAttribute("aria-pressed", String(!state.hidden.has(button.dataset.seriesId)));
  });
}

function updateAfterVisibilityChange(state) {
  syncLegend(state);
  drawChart(state);
}

function drawLegend(state) {
  const mode = state.chart.modes[state.modeIndex];
  const styles = lineStylesFor(mode.series);
  state.legend.replaceChildren();
  mode.series.forEach((series, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chart-legend-item";
    button.dataset.seriesId = series.id;
    button.setAttribute("aria-pressed", String(!state.hidden.has(series.id)));
    if (series.description) button.title = series.description;
    const swatch = document.createElement("span");
    swatch.className = "chart-swatch";
    swatch.style.borderTopColor = styles[index].colour;
    swatch.style.borderTopStyle = styles[index].dash ? "dashed" : "solid";
    swatch.style.borderTopWidth = series.isTotal ? "3px" : "2px";
    button.appendChild(swatch);
    button.appendChild(document.createTextNode(series.label));
    // A double-click is two clicks first, which toggle the line twice and so leave the state
    // as it was; the double-click then shows only this line, or all lines when only this one shows.
    button.addEventListener("click", () => {
      if (state.hidden.has(series.id)) state.hidden.delete(series.id);
      else state.hidden.add(series.id);
      updateAfterVisibilityChange(state);
    });
    button.addEventListener("dblclick", () => {
      state.hidden = isIsolated(state, series.id)
        ? new Set()
        : new Set(mode.series.filter((other) => other.id !== series.id).map((other) => other.id));
      updateAfterVisibilityChange(state);
    });
    item.appendChild(button);
    state.legend.appendChild(item);
  });
}

function legendControls(state) {
  const controls = document.createElement("div");
  controls.className = "chart-legend-controls";
  [
    ["show-all", "Show all", () => new Set()],
    ["hide-all", "Hide all", () => new Set(state.chart.modes[state.modeIndex].series.map((series) => series.id))],
  ].forEach(([action, label, hiddenAfter]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chart-mode chart-legend-control";
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", () => {
      state.hidden = hiddenAfter();
      updateAfterVisibilityChange(state);
    });
    controls.appendChild(button);
  });
  return controls;
}

function renderChartCard(chart, days) {
  const card = document.createElement("article");
  card.className = "chart-card";
  card.dataset.chartId = chart.id;

  const heading = document.createElement("h3");
  heading.textContent = chart.title;
  card.appendChild(heading);

  const state = { chart, days, modeIndex: 0, hidden: new Set(), card };

  if (chart.modes.length > 1) {
    const tabs = document.createElement("div");
    tabs.className = "chart-modes";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", chart.title + " measure");
    chart.modes.forEach((mode, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chart-mode";
      button.dataset.modeId = mode.id;
      button.textContent = mode.label;
      button.setAttribute("aria-pressed", String(index === 0));
      button.addEventListener("click", () => {
        state.modeIndex = index;
        state.hidden = new Set();
        tabs.querySelectorAll("button").forEach((other, otherIndex) => other.setAttribute("aria-pressed", String(otherIndex === index)));
        drawLegend(state);
        drawChart(state);
      });
      tabs.appendChild(button);
    });
    card.appendChild(tabs);
  }

  const plot = document.createElement("div");
  plot.className = "chart-plot";
  state.svg = svgElement("svg", { class: "chart-svg", role: "img" });
  plot.appendChild(state.svg);
  card.appendChild(plot);

  state.readout = document.createElement("p");
  state.readout.className = "chart-readout";
  card.appendChild(state.readout);

  state.empty = document.createElement("p");
  state.empty.className = "chart-empty";
  state.empty.textContent = "No data in the last " + days.length + " days.";
  state.empty.hidden = true;
  plot.appendChild(state.empty);

  card.appendChild(legendControls(state));

  state.legend = document.createElement("ul");
  state.legend.className = "chart-legend";
  card.appendChild(state.legend);

  if (chart.reconciliation) {
    const reconciliation = document.createElement("p");
    reconciliation.className = "chart-note chart-reconciliation";
    reconciliation.textContent = chart.reconciliation;
    card.appendChild(reconciliation);
  }

  if (chart.note) {
    const note = document.createElement("p");
    note.className = "chart-note";
    note.textContent = chart.note;
    card.appendChild(note);
  }

  state.draw = () => drawChart(state);
  drawLegend(state);
  return state;
}

let renderedCharts = [];
let redrawQueued = false;

function redrawAllCharts() {
  if (redrawQueued) return;
  redrawQueued = true;
  window.requestAnimationFrame(() => {
    redrawQueued = false;
    renderedCharts.forEach((state) => state.draw());
  });
}

function renderDailyCharts(snapshot) {
  const panel = document.getElementById("chartsPanel");
  const grid = document.getElementById("chartsGrid");
  const daily = snapshot.dailyCharts;
  renderedCharts = [];
  grid.replaceChildren();
  if (!daily || !daily.charts || daily.charts.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  daily.charts.forEach((chart) => {
    const state = renderChartCard(chart, daily.days);
    grid.appendChild(state.card);
    renderedCharts.push(state);
  });
  renderedCharts.forEach((state) => state.draw());
}

window.renderDailyCharts = renderDailyCharts;
window.addEventListener("resize", redrawAllCharts);
