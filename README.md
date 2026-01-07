# USDA AMS MARS MCP Server

Self-hostable MCP server for the USDA AMS MARS (MyMarketNews) API. Supports STDIO and streamable HTTP modes.

## Get an API key
Request an API key from USDA AMS MARS (MyMarketNews) and keep it private.

## Configuration

Preferred: set the environment variable.

```bash
export MARS_API_KEY="your_api_key"
```

Or use `~/.mars-mcp/config.json`:

```json
{
  "apiKey": "your_api_key"
}
```

Environment variables take precedence.

## Install & build

```bash
npm install
npm run build
```

## Run (STDIO)

```bash
npm run start
```

STDIO mode logs only to stderr.

## Run (HTTP)

```bash
PORT=3333 npm run start:http
```

The server listens at `http://localhost:3333/mcp`.

## MCP tools

### `mars_healthcheck`
Calls `GET /reports`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports"
```

### `mars_list_reports`
Calls `GET /reports`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports"
```

### `mars_get_report`
Calls `GET /reports/{slug}` with optional `q`, `sort`, `allSections`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG?q=commodity=Feeder%20Cattle&sort=-report_date&allSections=true"
```

### `mars_get_report_section`
Calls `GET /reports/{slug}/{section}` with optional `q`, `sort`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG/SECTION_NAME"
```

### `mars_get_report_details`
Calls `GET /reports/{slug}/Details` with optional `correctionsOnly`, `anyChangesSince`, `lastDays`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG/Details?correctionsOnly=true&anyChangesSince=2024/01/01&lastDays=50"
```

### `mars_list_offices`
Calls `GET /offices`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/offices"
```

### `mars_list_market_types`
Calls `GET /marketTypes`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/marketTypes"
```

### `mars_list_commodities`
Calls `GET /commodities`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/commodities"
```

## Docker (HTTP mode)

```bash
docker compose up --build
```

The container exposes port 3333 and serves the MCP HTTP endpoint at `/mcp`.
