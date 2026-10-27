(function () {
  "use strict";

  const DEMO_DATE = "2025-05-14";
  const DEFAULT_LOCATION = { name: "New Delhi, India", latitude: 28.6139, longitude: 77.209, country: "India" };
  const today = new Date();
  const todayIso = formatDateInput(today);
  const state = {
    date: DEMO_DATE,
    location: readStoredLocation() || DEFAULT_LOCATION,
    mode: "all",
    typeFilter: "all",
    severityFilter: "all",
    nearbyOnly: false,
    radiusKm: 10,
    incidents: [],
    visibleIncidents: [],
    nearbyIncidents: [],
    selectedIncidentId: null,
    map: null,
    markerLayer: null,
    locationMarker: null,
    markers: new Map(),
    searchTimer: null,
    weatherController: null,
    loadController: null,
    toastTimer: null,
    weather: null
  };
  const todayDate = new Date(`${todayIso}T12:00:00`);

  const demoRecords = [
    { id: "DEMO-F001", type: "fire", severity: "high", latitude: 28.6501, longitude: 77.2249, location: "Central Delhi sample", time: "03:24", status: "Demo observation", description: "Sample high-confidence satellite fire detection for interface testing. Not a real incident.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-F002", type: "fire", severity: "moderate", latitude: 28.6412, longitude: 77.1887, location: "New Delhi sample", time: "06:48", status: "Demo observation", description: "Sample satellite heat detection. Satellite observations do not confirm a structural fire.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-W001", type: "weather", severity: "high", latitude: 28.5355, longitude: 77.391, location: "Noida sample", time: "08:15", status: "Demo only — not an alert", description: "Fictional severe-weather sample used to demonstrate the dashboard. No warning has been issued.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-W002", type: "weather", severity: "moderate", latitude: 28.7041, longitude: 77.1025, location: "North Delhi sample", time: "11:05", status: "Demo only — not an alert", description: "Fictional rain advisory sample for interface testing. Not an official weather alert.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-F003", type: "fire", severity: "low", latitude: 28.4595, longitude: 77.0266, location: "Gurugram sample", time: "12:32", status: "Demo observation", description: "Sample low-confidence thermal anomaly. It may have a non-fire cause.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-L001", type: "flood", severity: "moderate", latitude: 27.1767, longitude: 78.0081, location: "Agra sample", time: "15:40", status: "Demo only — not a report", description: "Fictional flood report included to demonstrate incident type filters.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-F004", type: "fire", severity: "high", latitude: 26.9124, longitude: 75.7873, location: "Jaipur sample", time: "17:18", status: "Demo observation", description: "Sample satellite fire detection for testing. This record is not a confirmed incident.", source: "City Pulse demo dataset", demo: true },
    { id: "DEMO-W003", type: "weather", severity: "low", latitude: 30.3165, longitude: 78.0322, location: "Dehradun sample", time: "19:02", status: "Demo only — not an alert", description: "Fictional weather monitoring sample. It is not an official warning.", source: "City Pulse demo dataset", demo: true }
  ];

  const $ = (selector) => document.querySelector(selector);
  const els = {
    datePicker: $("#date-picker"),
    dateDisplay: $("#date-display"),
    locationSearch: $("#location-search"),
    locationName: $("#location-name"),
    suggestions: $("#location-suggestions"),
    connectionStatus: $("#connection-status"),
    retryButton: $("#retry-button"),
    typeFilter: $("#type-filter"),
    severityFilter: $("#severity-filter"),
    nearbyOnly: $("#nearby-only"),
    radiusSelect: $("#radius-select"),
    resultCount: $("#result-count"),
    weatherContent: $("#weather-content"),
    weatherSourceBadge: $("#weather-source-badge"),
    weatherNote: $("#weather-note"),
    incidentDetail: $("#incident-detail"),
    nearbyList: $("#nearby-list"),
    nearbyBadge: $("#nearby-badge"),
    timeline: $("#timeline"),
    timelineDate: $("#timeline-date"),
    toast: $("#toast"),
    previousDay: $("#previous-day"),
    nextDay: $("#next-day"),
    allMode: $("#all-mode"),
    fireMode: $("#fire-mode"),
    weatherMode: $("#weather-mode"),
    profileButton: $("#profile-button"),
    profileMenu: $("#profile-menu")
  };

  function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function prettyDate(value, options) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "Invalid date" : new Intl.DateTimeFormat(undefined, options || { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function readStoredLocation() {
    try {
      const saved = localStorage.getItem("city-pulse-location");
      if (!saved) return null;
      const location = JSON.parse(saved);
      if (typeof location.name === "string" && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) return location;
    } catch (error) {
      console.warn("Could not read the saved City Pulse location.", error);
    }
    return null;
  }

  function storeLocation(location) {
    try {
      localStorage.setItem("city-pulse-location", JSON.stringify(location));
    } catch (error) {
      console.warn("Could not save the selected City Pulse location.", error);
    }
  }

  function toast(message, isError) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("error", Boolean(isError));
    els.toast.classList.add("visible");
    state.toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 3200);
  }

  function showConnectionStatus(label, kind) {
    els.connectionStatus.className = `connection-status ${kind || ""}`;
    els.connectionStatus.querySelector("span").textContent = label;
  }

  function getFirmsProxyUrl() {
    const configured = window.CITY_PULSE_CONFIG && window.CITY_PULSE_CONFIG.firmsProxyUrl;
    if (typeof configured !== "string" || !configured.trim()) return null;
    try {
      const url = new URL(configured, window.location.href);
      if (url.origin !== window.location.origin) {
        console.error("The FIRMS proxy must be a same-origin URL so credentials are not exposed to a third party.");
        return null;
      }
      return url;
    } catch (error) {
      console.error("Invalid FIRMS proxy URL in CITY_PULSE_CONFIG.", error);
      return null;
    }
  }

  function initializeMap() {
    if (!window.L || !window.L.markerClusterGroup) {
      const message = "The map library did not load. Check your internet connection and reload the page.";
      $("#map").textContent = message;
      $("#map").classList.add("map-load-error");
      showConnectionStatus("MAP UNAVAILABLE", "is-error");
      throw new Error(message);
    }
    state.map = L.map("map", { zoomControl: true, scrollWheelZoom: true }).setView([20, 10], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    state.markerLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42 });
    state.map.addLayer(state.markerLayer);
    updateLocationMarker();
    state.map.setView([state.location.latitude, state.location.longitude], 5);
  }

  function markerIcon(incident, selected) {
    const nearby = calculateDistanceKm(state.location, incident) <= state.radiusKm;
    const classes = ["incident-marker", incident.severity || "moderate", nearby ? "nearby" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
    return L.divIcon({ className: "", html: `<span class="${classes}" aria-hidden="true"></span>`, iconSize: [23, 23], iconAnchor: [11, 11] });
  }

  function popupHtml(incident) {
    return `<div class="map-popup-title">${escapeHtml(typeLabel(incident.type))}${incident.demo ? " · DEMO" : ""}</div><div class="map-popup-meta">${escapeHtml(incident.location || "Not available")}<br>${escapeHtml(incident.severityLabel || severityLabel(incident.severity))} · ${escapeHtml(incident.time || "Not available")}</div>`;
  }

  function setIncidentSourceLabels(isFirms) {
    $("#high-priority-label").textContent = isFirms ? "HIGH CONFIDENCE" : "HIGH PRIORITY";
    $("#legend-high-label").textContent = isFirms ? "High confidence" : "High priority";
    $("#legend-moderate-label").textContent = isFirms ? "Nominal confidence" : "Moderate";
    $("#legend-low-label").textContent = isFirms ? "Low confidence" : "Low";
  }

  function renderIncidentMarkers(incidents) {
    if (!state.markerLayer) return;
    state.markerLayer.clearLayers();
    state.markers.clear();
    incidents.forEach((incident) => {
      if (!Number.isFinite(incident.latitude) || !Number.isFinite(incident.longitude)) return;
      const marker = L.marker([incident.latitude, incident.longitude], { icon: markerIcon(incident, incident.id === state.selectedIncidentId), title: `${typeLabel(incident.type)}: ${incident.location || "Not available"}` });
      marker.bindPopup(popupHtml(incident), { closeButton: true, maxWidth: 240 });
      marker.on("click", () => selectIncident(incident.id, false));
      marker.on("popupopen", () => selectIncident(incident.id, false));
      state.markerLayer.addLayer(marker);
      state.markers.set(incident.id, marker);
    });
  }

  function updateLocationMarker() {
    if (!state.map) return;
    if (state.locationMarker) state.map.removeLayer(state.locationMarker);
    state.locationMarker = L.marker([state.location.latitude, state.location.longitude], {
      icon: L.divIcon({ className: "", html: '<span class="location-marker" aria-hidden="true"></span>', iconSize: [31, 31], iconAnchor: [15, 15] }),
      title: `Selected location: ${state.location.name}`,
      zIndexOffset: 1000
    }).addTo(state.map);
    state.locationMarker.bindPopup(`<strong>${escapeHtml(state.location.name)}</strong><br><span class="map-popup-meta">Selected monitoring location — not necessarily your current position.</span>`);
  }

  function severityLabel(severity) {
    return ({ high: "High priority", moderate: "Moderate priority", low: "Low priority" })[severity] || "Not available";
  }

  function typeLabel(type) {
    return ({ fire: "Fire detection", weather: "Weather sample", flood: "Flood sample" })[type] || "Incident";
  }

  function calculateDistanceKm(pointA, pointB) {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = toRadians(pointB.latitude - pointA.latitude);
    const longitudeDelta = toRadians(pointB.longitude - pointA.longitude);
    const latitudeA = toRadians(pointA.latitude);
    const latitudeB = toRadians(pointB.latitude);
    // Haversine distance returns the great-circle distance over Earth's surface.
    const rawHaversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
    const haversine = Math.min(1, Math.max(0, rawHaversine));
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  function filterNearbyIncidents(incidents, location, radiusKm) {
    return incidents.map((incident) => ({
      incident,
      distanceKm: calculateDistanceKm(location, { latitude: incident.latitude, longitude: incident.longitude })
    })).filter((entry) => Number.isFinite(entry.distanceKm) && entry.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
  }

  function getVisibleIncidents() {
    return state.incidents.filter((incident) => {
      if (state.mode === "fire" && incident.type !== "fire") return false;
      if (state.mode === "weather" && incident.type !== "weather") return false;
      if (state.typeFilter !== "all" && incident.type !== state.typeFilter) return false;
      if (state.severityFilter !== "all" && incident.severity !== state.severityFilter) return false;
      if (state.nearbyOnly && !state.nearbyIncidents.some((entry) => entry.incident.id === incident.id)) return false;
      return true;
    });
  }

  function updateDashboardStatistics() {
    const incidents = state.visibleIncidents;
    const count = (id, value) => {
      const element = document.getElementById(id);
      if (element.textContent !== String(value)) {
        element.textContent = String(value);
        element.classList.remove("count-change");
        void element.offsetWidth;
        element.classList.add("count-change");
      }
    };
    count("fire-count", incidents.filter((incident) => incident.type === "fire").length);
    count("weather-alert-count", incidents.filter((incident) => incident.type === "weather").length);
    count("high-count", incidents.filter((incident) => incident.severity === "high").length);
    count("nearby-count", state.nearbyIncidents.length);
    $("#metric-radius").textContent = String(state.radiusKm);
    els.nearbyBadge.textContent = String(state.nearbyIncidents.length);
    els.resultCount.textContent = `${incidents.length} ${incidents.length === 1 ? "record" : "records"} shown`;
  }

  function renderIncidentDetails(incident) {
    if (!incident) {
      els.incidentDetail.innerHTML = '<div class="empty-detail"><span class="empty-crosshair">◎</span><strong>Nothing selected</strong><span>Select a map marker or timeline item to inspect its data.</span></div>';
      return;
    }
    const distance = calculateDistanceKm(state.location, incident).toFixed(1);
    const fields = [
      ["Incident ID", incident.id || "Not available"],
      ["Coordinates", `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}`],
      ["Distance", `${distance} km`],
      ["Date / time", `${incident.date || state.date} ${incident.time || "Not available"}`],
      ["Status", incident.status || "Not available"],
      ["Source", incident.source || "Not available"],
      ["Last updated", incident.updated || "Not available"],
      ["Location", incident.location || "Not available"]
    ];
    const fieldsHtml = fields.map(([label, value]) => `<div class="detail-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    let sourceLink = "";
    if (incident.sourceUrl) {
      try {
        const url = new URL(incident.sourceUrl);
        if (url.protocol === "https:") sourceLink = `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>`;
      } catch (error) {
        console.warn("Ignoring an invalid incident source URL.", error);
      }
    }
    els.incidentDetail.innerHTML = `<div class="detail-content">
      <div class="detail-title-row"><strong>${escapeHtml(typeLabel(incident.type))}</strong><span class="priority-pill ${escapeHtml(incident.severity)}">${escapeHtml(incident.severityLabel || severityLabel(incident.severity))}</span>${incident.demo ? '<span class="demo-tag">DEMO</span>' : ""}</div>
      <div class="detail-grid">${fieldsHtml}</div>
      <p class="detail-description">${escapeHtml(incident.description || "Not available")}</p>
      ${sourceLink}<button class="center-button" type="button" data-center-incident="${escapeHtml(incident.id)}">Center map on incident</button>
    </div>`;
  }

  function renderNearbyList() {
    if (!state.nearbyIncidents.length) {
      els.nearbyList.innerHTML = '<p class="empty-list">No incidents within this radius for the selected date.</p>';
      return;
    }
    els.nearbyList.innerHTML = state.nearbyIncidents.slice(0, 8).map(({ incident, distanceKm }) =>
      `<button class="nearby-item" type="button" data-incident-id="${escapeHtml(incident.id)}"><i class="legend-dot ${escapeHtml(incident.severity)}"></i><span><strong>${escapeHtml(typeLabel(incident.type))}${incident.demo ? " · DEMO" : ""}</strong><small>${escapeHtml(incident.location || "Not available")} · ${escapeHtml(incident.severityLabel || severityLabel(incident.severity))}</small></span><span class="distance">${distanceKm.toFixed(1)} km</span></button>`
    ).join("");
  }

  function renderTimeline(incidents) {
    if (!incidents.length) {
      els.timeline.innerHTML = '<p class="empty-list">No records match this date and filter combination.</p>';
      return;
    }
    const sorted = [...incidents].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    els.timeline.innerHTML = sorted.map((incident) => `<button class="timeline-item ${incident.id === state.selectedIncidentId ? "selected" : ""}" type="button" data-incident-id="${escapeHtml(incident.id)}">
      <time>${escapeHtml(incident.time || "Time not available")}</time>
      <strong>${escapeHtml(typeLabel(incident.type))}${incident.demo ? " · DEMO" : ""}</strong>
      <small><i class="legend-dot ${escapeHtml(incident.severity)}"></i>${escapeHtml(incident.location || "Location not available")} · ${escapeHtml(incident.severityLabel || severityLabel(incident.severity))}</small>
    </button>`).join("");
  }

  function renderAll() {
    state.nearbyIncidents = filterNearbyIncidents(state.incidents, state.location, state.radiusKm);
    state.visibleIncidents = getVisibleIncidents();
    if (state.selectedIncidentId && !state.visibleIncidents.some((incident) => incident.id === state.selectedIncidentId)) {
      state.selectedIncidentId = null;
      renderIncidentDetails(null);
    }
    renderIncidentMarkers(state.visibleIncidents);
    renderNearbyList();
    renderTimeline(state.visibleIncidents);
    updateDashboardStatistics();
  }

  function selectIncident(id, centerMap) {
    const incident = state.incidents.find((item) => item.id === id);
    if (!incident) return;
    state.selectedIncidentId = id;
    renderIncidentDetails(incident);
    renderTimeline(state.visibleIncidents);
    const marker = state.markers.get(id);
    if (marker && centerMap) {
      state.map.setView([incident.latitude, incident.longitude], Math.max(state.map.getZoom(), 9), { animate: true });
      marker.openPopup();
    } else if (marker && !marker.isPopupOpen()) {
      marker.openPopup();
    }
    if (marker) {
      marker.setIcon(markerIcon(incident, true));
      state.markers.forEach((other, otherId) => {
        if (otherId !== id) {
          const otherIncident = state.visibleIncidents.find((item) => item.id === otherId);
          if (otherIncident) other.setIcon(markerIcon(otherIncident, false));
        }
      });
    }
  }

  function demoIncidentsForDate(date) {
    if (date !== DEMO_DATE) return [];
    return demoRecords.map((record) => ({ ...record, date, datetime: `${date}T${record.time}:00Z`, latitude: Number(record.latitude), longitude: Number(record.longitude) }));
  }

  function parseFirmsCsv(csv, date) {
    const rows = csv.trim().split(/\r?\n/);
    if (rows.length < 2) return [];
    const headers = rows[0].split(",").map((header) => header.trim().toLowerCase());
    const column = (name) => headers.indexOf(name);
    const latIndex = column("latitude");
    const lonIndex = column("longitude");
    if (latIndex < 0 || lonIndex < 0) throw new Error("FIRMS data response is missing latitude or longitude columns.");
    const value = (cells, name) => cells[column(name)] || "";
    return rows.slice(1).map((row, index) => {
      const cells = row.split(",");
      const latitude = Number(value(cells, "latitude"));
      const longitude = Number(value(cells, "longitude"));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const confidenceRaw = value(cells, "confidence").toLowerCase();
      const severity = confidenceRaw === "h" || Number(confidenceRaw) >= 80 ? "high" : confidenceRaw === "l" || (confidenceRaw !== "" && Number(confidenceRaw) < 40) ? "low" : "moderate";
      const timeRaw = value(cells, "acq_time").padStart(4, "0");
      const time = timeRaw.length === 4 ? `${timeRaw.slice(0, 2)}:${timeRaw.slice(2)}` : "Not available";
      const confidenceLabel = confidenceRaw === "h" ? "high" : confidenceRaw === "n" ? "nominal" : confidenceRaw === "l" ? "low" : value(cells, "confidence") || "Not available";
      return {
        id: `FIRMS-${value(cells, "satellite")}-${date}-${timeRaw}-${index}`,
        type: "fire",
        severity,
        severityLabel: confidenceRaw ? `${confidenceLabel} confidence` : "Confidence not available",
        latitude,
        longitude,
        time,
        date: value(cells, "acq_date") || date,
        location: "Location not available",
        status: "Satellite thermal anomaly; not a confirmed fire",
        description: `NASA FIRMS satellite fire detection. Confidence: ${confidenceLabel}. Satellite observations are not confirmation of a structural fire.`,
        source: "NASA FIRMS",
        sourceUrl: "https://firms.modaps.eosdis.nasa.gov/",
        updated: "Provider timestamp not available",
        demo: false
      };
    }).filter(Boolean);
  }

  async function loadIncidents(date) {
    if (state.loadController) state.loadController.abort();
    state.loadController = new AbortController();
    const signal = state.loadController.signal;
    els.retryButton.hidden = true;
    els.resultCount.textContent = "Loading incidents…";
    $("#timeline").innerHTML = '<p class="empty-list"><span class="spinner"></span> Loading records…</p>';
    const proxyUrl = getFirmsProxyUrl();
    try {
      if (date > formatDateInput(todayDate)) {
        state.incidents = [];
        setIncidentSourceLabels(false);
        showConnectionStatus("FORECAST DATE", "is-demo");
        $("#data-caption").textContent = "Future dates show weather forecast only; fire observation datasets do not provide future detections.";
        $("#map-attribution-note").textContent = "No fire observations are available for future dates.";
        $("#data-updated").textContent = "Incident source: not applicable to future dates";
        renderAll();
        $("#timeline").innerHTML = '<p class="empty-list">Fire and incident observations are not available for a future date.</p>';
        return [];
      }
      if (proxyUrl) {
        proxyUrl.searchParams.set("date", date);
        // The configured same-origin backend keeps the NASA FIRMS MAP_KEY off the client.
        const response = await fetch(proxyUrl, { signal, headers: { Accept: "text/csv" } });
        if (!response.ok) throw new Error(`NASA FIRMS proxy returned HTTP ${response.status}.`);
        const csv = await response.text();
        if (/^\s*</.test(csv)) throw new Error("The FIRMS proxy returned HTML instead of CSV data.");
        state.incidents = parseFirmsCsv(csv, date);
        setIncidentSourceLabels(true);
        $("#data-caption").textContent = `NASA FIRMS satellite observations for ${prettyDate(date)}. Not confirmed structural fires; availability depends on the configured proxy.`;
        showConnectionStatus("NASA FIRMS", "");
        $("#map-attribution-note").textContent = "NASA satellite detections are observational data, not official risk zones.";
        $("#data-updated").textContent = `NASA FIRMS response received ${new Date().toLocaleTimeString()}`;
      } else {
        state.incidents = demoIncidentsForDate(date);
        setIncidentSourceLabels(false);
        showConnectionStatus("DEMO DATA", "is-demo");
        $("#data-caption").textContent = date === DEMO_DATE ? "Historical demo records for interface testing — not live incident reports." : "No incident provider is configured. Demo records are only available for 14 May 2025.";
        $("#map-attribution-note").textContent = "Sample priorities are demo-only and are not official safety zones.";
        $("#data-updated").textContent = "Incident source: labeled demo dataset; no live feed configured";
      }
      renderAll();
      if (!state.incidents.length) {
        els.resultCount.textContent = "No incident records for this date";
        $("#timeline").innerHTML = '<p class="empty-list">No incident records are available for this date. Configure a provider proxy or select the demo date, 14 May 2025.</p>';
      }
      return state.incidents;
    } catch (error) {
      if (error.name === "AbortError") return [];
      console.error("Could not load incident data.", error);
      state.incidents = [];
      showConnectionStatus("DATA ERROR", "is-error");
      $("#data-caption").textContent = "Incident data could not be loaded. The dashboard will not substitute demo records for a failed live source.";
      $("#data-updated").textContent = `Incident provider error: ${error.message}`;
      els.retryButton.hidden = false;
      renderAll();
      $("#timeline").innerHTML = `<p class="empty-list">Could not load incidents: ${escapeHtml(error.message)}. <button class="retry-inline" type="button" data-retry>Retry</button></p>`;
      toast(`Incident data unavailable: ${error.message}`, true);
      return [];
    }
  }

  function weatherEndpoint(date) {
    const weatherDate = new Date(`${date}T12:00:00`);
    const dayDifference = Math.round((weatherDate - todayDate) / 86400000);
    const isForecast = dayDifference >= 0;
    if (isForecast && dayDifference > 15) throw new Error("Weather forecasts are available for up to 16 days. Select an earlier date.");
    const base = isForecast ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
    const url = new URL(base);
    url.search = new URLSearchParams({
      latitude: String(state.location.latitude),
      longitude: String(state.location.longitude),
      start_date: date,
      end_date: date,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
      hourly: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
      timezone: "auto"
    }).toString();
    return { url, isForecast };
  }

  function weatherDescription(code) {
    if (code === 0) return "Clear sky";
    if ([1, 2, 3].includes(code)) return "Partly cloudy";
    if ([45, 48].includes(code)) return "Fog";
    if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
    if ([95, 96, 99].includes(code)) return "Thunderstorm";
    return "Conditions unavailable";
  }

  async function loadWeather(date, location) {
    if (state.weatherController) state.weatherController.abort();
    state.weatherController = new AbortController();
    els.weatherContent.innerHTML = '<div class="weather-loading"><span class="spinner"></span><span>Loading weather…</span></div>';
    els.weatherSourceBadge.textContent = "CONNECTING";
    els.weatherSourceBadge.className = "source-badge";
    try {
      const { url, isForecast } = weatherEndpoint(date);
      url.searchParams.set("latitude", String(location.latitude));
      url.searchParams.set("longitude", String(location.longitude));
      const response = await fetch(url, { signal: state.weatherController.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}.`);
      const result = await response.json();
      if (!result.hourly || !result.hourly.time || !result.hourly.time.length) throw new Error("No weather observations are available for this date and location.");
      const now = new Date();
      const localTime = result.timezone
        ? new Intl.DateTimeFormat("en-GB", { timeZone: result.timezone, hourCycle: "h23", hour: "2-digit" }).format(now)
        : "12";
      const localDateParts = result.timezone
        ? new Intl.DateTimeFormat("en-CA", { timeZone: result.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
        : [];
      const localDate = localDateParts.length
        ? `${localDateParts.find((part) => part.type === "year").value}-${localDateParts.find((part) => part.type === "month").value}-${localDateParts.find((part) => part.type === "day").value}`
        : date;
      const currentHour = isForecast && localDate === date ? `${date}T${localTime}:00` : null;
      const currentHourIndex = currentHour ? result.hourly.time.indexOf(currentHour) : -1;
      const hourIndex = currentHourIndex >= 0 ? currentHourIndex : Math.min(12, result.hourly.time.length - 1);
      state.weather = {
        temperature: result.hourly.temperature_2m && result.hourly.temperature_2m[hourIndex],
        humidity: result.hourly.relative_humidity_2m && result.hourly.relative_humidity_2m[hourIndex],
        precipitation: result.hourly.precipitation && result.hourly.precipitation[hourIndex],
        wind: result.hourly.wind_speed_10m && result.hourly.wind_speed_10m[hourIndex],
        code: result.hourly.weather_code && result.hourly.weather_code[hourIndex],
        max: result.daily && result.daily.temperature_2m_max && result.daily.temperature_2m_max[0],
        min: result.daily && result.daily.temperature_2m_min && result.daily.temperature_2m_min[0],
        dailyPrecip: result.daily && result.daily.precipitation_sum && result.daily.precipitation_sum[0],
        dailyWind: result.daily && result.daily.wind_speed_10m_max && result.daily.wind_speed_10m_max[0],
        timezone: result.timezone
      };
      renderWeather(isForecast);
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Could not load Open-Meteo weather data.", error);
      state.weather = null;
      els.weatherContent.innerHTML = `<div class="weather-error">${escapeHtml(error.message)} <button type="button" data-weather-retry>Retry</button></div>`;
      els.weatherSourceBadge.textContent = "UNAVAILABLE";
      els.weatherSourceBadge.className = "source-badge error";
      els.weatherNote.textContent = "Weather unavailable. No values or warnings have been inferred.";
      if (state.mode === "weather") toast(`Weather unavailable: ${error.message}`, true);
    }
  }

  function displayedValue(value, unit, decimals) {
    return Number.isFinite(value) ? `${Number(value).toFixed(decimals == null ? 0 : decimals)}${unit}` : "Not available";
  }

  function renderWeather(isForecast) {
    if (!state.weather) return;
    const weather = state.weather;
    const description = weatherDescription(weather.code);
    const temp = displayedValue(weather.temperature, "°", 0);
    els.weatherContent.innerHTML = `<div class="weather-main">
      <div><div class="weather-temp">${escapeHtml(temp)}</div><div class="weather-condition">${escapeHtml(description)} · ${escapeHtml(state.location.name)}</div></div>
      <span class="weather-glyph" aria-hidden="true">${[95, 96, 99].includes(weather.code) ? "ϟ" : [61, 63, 65, 80, 81, 82].includes(weather.code) ? "☂" : "◌"}</span>
    </div><div class="weather-stats">
      <div class="weather-stat"><span>Humidity</span><strong>${escapeHtml(displayedValue(weather.humidity, "%"))}</strong></div>
      <div class="weather-stat"><span>Precipitation</span><strong>${escapeHtml(displayedValue(weather.precipitation, " mm", 1))}</strong></div>
      <div class="weather-stat"><span>Wind</span><strong>${escapeHtml(displayedValue(weather.wind, " km/h"))}</strong></div>
    </div>`;
    els.weatherSourceBadge.textContent = isForecast ? "OPEN-METEO · FORECAST" : "OPEN-METEO · HISTORICAL";
    els.weatherSourceBadge.className = "source-badge live";
    els.weatherNote.textContent = `${isForecast ? "Forecast" : "Historical model data"} · ${state.location.name}. Not an official weather alert.`;
  }

  function setSelectedLocation(location) {
    state.location = {
      name: location.name,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      country: location.country || ""
    };
    storeLocation(state.location);
    els.locationName.textContent = state.location.name;
    els.locationSearch.value = "";
    els.suggestions.hidden = true;
    if (state.map) {
      updateLocationMarker();
      state.map.flyTo([state.location.latitude, state.location.longitude], Math.max(state.map.getZoom(), 7), { duration: 0.8 });
    }
    renderAll();
    loadWeather(state.date, state.location);
    toast(`Monitoring location set to ${state.location.name}.`);
  }

  async function searchLocations(query) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({ name: query, count: "5", language: "en", format: "json" }).toString();
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Location search returned HTTP ${response.status}.`);
    const data = await response.json();
    return data.results || [];
  }

  function renderLocationSuggestions(results) {
    if (!results.length) {
      els.suggestions.innerHTML = '<div class="empty-list">No locations found.</div>';
      els.suggestions.hidden = false;
      return;
    }
    els.suggestions.innerHTML = results.map((item, index) => {
      const secondary = [item.admin1, item.country].filter(Boolean).join(", ");
      return `<button class="suggestion-option" type="button" role="option" data-location-index="${index}">${escapeHtml(item.name)}<small>${escapeHtml(secondary)}</small></button>`;
    }).join("");
    els.suggestions.hidden = false;
    els.suggestions._results = results;
  }

  async function handleLocationSearch() {
    const query = els.locationSearch.value.trim();
    if (query.length < 2) {
      els.suggestions.hidden = true;
      return;
    }
    try {
      const results = await searchLocations(query);
      if (els.locationSearch.value.trim() === query) renderLocationSuggestions(results);
    } catch (error) {
      console.error("Location search failed.", error);
      els.suggestions.innerHTML = `<div class="empty-list">Location search unavailable: ${escapeHtml(error.message)}</div>`;
      els.suggestions.hidden = false;
    }
  }

  function requestUserLocation() {
    if (!navigator.geolocation) {
      toast("Location access is not supported by this browser. Search for a place instead.", true);
      return;
    }
    toast("Requesting location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSelectedLocation({
          name: "Your location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          country: ""
        });
        state.location.isUserLocation = true;
        storeLocation(state.location);
      },
      (error) => {
        const messages = {
          1: "Location permission was denied. You can search and select a location manually.",
          2: "Your location could not be determined. Try searching for a city.",
          3: "The location request timed out. Try again or search for a place."
        };
        toast(messages[error.code] || "Could not access location. Search for a place instead.", true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function maxDateForMode() {
    return state.mode === "weather" ? formatDateInput(addDays(todayDate, 15)) : formatDateInput(todayDate);
  }

  function updateDateControls() {
    const maxDate = maxDateForMode();
    els.datePicker.max = maxDate;
    els.datePicker.value = state.date;
    els.dateDisplay.textContent = prettyDate(state.date, { day: "numeric", month: "short", year: "numeric" });
    els.timelineDate.textContent = prettyDate(state.date);
    els.nextDay.disabled = state.date >= maxDate;
  }

  async function handleDateChange(date) {
    if (!date) return;
    if (date > maxDateForMode()) {
      toast(state.mode === "weather" ? "Weather forecast dates are limited to 16 days ahead." : "Incident monitoring only supports dates up to today.", true);
      updateDateControls();
      return;
    }
    state.date = date;
    updateDateControls();
    const heading = document.querySelector(".page-heading");
    heading.classList.remove("date-transition");
    void heading.offsetWidth;
    heading.classList.add("date-transition");
    await Promise.all([loadIncidents(date), loadWeather(date, state.location)]);
  }

  function setMonitoringMode(mode) {
    state.mode = mode;
    const buttons = [
      [els.allMode, "all"],
      [els.fireMode, "fire"],
      [els.weatherMode, "weather"]
    ];
    buttons.forEach(([button, key]) => {
      button.classList.toggle("active", key === mode);
      button.setAttribute("aria-selected", String(key === mode));
      button.dataset.mode = key;
    });
    if (state.map) setTimeout(() => state.map.invalidateSize(), 100);
    updateDateControls();
    renderAll();
    if (state.weather) renderWeather(state.date >= formatDateInput(todayDate));
    if (mode === "fire" && !getFirmsProxyUrl()) {
      toast("Fire monitoring is displaying the labeled demo dataset. Configure a same-origin NASA FIRMS proxy for satellite data.");
    } else if (mode === "weather") {
      toast("Weather mode shows Open-Meteo model data; it does not provide official warnings.");
    }
  }

  function initializeApp() {
    els.locationName.textContent = state.location.name;
    els.radiusSelect.value = String(state.radiusKm);
    updateDateControls();
    try {
      initializeMap();
    } catch (error) {
      console.error("Map initialization failed.", error);
    }
    loadIncidents(state.date);
    loadWeather(state.date, state.location);
    bindEvents();
  }

  function bindEvents() {
    els.previousDay.addEventListener("click", () => handleDateChange(formatDateInput(addDays(new Date(`${state.date}T12:00:00`), -1))));
    els.nextDay.addEventListener("click", () => {
      if (state.date < maxDateForMode()) handleDateChange(formatDateInput(addDays(new Date(`${state.date}T12:00:00`), 1)));
    });
    els.datePicker.addEventListener("change", (event) => handleDateChange(event.target.value));
    [els.allMode, els.fireMode, els.weatherMode].forEach((button) => button.addEventListener("click", () => setMonitoringMode(button.id.replace("-mode", ""))));
    els.typeFilter.addEventListener("change", () => { state.typeFilter = els.typeFilter.value; renderAll(); });
    els.severityFilter.addEventListener("change", () => { state.severityFilter = els.severityFilter.value; renderAll(); });
    els.nearbyOnly.addEventListener("change", () => { state.nearbyOnly = els.nearbyOnly.checked; renderAll(); });
    els.radiusSelect.addEventListener("change", () => {
      state.radiusKm = Number(els.radiusSelect.value);
      renderAll();
    });
    els.retryButton.addEventListener("click", () => loadIncidents(state.date));
    $("#geolocate-button").addEventListener("click", requestUserLocation);
    els.locationSearch.addEventListener("input", () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(handleLocationSearch, 300);
    });
    els.locationSearch.addEventListener("keydown", (event) => {
      if (event.key === "Escape") els.suggestions.hidden = true;
      if (event.key === "Enter") {
        event.preventDefault();
        const first = els.suggestions.querySelector("[data-location-index]");
        if (first) first.click();
        else handleLocationSearch();
      }
    });
    els.suggestions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-location-index]");
      if (!button) return;
      const result = els.suggestions._results && els.suggestions._results[Number(button.dataset.locationIndex)];
      if (!result) return;
      setSelectedLocation({
        name: [result.name, result.country].filter(Boolean).join(", "),
        latitude: result.latitude,
        longitude: result.longitude,
        country: result.country
      });
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".location-control")) els.suggestions.hidden = true;
      if (!event.target.closest(".profile-wrap")) {
        els.profileMenu.hidden = true;
        els.profileButton.setAttribute("aria-expanded", "false");
      }
      const incidentButton = event.target.closest("[data-incident-id]");
      if (incidentButton) selectIncident(incidentButton.dataset.incidentId, true);
      const centerButton = event.target.closest("[data-center-incident]");
      if (centerButton) selectIncident(centerButton.dataset.centerIncident, true);
      if (event.target.closest("[data-retry]")) loadIncidents(state.date);
      if (event.target.closest("[data-weather-retry]")) loadWeather(state.date, state.location);
    });
    els.profileButton.addEventListener("click", () => {
      const opening = els.profileMenu.hidden;
      els.profileMenu.hidden = !opening;
      els.profileButton.setAttribute("aria-expanded", String(opening));
    });
    $("#close-detail").addEventListener("click", () => {
      state.selectedIncidentId = null;
      if (state.markerLayer) state.markerLayer.closePopup();
      renderIncidentDetails(null);
      renderTimeline(state.visibleIncidents);
      state.markers.forEach((marker, id) => {
        const incident = state.visibleIncidents.find((item) => item.id === id);
        if (incident) marker.setIcon(markerIcon(incident, false));
      });
    });
  }

  initializeApp();
})();
