// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Daily line charts for the operator dashboard, drawn as inline SVG from snapshot.dailyCharts:
// one chart per objective, one point per day, a line per component and a total line where the
// parts add up. A legend button hides or shows a line, a double-click on it shows only that line (again, all lines), Show all and Hide all set every line at once, and a legend button's tooltip says what the line is; moving over the chart reads one point.
// A chart mode whose source has an hourly grain carries mode.hourly, and a switch beside Show all
// and Hide all moves it between 90 days by day and 7 days by hour (snapshot.dailyCharts.hours).

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_HEIGHT = 220;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 46 };
const COLOUR_COUNT = 8;
const DASH_BY_CYCLE = ["", "6 3", "2 3"];

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const axisNumberFormat = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const readoutNumberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const UNIT_PREFIX = { gbp: "£", usd: "$" };

const hourFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDay(isoDay) {
  return dayFormat.format(new Date(isoDay + "T00:00:00Z"));
}

function formatHour(isoHour) {
  return hourFormat.format(new Date(isoHour)).replace(",", "");
}

const RANGES = [
  ["daily", "90 days, by day"],
  ["hourly", "7 days, by hour"],
];

// The series the chart draws now: the mode's hourly series when the switch is on 7 days and the
// mode has them, otherwise its daily series.
function isHourly(state) {
  return state.range === "hourly" && Boolean(state.chart.modes[state.modeIndex].hourly);
}

function activeSeries(state) {
  const mode = state.chart.modes[state.modeIndex];
  return isHourly(state) ? mode.hourly.series : mode.series;
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
  const { chart, svg, readout } = state;
  const mode = chart.modes[state.modeIndex];
  const hourly = isHourly(state);
  const days = hourly ? state.hours : state.days;
  const formatPoint = hourly ? formatHour : formatDay;
  const seriesList = activeSeries(state);
  const unit = mode.unit || chart.unit;
  const visible = seriesList.filter((series) => !state.hidden.has(series.id));
  const styles = lineStylesFor(seriesList);

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
    label.textContent = formatPoint(days[index]);
    svg.appendChild(label);
  });

  seriesList.forEach((series, seriesIndex) => {
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
    return formatPoint(days[index]) + ": " + (parts.length > 0 ? parts.join(", ") : "nothing");
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
  state.empty.textContent = "No data in the last " + days.length + (hourly ? " hours." : " days.");
  state.empty.hidden = !everyValueZero;
  svg.setAttribute(
    "aria-label",
    chart.title +
      (hourly ? ", hourly over the last " + days.length + " hours. " : ", daily over the last " + days.length + " days. ") +
      (everyValueZero ? "No data." : "Latest " + describeDay(days.length - 1)),
  );
}

// Whether the visible lines are exactly the one named, which is what a double-click leaves.
function isIsolated(state, seriesId) {
  return activeSeries(state).every((series) => (series.id === seriesId) === !state.hidden.has(series.id));
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
  const seriesList = activeSeries(state);
  const styles = lineStylesFor(seriesList);
  state.legend.replaceChildren();
  seriesList.forEach((series, index) => {
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
        : new Set(seriesList.filter((other) => other.id !== series.id).map((other) => other.id));
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
    ["hide-all", "Hide all", () => new Set(activeSeries(state).map((series) => series.id))],
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
  controls.appendChild(rangeSwitch(state));
  return controls;
}

// The switch between 90 days by day and 7 days by hour. It shows only while the chart's current
// mode has an hourly series.
function rangeSwitch(state) {
  const group = document.createElement("span");
  group.className = "chart-range";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", state.chart.title + " range");
  RANGES.forEach(([range, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chart-mode chart-legend-control chart-range-option";
    button.dataset.range = range;
    button.textContent = label;
    button.addEventListener("click", () => {
      state.range = range;
      syncRangeSwitch(state);
      drawLegend(state);
      drawChart(state);
    });
    group.appendChild(button);
  });
  state.rangeSwitch = group;
  syncRangeSwitch(state);
  return group;
}

function syncRangeSwitch(state) {
  state.rangeSwitch.hidden = !state.chart.modes[state.modeIndex].hourly;
  state.rangeSwitch.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.range === (isHourly(state) ? "hourly" : "daily")));
  });
}

const DEFAULT_REFRESH_MINUTES = 15;
const MAX_REFRESH_MINUTES = 1440;

// The refresh period in minutes from the page's query string, or null when the parameter is
// absent or is not a whole number from 1 to 1440.
function parseRefreshMinutes(search) {
  const value = new URLSearchParams(search).get("refresh");
  if (value === null || !/^\d+$/.test(value)) return null;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= MAX_REFRESH_MINUTES ? minutes : null;
}

// Replaces a section heading with a row holding the heading, a "#" link to the section's own
// id, and the extra links given (each [label, href, className]); the last one sits at the right.
function decorateSectionHeading(heading, id, extraLinks) {
  const row = document.createElement("div");
  row.className = "section-heading-row";
  heading.replaceWith(row);
  row.appendChild(heading);

  const anchor = document.createElement("a");
  anchor.className = "anchor-link";
  anchor.href = "#" + id;
  anchor.textContent = "#";
  anchor.setAttribute("aria-label", "Link to " + heading.textContent);
  row.appendChild(anchor);

  const current = parseRefreshMinutes(window.location.search);
  const links = (extraLinks || []).concat([
    ["Auto-refresh", "?refresh=" + (current || DEFAULT_REFRESH_MINUTES) + "#" + id, "refresh-link"],
  ]);
  links.forEach(([label, href, className], index) => {
    const link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.textContent = label;
    if (index === 0) link.classList.add("section-heading-first-action");
    row.appendChild(link);
  });
  return row;
}

// Conversion to paid first and full width, then the others in reading order; a chart not
// listed follows in the order the server sent it.
const CHART_ORDER = [
  "conversion-to-paid",
  "visitors",
  "conversion-to-submission",
  "activity-started-and-completed",
  "hmrc-failures",
  "low-running-cost",
  "retention",
];

function sortCharts(charts) {
  const rank = (chart) => {
    const index = CHART_ORDER.indexOf(chart.id);
    return index === -1 ? CHART_ORDER.length : index;
  };
  return charts
    .map((chart, position) => ({ chart, position }))
    .sort((a, b) => rank(a.chart) - rank(b.chart) || a.position - b.position)
    .map(({ chart }) => chart);
}

// The id of the table section that backs a chart.
function chartTableId(chart) {
  if (chart.id === "visitors") return "visitorsPanel";
  if (chart.id === "activity-started-and-completed") return "activitiesPanel";
  return "table-" + chart.objectiveId;
}

function renderChartCard(chart, days, hours) {
  const card = document.createElement("article");
  card.className = "chart-card";
  card.id = "chart-" + chart.id;
  card.dataset.chartId = chart.id;

  const heading = document.createElement("h3");
  heading.textContent = chart.title;
  card.appendChild(heading);
  decorateSectionHeading(heading, card.id, [["Table", "#" + chartTableId(chart), "chart-table-link"]]);

  const state = { chart, days, hours, range: "daily", modeIndex: 0, hidden: new Set(), card };

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
        syncRangeSwitch(state);
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
  sortCharts(daily.charts).forEach((chart) => {
    const state = renderChartCard(chart, daily.days, daily.hours || []);
    grid.appendChild(state.card);
    renderedCharts.push(state);
  });
  renderedCharts.forEach((state) => state.draw());
}

window.renderDailyCharts = renderDailyCharts;
window.decorateSectionHeading = decorateSectionHeading;
window.parseRefreshMinutes = parseRefreshMinutes;
window.addEventListener("resize", redrawAllCharts);
