// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Links into the AWS console for the figures the operator page does not chart. The AWS
// console cannot switch account from a link, so each link names the account to sign in to.
// Every link needs a signed-in console session; none carries data.

(function () {
  const SAFE = /[A-Za-z0-9\-_.]/;

  // The CloudWatch console writes a string inside a URL fragment as "*" and two lowercase hex
  // digits for each byte outside [A-Za-z0-9-_.].
  function encodeHashValue(value) {
    let out = "";
    new TextEncoder().encode(value).forEach((byte) => {
      const ch = String.fromCharCode(byte);
      out += SAFE.test(ch) ? ch : "*" + byte.toString(16).padStart(2, "0");
    });
    return out;
  }

  function consoleBase(region, service) {
    return "https://" + region + ".console.aws.amazon.com/" + service + "/home?region=" + region;
  }

  function metricsSearchUrl(region, query) {
    return consoleBase(region, "cloudwatch") + "#metricsV2:graph=~();query=~'" + encodeHashValue(query);
  }

  function alarmsUrl(region, alarmNamePrefix) {
    return consoleBase(region, "cloudwatch") + "#alarmsV2:?search=" + encodeURIComponent(alarmNamePrefix);
  }

  function logsInsightsUrl(region, logGroupName) {
    return consoleBase(region, "cloudwatch") + "#logsV2:logs-insights$3FqueryDetail$3D~(source~(~'" + encodeHashValue(logGroupName) + "))";
  }

  function xrayUrl(region) {
    return consoleBase(region, "xray") + "#/service-map";
  }

  function rumUrl(region, appMonitor) {
    return consoleBase(region, "cloudwatch") + "#rum:performance/" + encodeURIComponent(appMonitor);
  }

  // One DynamoDB item, by table name and key. The link carries no item data. The console opens
  // the item in the account the operator is signed in to, so the page names the account.
  function dynamoItemUrl(region, table, pk, sk) {
    const encodedTable = encodeURIComponent(table);
    return (
      consoleBase(region, "dynamodbv2") +
      "#edit-item?table=" +
      encodedTable +
      "&itemMode=2&pk=" +
      encodeURIComponent(pk) +
      "&sk=" +
      encodeURIComponent(sk) +
      "&ref=%23item-explorer%3Ftable%3D" +
      encodedTable +
      "&route=ROUTE_ITEM_EXPLORER"
    );
  }

  const ENVIRONMENTS = [
    { id: "prod", account: "submit-prod 972912397388", region: "eu-west-2" },
    { id: "ci", account: "submit-ci 367191799875", region: "eu-west-2" },
  ];

  const SIBLING_RUM = [
    {
      key: "spreadsheets",
      label: "Spreadsheets site web vitals",
      account: "spreadsheets 064390746177",
      region: "us-east-1",
      monitor: "spreadsheets-web",
    },
    { key: "gateway", label: "Gateway site web vitals", account: "gateway 283165661847", region: "us-east-1", monitor: "gateway-web" },
  ];

  // Each link has an id the console capture knows (app/services/consoleCaptureCatalogue.js) and
  // the capture ids whose image or table the page shows beside it.
  const analyticsQueries = [
    [
      "cognito-sign-ins",
      "Cognito sign-ins and refreshes by client",
      '{AWS/Cognito,UserPool,UserPoolClient} MetricName="SignInSuccesses"',
      ["cognito-sign-ins", "cognito-sign-ins-rest"],
    ],
    ["hmrc-authentications", "HMRC authentications", "Submit/Analytics HmrcAuthentications"],
    ["bundle-operations", "Bundle operations by activity", '{Submit/Analytics,Activity} MetricName="BundleOperations"'],
    ["bundle-grants", "Bundle grants", "Submit/Analytics BundleGrants"],
    [
      "purchases",
      "Purchases: GA4, Stripe and activity events",
      "Submit/Analytics Ga4Purchases OR StripePaidCharges OR ActivityActivations",
    ],
    ["deploy-lead-time", "Deploy lead time in hours", '{Submit/Analytics,Environment} MetricName="DeployLeadTimeHours"'],
    ["analytics-all", "Every Submit/Analytics metric", "Submit/Analytics", ["analytics-all", "analytics-all-middle", "analytics-all-rest"]],
  ];

  const operationsQueries = [
    ["lambda-errors", "Lambda errors by function", '{AWS/Lambda,FunctionName} MetricName="Errors" -app-'],
    ["lambda-throttles", "Lambda throttles by function", '{AWS/Lambda,FunctionName} MetricName="Throttles" -app-'],
    ["bundle-allocations", "Active bundle allocations", '{Submit/BundleCapacity,bundleId} MetricName="BundleActiveAllocations"'],
  ];

  function link(env, slug, label, href, captureSlugs) {
    const id = env.id + "-" + slug;
    return {
      id: id,
      captures: (captureSlugs || [slug]).map((captureSlug) => env.id + "-" + captureSlug),
      label: label,
      account: env.account,
      env: env.id,
      href: href,
    };
  }

  function groups() {
    const result = [];
    ENVIRONMENTS.forEach((env) => {
      const analytics = { title: "Analytics on AWS " + env.id, env: env.id, links: [] };
      analyticsQueries.forEach(([slug, label, query, captureSlugs]) => {
        analytics.links.push(link(env, slug, label, metricsSearchUrl(env.region, query), captureSlugs));
      });
      result.push(analytics);
    });
    ENVIRONMENTS.forEach((env) => {
      const operations = { title: "Operations on AWS " + env.id, env: env.id, links: [] };
      operationsQueries.forEach(([slug, label, query]) => {
        operations.links.push(link(env, slug, label, metricsSearchUrl(env.region, query)));
      });
      operations.links.push(
        link(
          env,
          "lambda-duration",
          "Lambda duration by function",
          metricsSearchUrl(env.region, '{AWS/Lambda,FunctionName} MetricName="Duration" -app-'),
          ["lambda-duration-slowest", "lambda-duration-rest", "lambda-duration-tail"],
        ),
      );
      operations.links.push(
        link(env, "rum", "Web vitals and JavaScript errors", rumUrl(env.region, env.id + "-env-rum"), [
          "rum-vitals",
          "rum-vitals-score",
          "rum-errors",
        ]),
      );
      operations.links.push(link(env, "alarms", "Alarms", alarmsUrl(env.region, env.id + "-")));
      operations.links.push(
        link(env, "bedrock", "Bedrock invocations in Logs Insights", logsInsightsUrl(env.region, "/" + env.id + "/bedrock/invocations")),
      );
      operations.links.push(link(env, "xray", "X-Ray service map", xrayUrl(env.region)));
      if (env.id === "prod") {
        SIBLING_RUM.forEach((rum) => {
          operations.links.push({
            id: rum.key + "-rum",
            captures: [rum.key + "-rum-vitals", rum.key + "-rum-vitals-score"],
            label: rum.label,
            account: rum.account,
            env: "prod",
            href: rumUrl(rum.region, rum.monitor),
          });
        });
      }
      result.push(operations);
    });
    return result;
  }

  const capturedFormat = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  function formatCaptured(iso) {
    return capturedFormat.format(new Date(iso)).replace(",", "") + " UTC";
  }

  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function tableElement(columns, rows) {
    const table = document.createElement("table");
    table.className = "observations data-table console-capture-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => headRow.appendChild(textElement("th", "", column.heading)));
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((column) => tr.appendChild(textElement("td", "", String(column.value(row)))));
      if (row.state) tr.dataset.state = row.state;
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  const ALARM_COLUMNS = [
    { heading: "Alarm", value: (row) => row.name },
    { heading: "State", value: (row) => row.state },
    { heading: "Since", value: (row) => (row.stateUpdatedAt ? formatCaptured(row.stateUpdatedAt) : "") },
    { heading: "Last fired", value: (row) => (row.lastFiredAt ? formatCaptured(row.lastFiredAt) : "") },
    { heading: "Reason", value: (row) => row.reason },
  ];

  const SERVICE_COLUMNS = [
    { heading: "Service", value: (row) => row.name },
    { heading: "Type", value: (row) => row.type || "" },
    { heading: "Requests", value: (row) => row.requests },
    { heading: "Errors", value: (row) => row.errors },
    { heading: "Faults", value: (row) => row.faults },
    { heading: "Throttles", value: (row) => row.throttles },
    { heading: "Average ms", value: (row) => (row.averageResponseMilliseconds === null ? "" : row.averageResponseMilliseconds) },
  ];

  // One model's invocations or tokens per UTC day, from the hourly rows of the capture.
  function dayTotal(rows, model, day, field) {
    return rows.filter((row) => row.modelId === model && row.bin.startsWith(day)).reduce((sum, row) => sum + row[field], 0);
  }

  // The model name a reader recognises: the part after the last slash of an ARN, without the
  // provider prefix and the version suffix.
  function shortModelName(model) {
    return model.slice(model.lastIndexOf("/") + 1).replace(/-v1:0$/, "");
  }

  function bedrockMeasure(rows, days, models, id, label, field) {
    return {
      id: id,
      label: label,
      unit: "count",
      series: models.map((model) => ({
        id: model,
        label: shortModelName(model),
        values: days.map((day) => dayTotal(rows, model, day, field)),
      })),
    };
  }

  function bedrockChart(allRows) {
    const rows = allRows.filter((row) => row.modelId);
    const days = [...new Set(rows.map((row) => row.bin.slice(0, 10)))].sort();
    const models = [...new Set(rows.map((row) => row.modelId))].sort();
    return {
      days: days,
      chart: {
        id: "bedrock-invocations",
        standalone: true,
        title: "Bedrock invocations by day and model",
        modes: [
          bedrockMeasure(rows, days, models, "invocations", "Invocations", "invocations"),
          bedrockMeasure(rows, days, models, "input", "Input tokens", "inputTokens"),
          bedrockMeasure(rows, days, models, "output", "Output tokens", "outputTokens"),
        ],
      },
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // An <img src> to the API would send no token, so the bytes are fetched with it and set as a data URL.
  async function loadImageInto(image, captureId) {
    const idToken = window.localStorage ? window.localStorage.getItem("cognitoIdToken") : null;
    const init = idToken ? { headers: { Authorization: "Bearer " + idToken } } : {};
    const fetcher = window.fetchWithIdToken || window.fetch;
    try {
      const response = await fetcher("/api/v1/operator/console-image?id=" + encodeURIComponent(captureId), init);
      if (!response.ok) throw new Error("HTTP " + response.status);
      image.src = await blobToDataUrl(await response.blob());
    } catch {
      image.replaceWith(textElement("p", "console-capture-error", "The image did not load."));
    }
  }

  function imageElement(captureId, title) {
    const image = document.createElement("img");
    image.className = "console-capture-image";
    image.alt = title;
    loadImageInto(image, captureId);
    return image;
  }

  function captureElement(entry, captureId) {
    const wrapper = document.createElement("div");
    wrapper.className = "console-capture-item";
    wrapper.dataset.captureId = captureId;
    if (!entry) {
      wrapper.appendChild(textElement("p", "console-capture-empty", "Not captured yet"));
      return { element: wrapper };
    }
    const caption = textElement("p", "console-capture-time", entry.title + ", captured " + formatCaptured(entry.capturedAt));
    wrapper.appendChild(caption);
    if (entry.error) {
      wrapper.appendChild(textElement("p", "console-capture-error", "Capture failed: " + entry.error));
      return { element: wrapper };
    }
    if (entry.imageKey) {
      if (entry.hasData === false) wrapper.appendChild(textElement("p", "console-capture-empty", "No data in the range"));
      wrapper.appendChild(imageElement(captureId, entry.title));
      return { element: wrapper };
    }
    if (entry.kind === "alarms") {
      wrapper.appendChild(
        entry.rows.length === 0 ? textElement("p", "console-capture-empty", "No alarms.") : tableElement(ALARM_COLUMNS, entry.rows),
      );
      return { element: wrapper };
    }
    if (entry.kind === "service-graph") {
      wrapper.appendChild(
        entry.rows.length === 0
          ? textElement("p", "console-capture-empty", "No services in the window.")
          : tableElement(SERVICE_COLUMNS, entry.rows),
      );
      return { element: wrapper };
    }
    if (entry.kind === "bedrock") {
      if (entry.rows.length === 0) {
        wrapper.appendChild(textElement("p", "console-capture-empty", "No Bedrock invocations in the last 7 days."));
        return { element: wrapper };
      }
      const { chart, days } = bedrockChart(entry.rows);
      const drawn = window.renderStandaloneChart(chart, days);
      wrapper.appendChild(drawn.element);
      return { element: wrapper, draw: drawn.draw };
    }
    return { element: wrapper };
  }

  // Called by the page once the operator snapshot request has shown the caller holds the
  // operator bundle; until then the panel stays hidden and holds no link. `consoleIndex` is
  // snapshot.console, or undefined when no capture has run.
  function render(consoleIndex) {
    const mount = document.getElementById("awsLinksGroups");
    mount.replaceChildren();
    document.getElementById("awsLinksPanel").hidden = false;
    const items = (consoleIndex && consoleIndex.items) || {};
    const draws = [];
    groups().forEach((group) => {
      const heading = document.createElement("h3");
      heading.textContent = group.title;
      heading.dataset.tab = "aws-" + group.env;
      mount.appendChild(heading);
      group.links.forEach((entry) => {
        const section = document.createElement("section");
        section.className = "console-capture";
        section.id = "console-" + entry.id;
        section.dataset.tab = "aws-" + group.env;
        const anchor = document.createElement("a");
        anchor.href = entry.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = entry.label + " (" + entry.env + ", account " + entry.account + ")";
        const linkHeading = document.createElement("h4");
        linkHeading.appendChild(anchor);
        section.appendChild(linkHeading);
        entry.captures.forEach((captureId) => {
          const built = captureElement(items[captureId], captureId);
          section.appendChild(built.element);
          if (built.draw) draws.push(built.draw);
        });
        mount.appendChild(section);
      });
    });
    draws.forEach((draw) => draw());
  }

  function consoleAccount(environmentId) {
    const environment = ENVIRONMENTS.find((entry) => entry.id === environmentId);
    return environment ? environment.account : null;
  }

  window.dynamoItemUrl = dynamoItemUrl;
  window.awsConsoleAccount = consoleAccount;
  window.awsLinkGroups = groups;
  window.renderAwsLinks = render;
})();
