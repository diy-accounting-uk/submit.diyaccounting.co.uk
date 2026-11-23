// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// CloudFront Function (cloudfront-js-2.0), viewer request, default behaviour only.
// pageRouterCode.js and PageRouterFunctionCode.java fill the two data lines below from the
// published files and remove every comment line, because CloudFront limits a function to 10 KB.
// PAGES maps a directory ("" is the root) to the space-separated names of its .html pages.

const PAGES = {};
const NOT_FOUND_HTML = "";

function isPage(path) {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash + 1);
  const name = path.slice(slash + 1, -".html".length);
  if (name === "" || !Object.prototype.hasOwnProperty.call(PAGES, dir)) {
    return false;
  }
  return (" " + PAGES[dir] + " ").indexOf(" " + name + " ") !== -1;
}

function queryString(querystring) {
  const parts = [];
  Object.keys(querystring).forEach(function (key) {
    const entry = querystring[key];
    const values = entry.multiValue ? entry.multiValue : [entry];
    values.forEach(function (value) {
      parts.push(value.value === "" ? key : key + "=" + value.value);
    });
  });
  return parts.length > 0 ? "?" + parts.join("&") : "";
}

function redirect(location, request) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      "location": { value: location + queryString(request.querystring) },
      "cache-control": { value: "max-age=3600" },
    },
  };
}

function notFound() {
  return {
    statusCode: 404,
    statusDescription: "Not Found",
    headers: {
      "content-type": { value: "text/html" },
      "cache-control": { value: "no-cache" },
    },
    body: { encoding: "text", data: NOT_FOUND_HTML },
  };
}

// eslint-disable-next-line no-unused-vars
function handler(event) {
  const request = event.request;
  const uri = request.uri;
  if (uri === "/" || uri.indexOf("/.well-known/") === 0) {
    return request;
  }
  // Every view of the company lookup's drill-down is one page, which reads its path on load.
  if (uri.indexOf("/companies-house/company/") === 0) {
    request.uri = "/companies-house/companySearch.html";
    return request;
  }
  if (uri.indexOf("/cy/companies-house/company/") === 0) {
    request.uri = "/cy/companies-house/companySearch.html";
    return request;
  }
  const path = uri.slice(1);
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (last === "") {
    if (isPage(path + "index.html")) {
      request.uri = uri + "index.html";
      return request;
    }
    const bare = path.slice(0, -1);
    return isPage(bare + ".html") ? redirect("/" + bare + ".html", request) : notFound();
  }
  if (last.indexOf(".") === -1) {
    if (isPage(path + ".html")) {
      return redirect(uri + ".html", request);
    }
    return isPage(path + "/index.html") ? redirect(uri + "/", request) : notFound();
  }
  if (last.slice(-".html".length) === ".html") {
    return isPage(path) ? request : notFound();
  }
  return request;
}
