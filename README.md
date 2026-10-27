# City Pulse

City Pulse is a static, responsive disaster-intelligence dashboard prototype. It uses Leaflet with OpenStreetMap tiles, a clearly labeled historical demo dataset, Open-Meteo weather/geocoding services, and an optional server-side proxy for NASA FIRMS satellite observations.

## Run locally

Serve this folder over HTTP rather than opening `index.html` directly, since browser geolocation and API requests require a local web origin. For example, with Python installed:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`. The map tiles, weather, and place search require internet access.

## Data sources and configuration

- **Incident data:** The default is a fixed, labeled demo dataset for 14 May 2025. These records are fictional and never presented as live reports. Other dates show an explicit no-provider state.
- **Weather:** Open-Meteo's public forecast and historical archive endpoints provide modelled temperature, humidity, precipitation, wind, and weather codes. The forecast supports dates up to 16 days ahead; historical coverage and availability depend on the requested date and model. The public free API is for non-commercial use, subject to its published request limits and CC-BY 4.0 attribution terms. The dashboard links to Open-Meteo in the weather panel and does not claim that these are official warnings. Check the provider's current terms before deployment.
- **Location search:** Open-Meteo geocoding is used for city/place search; no API key is needed.
- **Map:** Leaflet 1.9.4 and MarkerCluster 1.5.3 are loaded from their public CDNs. OpenStreetMap tiles are styled with a CSS dark filter and attributed on the map.
- **NASA FIRMS:** Fire observations can be enabled by setting `window.CITY_PULSE_CONFIG.firmsProxyUrl` to a same-origin backend endpoint before `script.js` loads. For example, add this before the script include:

  ```html
  <script>
    window.CITY_PULSE_CONFIG = { firmsProxyUrl: "/api/firms" };
  </script>
  ```

  The backend should accept a `date=YYYY-MM-DD` query parameter and return the NASA FIRMS Area API CSV response for that date. The adapter expects the API's standard CSV header with `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`, and `confidence` fields. FIRMS requires a free MAP_KEY; keep it on the server and never put it in browser code or local storage. The Area API supports one-to-five-day requests and product-specific historical/NRT availability. A backend proxy is not included in this static frontend. NASA FIRMS satellite detections are not confirmation of structural fires.

An unconfigured or failed live incident provider never falls back to demo data. Incident severity labels in the demo are illustrative only; NASA detections are labeled by the provider's confidence field, not by an official danger classification.

## Backend integration

Implement an authenticated, rate-limited same-origin route such as `/api/firms` that validates dates, calls the documented NASA FIRMS Area API with a server-side MAP_KEY, and forwards CSV and provider errors without inventing records. Configure official weather-alert sources separately if authoritative alerts are needed; Open-Meteo model fields are not an alert feed.
