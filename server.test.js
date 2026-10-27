"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createServer, isValidDate } = require("./server");

const apiKey = "test-map-key";
const csv = "latitude,longitude,acq_date,acq_time,satellite,confidence\n28.6,77.2,2025-05-14,324, SNPP, n\n";
let server;
let baseUrl;
let fetchImpl;
let fetchCalls;
let environment;

before(async () => {
  server = createServer({
    env: environment = {},
    fetchImpl: (...args) => {
      fetchCalls++;
      return fetchImpl(...args);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("validates real calendar dates in YYYY-MM-DD format", () => {
  assert.equal(isValidDate("2025-05-14"), true);
  assert.equal(isValidDate("0099-12-31"), true);
  for (const date of ["2025-02-29", "2024-13-01", "2024-04-31", "2025-5-14", "not-a-date", "0000-01-01"]) {
    assert.equal(isValidDate(date), false, date);
  }
});

test("rejects invalid and duplicate dates before calling the provider", async () => {
  fetchCalls = 0;
  for (const query of ["date=2025-02-29", "date=2025-05-14&date=2025-05-15", ""]) {
    const response = await fetch(`${baseUrl}/api/firms${query ? `?${query}` : ""}`);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /YYYY-MM-DD/);
  }
  assert.equal(fetchCalls, 0);
});

test("returns a clear configuration error when the API key is missing", async () => {
  fetchCalls = 0;
  const response = await fetch(`${baseUrl}/api/firms?date=2025-05-14`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/);
  assert.equal(fetchCalls, 0);
});

test("forwards valid FIRMS CSV and keeps the key out of the browser response", async () => {
  environment.FIRMS_MAP_KEY = apiKey;
  fetchCalls = 0;
  let requestedUrl;
  fetchImpl = async (url) => {
    requestedUrl = url;
    return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
  };

  const response = await fetch(`${baseUrl}/api/firms?date=2025-05-14`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.equal(await response.text(), csv);
  assert.equal(requestedUrl.pathname, `/api/area/csv/${apiKey}/VIIRS_SNPP_SP/world/1/2025-05-14`);
  assert.equal(fetchCalls, 1);
});

test("rejects a successful provider response that is not FIRMS CSV", async () => {
  environment.FIRMS_MAP_KEY = apiKey;
  fetchImpl = async () => new Response("<html>provider error</html>", { status: 200 });

  const response = await fetch(`${baseUrl}/api/firms?date=2025-05-14`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /invalid CSV/);
});

test("forwards provider status and sanitizes its error message", async () => {
  environment.FIRMS_MAP_KEY = apiKey;
  fetchImpl = async () => new Response(`Invalid key ${apiKey}`, { status: 403 });

  const response = await fetch(`${baseUrl}/api/firms?date=2025-05-14`);
  assert.equal(response.status, 403);
  const body = await response.text();
  assert.match(body, /Invalid key \[redacted\]/);
  assert.equal(body.includes(apiKey), false);
});

test("reports provider network failures without exposing request details", async () => {
  environment.FIRMS_MAP_KEY = apiKey;
  fetchImpl = async () => { throw new Error(`Failed to fetch ${apiKey}`); };

  const response = await fetch(`${baseUrl}/api/firms?date=2025-05-14`);
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /Could not reach NASA FIRMS/);
  assert.equal(body.includes(apiKey), false);
});

test("keeps API routing extensible and serves the existing dashboard", async () => {
  const unknownApi = await fetch(`${baseUrl}/api/weather`);
  assert.equal(unknownApi.status, 404);
  assert.match((await unknownApi.json()).error, /API route not found/);

  const dashboard = await fetch(baseUrl);
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get("content-type"), /text\/html/);
  assert.match(await dashboard.text(), /City Pulse/);

  const backendSource = await fetch(`${baseUrl}/server.js`);
  assert.equal(backendSource.status, 404);
});

test("rejects non-GET API requests", async () => {
  const response = await fetch(`${baseUrl}/api/firms?date=2025-05-14`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});
