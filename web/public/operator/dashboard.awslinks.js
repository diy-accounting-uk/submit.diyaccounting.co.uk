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

  const ENVIRONMENTS = [
    { id: "prod", account: "submit-prod 972912397388", region: "eu-west-2" },
    { id: "ci", account: "submit-ci 367191799875", region: "eu-west-2" },
  ];

  const SIBLING_RUM = [
    { label: "Spreadsheets site web vitals", account: "spreadsheets 064390746177", region: "us-east-1", monitor: "spreadsheets-web" },
    { label: "Gateway site web vitals", account: "gateway 283165661847", region: "us-east-1", monitor: "gateway-web" },
  ];

  const analyticsQueries = [
    ["Cognito sign-ins and refreshes by client", '{AWS/Cognito,UserPool,UserPoolClient} MetricName="SignInSuccesses"'],
    ["HMRC authentications", "Submit/Analytics HmrcAuthentications"],
    ["Bundle operations by activity", '{Submit/Analytics,Activity} MetricName="BundleOperations"'],
    ["Bundle grants", "Submit/Analytics BundleGrants"],
    ["Purchases: GA4, Stripe and activity events", "Submit/Analytics Ga4Purchases OR StripePaidCharges OR ActivityActivations"],
    ["Deploy lead time in hours", '{Submit/Analytics,Environment} MetricName="DeployLeadTimeHours"'],
    ["Every Submit/Analytics metric", "Submit/Analytics"],
  ];

  const operationsQueries = [
    ["Lambda errors by function", '{AWS/Lambda,FunctionName} MetricName="Errors" -app-'],
    ["Lambda throttles by function", '{AWS/Lambda,FunctionName} MetricName="Throttles" -app-'],
    ["Lambda duration by function", '{AWS/Lambda,FunctionName} MetricName="Duration" -app-'],
    ["Active bundle allocations", '{Submit/BundleCapacity,bundleId} MetricName="BundleActiveAllocations"'],
  ];

  function groups() {
    const result = [];
    const analytics = { title: "Replaces the CloudWatch analytics dashboard", links: [] };
    const operations = { title: "Replaces the CloudWatch operations dashboard", links: [] };
    ENVIRONMENTS.forEach((env) => {
      analyticsQueries.forEach(([label, query]) => {
        analytics.links.push({ label: label, account: env.account, env: env.id, href: metricsSearchUrl(env.region, query) });
      });
      operationsQueries.forEach(([label, query]) => {
        operations.links.push({ label: label, account: env.account, env: env.id, href: metricsSearchUrl(env.region, query) });
      });
      operations.links.push({
        label: "Web vitals and JavaScript errors",
        account: env.account,
        env: env.id,
        href: rumUrl(env.region, env.id + "-env-rum"),
      });
      operations.links.push({ label: "Alarms", account: env.account, env: env.id, href: alarmsUrl(env.region, env.id + "-") });
      operations.links.push({
        label: "Bedrock invocations in Logs Insights",
        account: env.account,
        env: env.id,
        href: logsInsightsUrl(env.region, "/" + env.id + "/bedrock/invocations"),
      });
      operations.links.push({ label: "X-Ray service map", account: env.account, env: env.id, href: xrayUrl(env.region) });
    });
    SIBLING_RUM.forEach((rum) => {
      operations.links.push({
        label: rum.label,
        account: rum.account,
        env: "prod",
        href: rumUrl(rum.region, rum.monitor),
      });
    });
    result.push(analytics, operations);
    return result;
  }

  function render() {
    const mount = document.getElementById("awsLinksGroups");
    if (!mount) return;
    groups().forEach((group) => {
      const heading = document.createElement("h3");
      heading.textContent = group.title;
      mount.appendChild(heading);
      const list = document.createElement("ul");
      list.className = "aws-links-list";
      group.links.forEach((link) => {
        const item = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.href = link.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = link.label + " (" + link.env + ", account " + link.account + ")";
        item.appendChild(anchor);
        list.appendChild(item);
      });
      mount.appendChild(list);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
