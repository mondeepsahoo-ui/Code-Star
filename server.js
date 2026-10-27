"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = __dirname;
const FIRMS_SOURCE = "VIIRS_SNPP_SP";

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value.slice(0, 4) !== "0000";
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function cleanProviderMessage(message, apiKey) {
  let clean = String(message || "").trim();
  if (apiKey) {
    clean = clean.replaceAll(apiKey, "[redacted]");
    clean = clean.replaceAll(encodeURIComponent(apiKey), "[redacted]");
  }
  return clean.slice(0, 500);
}

function isFirmsCsv(csv) {
  const header = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const columns = header.split(",").map((column) => column.trim().replace(/^"|"$/g, "").toLowerCase());
  return ["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence"]
    .every((column) => columns.includes(column));
}

async function handleFirms(response, url, { env, fetchImpl }) {
  const dates = url.searchParams.getAll("date");
  if (dates.length !== 1 || !isValidDate(dates[0])) {
    sendJson(response, 400, { error: "Provide one valid date in YYYY-MM-DD format." });
    return;
  }

  const apiKey = env.FIRMS_MAP_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: "NASA FIRMS is not configured on this server." });
    return;
  }

  const providerUrl = new URL(
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(apiKey)}/${FIRMS_SOURCE}/world/1/${dates[0]}`
  );
  let providerResponse;
  try {
    providerResponse = await fetchImpl(providerUrl, {
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      sendJson(response, 504, { error: "NASA FIRMS did not respond before the request timed out." });
    } else {
      sendJson(response, 502, { error: "Could not reach NASA FIRMS." });
    }
    return;
  }

  let providerBody;
  try {
    providerBody = await providerResponse.text();
  } catch {
    sendJson(response, 502, { error: "Could not read the NASA FIRMS response.", provider: "NASA FIRMS" });
    return;
  }
  if (!providerResponse.ok) {
    const message = cleanProviderMessage(providerBody, apiKey);
    sendJson(response, providerResponse.status, {
      error: message || `NASA FIRMS returned HTTP ${providerResponse.status}.`,
      provider: "NASA FIRMS"
    });
    return;
  }

  if (!isFirmsCsv(providerBody)) {
    sendJson(response, 502, { error: "NASA FIRMS returned an invalid CSV response.", provider: "NASA FIRMS" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(providerBody);
}

const apiRoutes = new Map([
  ["/api/firms", handleFirms]
]);

const frontendFiles = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["script.js", "text/javascript; charset=utf-8"],
  ["style.css", "text/css; charset=utf-8"]
]);

function serveFrontend(request, response, pathname) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Only GET requests are supported." });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const contentType = frontendFiles.get(relativePath);
  if (!contentType) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  const filePath = path.resolve(frontendRoot, relativePath);
  if (!filePath.startsWith(`${frontendRoot}${path.sep}`)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, error.code === "ENOENT" ? 404 : 500, { error: "File could not be served." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  });
}

function createServer({ env = process.env, fetchImpl = fetch } = {}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const handler = apiRoutes.get(url.pathname);
    if (handler) {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendJson(response, 405, { error: "Only GET requests are supported." });
        return;
      }
      await handler(response, url, { env, fetchImpl });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API route not found." });
      return;
    }
    serveFrontend(request, response, url.pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8000);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`City Pulse backend listening at http://127.0.0.1:${port}`);
  });
}

module.exports = { createServer, isValidDate };
