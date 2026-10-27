# City Pulse

City Pulse is a static, responsive disaster-intelligence dashboard prototype with a Windy-inspired neutral map interface, warm accents, and compact controls. It uses Leaflet with OpenStreetMap tiles, a clearly labeled historical demo dataset, Open-Meteo weather/geocoding services, and an optional server-side proxy for NASA FIRMS satellite observations.

## Run locally

Run the backend from this folder. It serves the dashboard and the same-origin API:

```powershell
npm start
```

Open `http://127.0.0.1:8000`. Node.js 18 or newer is required. No package installation is needed.

## Data sources and configuration

- **Incident data:** The dashboard opens on today's date. A fixed, labeled demo dataset is available for 14 May 2025; these records are fictional and never presented as live reports. Other dates show an explicit no-provider state. Select a location to reveal its coordinate summary and nearby-incident panel.
- **Weather:** Open-Meteo's public forecast and historical archive endpoints provide modelled temperature, humidity, precipitation, wind, and weather codes. The forecast supports dates up to 16 days ahead; historical coverage and availability depend on the requested date and model. The public free API is for non-commercial use, subject to its published request limits and CC-BY 4.0 attribution terms. The dashboard links to Open-Meteo in the weather panel and does not claim that these are official warnings. Check the provider's current terms before deployment.
- **Location search:** Open-Meteo geocoding is used for city/place search; no API key is needed.
- **Map:** Leaflet 1.9.4 and MarkerCluster 1.5.3 are loaded from their public CDNs. OpenStreetMap tiles are styled with a CSS dark filter and attributed on the map.
- **NASA FIRMS:** The backend exposes `GET /api/firms?date=YYYY-MM-DD` and requests one day of VIIRS Suomi-NPP standard-processing observations from the NASA FIRMS Area API. Set the server environment variable `FIRMS_MAP_KEY` before starting the backend. The key is never sent to or stored in browser code. For example, configure the frontend to use the same-origin route before `script.js` loads:

  ```html
  <script>
    window.CITY_PULSE_CONFIG = { firmsProxyUrl: "/api/firms" };
  </script>
  ```

  The backend validates the date and forwards valid CSV and provider error statuses. An absent key produces a configuration error; provider failures never create substitute records. The frontend adapter expects the CSV columns `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`, and `confidence`. NASA FIRMS requires a free MAP_KEY; keep it on the server and never put it in browser code or local storage. Satellite detections are not confirmation of structural fires.

An unconfigured or failed live incident provider never falls back to demo data. Incident severity labels in the demo are illustrative only; NASA detections are labeled by the provider's confidence field, not by an official danger classification.

## Backend and future data sources

The backend uses a small route registry so additional provider routes (for example `/api/weather` or `/api/alerts`) can be added independently. They are not implemented yet. Configure official weather-alert sources separately if authoritative alerts are needed; Open-Meteo model fields are not an alert feed.

This first backend milestone is for local development: it has no authentication or rate limiting and listens on loopback by default. Do not expose it publicly until those protections are added.

Run the automated backend tests with:

```powershell
npm test
```
