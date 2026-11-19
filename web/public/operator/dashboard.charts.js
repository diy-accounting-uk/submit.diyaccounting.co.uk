// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Daily line charts for the operator dashboard, drawn as inline SVG from snapshot.dailyCharts:
// one chart per objective, one point per day, a line per component and a total line where the
// parts add up. A legend button hides or shows a line, a double-click on it shows only that line (again, all lines), Show all and Hide all set every line at once, and a legend button's tooltip says what the line is; moving over the chart reads one point.
// A chart mode whose source has an hourly grain carries mode.hourly, and a switch beside Show all
// and Hide all moves it between 90 days by day and 14 days by hour (snapshot.dailyCharts.hours).

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_HEIGHT = 220;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 46 };
const COLOUR_COUNT = 8;
// The width of one character of an axis label, in pixels, for sizing the left margin.
const AXIS_CHARACTER_WIDTH = 6.5;
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
  ["hourly", "14 days, by hour"],
];

// The series the chart draws now: the mode's hourly series when the switch is on 14 days and the
// mode has them, otherwise its daily series.
function isHourly(state) {
  return state.range === "hourly" && Boolean(state.chart.modes[state.modeIndex].hourly);
}

// The 14 days range of a mode whose source reports by day: its last 14 daily points.
const DAILY_SOURCE_DAYS = 14;

function isDailySourceRange(state) {
  return state.range === "hourly" && !state.chart.modes[state.modeIndex].hourly;
}

function lastDays(series) {
  return series.map((line) => ({ ...line, values: line.values.slice(-DAILY_SOURCE_DAYS) }));
}

// The call lines that show at the start: the customer's, and the calls recorded before the caller
// was recorded, which leave the 90 days as they age.
const CUSTOMER_AND_UNKNOWN_CALLS = ["@customer", "@unknown"];

// Lines that start hidden, by chart id and mode id; the legend still shows them.
const INITIALLY_HIDDEN_SERIES = {
  "visitors": {
    "sessions": ["synthetic", "bot", "system"],
    "sign-in-provider": { showOnlySuffix: ["@customer"] },
  },
  "activity-started-and-completed": {
    "started": ["total", "bundle"],
    "completed": ["total", "bundle"],
    "api-calls": { showOnly: ["all"] },
  },
  "integration-requests": {
    "all": { showOnlySuffix: CUSTOMER_AND_UNKNOWN_CALLS },
    "hmrc": { showOnlySuffix: CUSTOMER_AND_UNKNOWN_CALLS },
    "companies-house": { showOnlySuffix: CUSTOMER_AND_UNKNOWN_CALLS },
    "stripe": { showOnlySuffix: CUSTOMER_AND_UNKNOWN_CALLS },
  },
  "integration-duration": { organisation: { showOnlySuffix: CUSTOMER_AND_UNKNOWN_CALLS } },
  "conversion-to-submission": { funnel: ["sessions-from-spreadsheets", "sessions-from-www", "sessions-from-elsewhere"] },
  "low-running-cost": {
    cost: ["total", "Tax"],
    deployment: ["total", "untagged"],
    charge: { hide: ["total"], hidePrefix: "Tax for product code" },
  },
  "data-totals": { transactional: { showOnlySuffix: ["@customer"] } },
  "retention": {
    totals: ["accounts-total-test", "accounts-total-synthetic", "accounts-total-other", "accounts-total-unknown"],
    events: ["new-accounts-test", "new-accounts-synthetic", "new-accounts-other", "new-accounts-unknown"],
  },
};

// An entry is a list of hidden line ids, or { showOnly: [ids] } for a mode whose lines are not
// known in advance: every other line, daily or hourly, starts hidden. { showOnlySuffix: [suffixes] }
// hides every line whose id ends with none of the suffixes, as the lines of a caller class do, and
// { hide: [ids], hidePrefix } hides those lines and every line whose id starts with the prefix.
function initiallyHidden(chart, modeIndex) {
  const byMode = INITIALLY_HIDDEN_SERIES[chart.id];
  const mode = chart.modes[modeIndex];
  const entry = byMode && byMode[mode.id];
  const lineIds = () => [...mode.series, ...(mode.hourly ? mode.hourly.series : [])].map((series) => series.id);
  if (entry && entry.showOnlySuffix) {
    return new Set(lineIds().filter((id) => !entry.showOnlySuffix.some((suffix) => id.endsWith(suffix))));
  }
  if (entry && entry.showOnly) {
    return new Set(lineIds().filter((id) => !entry.showOnly.includes(id)));
  }
  if (entry && entry.hidePrefix) {
    return new Set(lineIds().filter((id) => entry.hide.includes(id) || id.startsWith(entry.hidePrefix)));
  }
  return new Set(entry || []);
}

function activeSeries(state) {
  const mode = state.chart.modes[state.modeIndex];
  let series = mode.series;
  if (isHourly(state)) series = mode.hourly.series;
  else if (isDailySourceRange(state)) series = lastDays(mode.series);
  return mode.hidesIdleLines ? series.filter((line) => line.isTotal || line.values.some((value) => value !== 0 && value !== null)) : series;
}

// A duration at or above 1,000 ms reads in seconds.
function formatDuration(value) {
  return value >= 1000 ? readoutNumberFormat.format(value / 1000) + " s" : readoutNumberFormat.format(value) + " ms";
}

// Bytes read in the largest unit of 1,000 that keeps the figure at 1 or more.
const BYTE_UNITS = ["B", "kB", "MB", "GB", "TB"];

function formatBytes(value, numberFormat) {
  let scaled = value;
  let index = 0;
  while (Math.abs(scaled) >= 1000 && index < BYTE_UNITS.length - 1) {
    scaled /= 1000;
    index += 1;
  }
  return numberFormat.format(scaled) + " " + BYTE_UNITS[index];
}

function formatAxisValue(unit, value) {
  if (unit === "ms") return formatDuration(value);
  if (unit === "bytes") return formatBytes(value, axisNumberFormat);
  if (unit === "ratio") return axisNumberFormat.format(value * 100) + "%";
  return (UNIT_PREFIX[unit] || "") + axisNumberFormat.format(value);
}

function formatReadoutValue(unit, value) {
  if (unit === "ms") return formatDuration(value);
  if (unit === "bytes") return formatBytes(value, readoutNumberFormat);
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

// The runs of consecutive days that have a figure, each a list of { value, index }.
function lineRuns(values) {
  const runs = [];
  values.forEach((value, index) => {
    if (value === null || value === undefined) {
      runs.push(null);
      return;
    }
    if (runs.length === 0 || runs[runs.length - 1] === null) runs.push([]);
    runs[runs.length - 1].push({ value, index });
  });
  return runs.filter(Boolean);
}

// A line with a figure other than 0 on at most one point in ten. Its figures are dotted, so a
// lone event reads as a point and not as a spike that rises and falls over two days.
const SPARSE_POINT_SHARE = 0.1;

function isSparse(values) {
  const figures = values.filter((value) => value !== null && value !== undefined && value !== 0).length;
  return figures > 0 && figures <= values.length * SPARSE_POINT_SHARE;
}

// The value axis: from 0, or below 0 when a line falls below it, to a nice ceiling, in four
// steps. Below 0 the step is a nice number and the lowest value a whole number of steps, so 0 is
// a grid line.
function valueAxis(values) {
  const highest = Math.max(0, ...values);
  const lowest = Math.min(0, ...values);
  if (lowest >= 0) return { minValue: 0, maxValue: niceCeiling(highest) };
  let step = niceCeiling((highest - lowest) / 4);
  let minValue = Math.floor(lowest / step) * step;
  while (minValue + 4 * step < highest) {
    step = niceCeiling(step * 1.01);
    minValue = Math.floor(lowest / step) * step;
  }
  return { minValue, maxValue: minValue + 4 * step };
}

function axisTicks({ minValue, maxValue }) {
  return [0, 1, 2, 3, 4].map((tick) => minValue + ((maxValue - minValue) / 4) * tick);
}

// The left margin that holds the widest value label, at least MARGIN.left.
function leftMarginFor(unit, axis) {
  const widest = Math.max(...axisTicks(axis).map((value) => formatAxisValue(unit, value).length));
  return Math.max(MARGIN.left, 12 + widest * AXIS_CHARACTER_WIDTH);
}

function drawChart(state) {
  const { chart, svg, readout } = state;
  const mode = chart.modes[state.modeIndex];
  const hourly = isHourly(state);
  let days = hourly ? state.hours : state.days;
  if (isDailySourceRange(state)) days = state.days.slice(-DAILY_SOURCE_DAYS);
  const formatPoint = hourly ? formatHour : formatDay;
  const seriesList = activeSeries(state);
  const unit = mode.unit || chart.unit;
  const visible = seriesList.filter((series) => !state.hidden.has(series.id));
  const styles = lineStylesFor(seriesList);

  const width = Math.max(state.card.clientWidth - 2, 240);
  const axis = valueAxis(visible.flatMap((series) => series.values.filter((value) => value !== null)));
  const left = leftMarginFor(unit, axis);
  const plotWidth = width - left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  svg.setAttribute("viewBox", "0 0 " + width + " " + CHART_HEIGHT);
  svg.setAttribute("width", width);
  svg.setAttribute("height", CHART_HEIGHT);
  svg.replaceChildren();

  const xAt = (index) => left + (days.length === 1 ? 0 : (index / (days.length - 1)) * plotWidth);
  const yAt = (value) => MARGIN.top + plotHeight - ((value - axis.minValue) / (axis.maxValue - axis.minValue)) * plotHeight;

  for (const value of axisTicks(axis)) {
    svg.appendChild(svgElement("line", { x1: left, x2: width - MARGIN.right, y1: yAt(value), y2: yAt(value), class: "chart-grid" }));
    const label = svgElement("text", { "x": left - 6, "y": yAt(value) + 4, "text-anchor": "end", "class": "chart-axis" });
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
    const sparse = isSparse(series.values);
    // A day with no figure (null) breaks the line; a lone figure is drawn as a dot, and a chart that sets `marks` dots every figure.
    lineRuns(series.values).forEach((run) => {
      const points = run.map(({ value, index }) => xAt(index).toFixed(1) + "," + yAt(value).toFixed(1)).join(" ");
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
      const everyFigure = chart.marks || run.length === 1 || series.values.some((value) => value === null);
      if (everyFigure || sparse) {
        run
          .filter(({ value }) => everyFigure || value !== 0)
          .forEach(({ value, index }) =>
            svg.appendChild(
              svgElement("circle", {
                cx: xAt(index).toFixed(1),
                cy: yAt(value).toFixed(1),
                r: 3,
                fill: style.colour,
                class: "chart-point",
              }),
            ),
          );
      }
    });
  });

  const guide = svgElement("line", { y1: MARGIN.top, y2: MARGIN.top + plotHeight, class: "chart-guide", visibility: "hidden" });
  svg.appendChild(guide);
  const overlay = svgElement("rect", {
    x: left,
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
      .map((series) => series.label + " " + (series.values[index] === null ? "no figure" : formatReadoutValue(unit, series.values[index])));
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

  const hasNoFigure = (series) => series.values.every((value) => value === 0 || value === null);
  const everyValueZero = visible.every(hasNoFigure);
  const hiddenWithData = seriesList.filter((series) => state.hidden.has(series.id) && !hasNoFigure(series)).length;
  const span = `${days.length} ${hourly ? "hours" : "days"}`;
  const hiddenLines = hiddenWithData === 1 ? "1 hidden line has" : `${hiddenWithData} hidden lines have`;
  const shown = visible.length > 0 ? `The lines shown have no data in the last ${span}.` : "Every line is hidden.";
  state.empty.textContent =
    hiddenWithData > 0 ? `${shown} ${hiddenLines} data: press Show all, or a line in the legend.` : `No data in the last ${span}.`;
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
  if (!state.chart.standalone || state.chart.rangeSwitch) controls.appendChild(rangeSwitch(state));
  return controls;
}

// The switch between 90 days by day and 14 days. Every graph has it and it keeps its place and its
// state when the reader changes tab. A tab with an hourly series draws the 14 days by hour; a tab
// whose source reports whole days draws its last 14 daily points and says so.
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
  if (!state.rangeSwitch) return;
  state.rangeSwitch.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.range === state.range));
  });
  const shortRange = state.rangeSwitch.querySelector('[data-range="hourly"]');
  shortRange.textContent = state.chart.modes[state.modeIndex].hourly ? "14 days, by hour" : "14 days, by day";
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
  "integration-requests",
  "integration-duration",
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

// The id of the table section that backs a chart, or null for a chart with no table.
function chartTableId(chart) {
  if (chart.id === "data-totals") return "dataTablesPanel";
  if (chart.standalone) return null;
  if (chart.id === "visitors") return "visitorsPanel";
  if (chart.id === "activity-started-and-completed") return "activitiesPanel";
  if (chart.id.startsWith("integration-")) return "integrationsSummaryPanel";
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
  const tableId = chartTableId(chart);
  if (tableId) decorateSectionHeading(heading, card.id, [["Table", "#" + tableId, "chart-table-link"]]);

  const state = { chart, days, hours, range: "daily", modeIndex: 0, hidden: initiallyHidden(chart, 0), card };

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
        state.hidden = initiallyHidden(chart, index);
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

  if (chart.cohort) card.appendChild(renderCohortTable(chart.cohort));

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

const cohortMonthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const cohortShareFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

// The cohort table under a graph: a row per signup month, the cohort's accounts, then for each
// month since signup the accounts that submitted in it and their share of the cohort. A month the
// cohort has not reached yet is empty.
function renderCohortTable(cohort) {
  const wrapper = document.createElement("div");
  wrapper.className = "chart-cohort";
  const table = document.createElement("table");
  table.className = "observations data-table chart-cohort-table";
  const caption = document.createElement("caption");
  caption.textContent = "Accounts that submitted, by signup month and month since signup";
  table.appendChild(caption);
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Signup month", "Accounts", ...Array.from({ length: cohort.months }, (_, month) => "Month " + month)].forEach((text) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);
  table.appendChild(head);
  const body = document.createElement("tbody");
  cohort.rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    tableRow.className = "chart-cohort-row";
    tableRow.dataset.signupMonth = row.signupMonth;
    const month = document.createElement("th");
    month.scope = "row";
    month.textContent = cohortMonthFormat.format(new Date(row.signupMonth + "-01T00:00:00Z"));
    tableRow.appendChild(month);
    const accounts = document.createElement("td");
    accounts.textContent = String(row.accounts);
    tableRow.appendChild(accounts);
    for (let index = 0; index < cohort.months; index += 1) {
      const cell = document.createElement("td");
      const submitters = row.submitters[index];
      if (submitters !== undefined) {
        const share = row.accounts > 0 ? " (" + cohortShareFormat.format((submitters / row.accounts) * 100) + "%)" : "";
        cell.textContent = submitters + share;
      }
      tableRow.appendChild(cell);
    }
    body.appendChild(tableRow);
  });
  if (cohort.rows.length === 0) {
    const empty = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = cohort.months + 2;
    cell.textContent = "No accounts opened in the months the table covers.";
    empty.appendChild(cell);
    body.appendChild(empty);
  }
  table.appendChild(body);
  wrapper.appendChild(table);
  return wrapper;
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
  const dailyCharts = daily && daily.charts ? daily.charts : [];
  if (dailyCharts.length === 0 && !snapshot.data) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  sortCharts(dailyCharts).forEach((chart) => {
    const state = renderChartCard(chart, daily.days, daily.hours || []);
    grid.appendChild(state.card);
    renderedCharts.push(state);
  });
  // The stored-data chart holds its own days and hours, so it is drawn beside the daily charts.
  if (snapshot.data && snapshot.data.chart) {
    const state = renderChartCard(snapshot.data.chart, snapshot.data.chart.days, snapshot.data.chart.hours || []);
    grid.appendChild(state.card);
    renderedCharts.push(state);
  }
  renderedCharts.forEach((state) => state.draw());
}

// One chart outside the snapshot's daily charts, for a panel that holds its own series. The
// caller attaches `element`, then calls `draw`, because a chart sizes itself from its card.
function renderStandaloneChart(chart, days) {
  const state = renderChartCard(chart, days, []);
  renderedCharts.push(state);
  return { element: state.card, draw: state.draw };
}

window.renderDailyCharts = renderDailyCharts;
window.renderStandaloneChart = renderStandaloneChart;
window.decorateSectionHeading = decorateSectionHeading;
window.parseRefreshMinutes = parseRefreshMinutes;
window.addEventListener("resize", redrawAllCharts);
