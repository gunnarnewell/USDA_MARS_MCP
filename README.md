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

Environment variables take precedence. Supported environment variables are:

- `MARS_API_KEY`
- `MARS_BASE_URL`
- `MARS_TIMEOUT_MS`
- `MARS_MAX_RETRIES`
- `MARS_RETRY_BASE_DELAY_MS`
- `MARS_CONCURRENCY`
- `MARS_CACHE_ENABLED`
- `MARS_CACHE_TTL_MS`
- `LOG_LEVEL`

Numeric MARS settings are validated at startup and must be integers in range; invalid values fail fast with a clear error. Discovery endpoint caching is enabled by default with a 15-minute TTL; set `MARS_CACHE_ENABLED=false` to disable it or `MARS_CACHE_TTL_MS` to adjust the TTL.

## Install, build, and test

Bash/macOS/Linux:

```bash
npm install
npm run build
npm test
```

Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
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

The server serves MCP traffic only at `http://localhost:3333/mcp` and exposes a process health check at `http://localhost:3333/healthz` that does not call USDA. Unknown paths return `404`.

HTTP mode writes structured JSON logs for startup, shutdown, auth warnings, and request lifecycle events including method, path, status code, and duration. It does not log MCP arguments or authorization headers.

For internet-exposed deployments, set `MCP_AUTH_TOKEN` so `/mcp` requires `Authorization: Bearer <token>`. If `MCP_AUTH_TOKEN` is not set, HTTP mode starts unauthenticated and logs a warning.

## Connect ChatGPT to a local MCP server

1. Start the MCP server locally (HTTP mode):
   ```bash
   export MARS_API_KEY="your_api_key"
   npm install
   npm run build
   PORT=3333 npm run start:http
   ```
2. In ChatGPT, open **Settings → Connectors → MCP Servers** (or **Settings → Developer → MCP Servers**).
3. Add a new MCP server with:
   - **Name**: USDA MARS MCP (or any label)
   - **Server URL**: `http://localhost:3333/mcp`
4. Save, then start a new chat and enable the server when prompted.

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

### `mars_get_report_data`
Calls `GET /reports/{slug}/report details` with optional `q`, `sort`, `allSections`, and `lastReports`. This is the preferred tool for report rows from the details endpoint. Tool callers can also request normalized rows with `normalize`, `includeRaw`, and `maxRows`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG/report%20details?lastReports=3&sort=-report_date"
```

### `mars_get_report_section`
Calls `GET /reports/{slug}/{section}` with optional `q`, `sort`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG/SECTION_NAME"
```

### `mars_get_report_columns`
Calls `GET /reports/{slug}/columns`. Use this before writing report-specific `q` or `sort` expressions for unfamiliar reports.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG/columns"
```

### `mars_get_report_details`
Calls `GET /reports/{slug}/Details` with optional `correctionsOnly`, `anyChangesSince`, `lastDays`. Use `YYYY/MM/DD` for `anyChangesSince`.

```bash
curl -u "${MARS_API_KEY}:" \
  "https://marsapi.ams.usda.gov/services/v1.2/reports/REPORT_SLUG/Details?correctionsOnly=true&anyChangesSince=2024/01/01&lastDays=50"
```

### `mars_get_report_info`
Fetches the MyMarketNews report page at `https://mymarketnews.ams.usda.gov/viewReport/{slug}` and extracts the title, meta description, discovered MARS API URLs, and readable page text. Use this with `mars_get_report_columns` before querying unfamiliar report data.

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

## Skill authoring

Report-specific Codex or ChatGPT skills should use the generic MCP tools rather than adding one custom tool per USDA report. See [`docs/SKILL_AUTHORING.md`](docs/SKILL_AUTHORING.md) for the recommended discovery workflow, example MCP calls, error-handling guidance, and a reusable report-skill template.

## Docker (HTTP mode)

```bash
docker compose up --build
```

The container exposes port 3333, serves the MCP HTTP endpoint at `/mcp`, and serves process health at `/healthz`. Provide `MARS_API_KEY`; set `MCP_AUTH_TOKEN` when the endpoint is reachable by anything other than your local machine.

## Railway deployment

Railway HTTP deployments should configure:

- `MARS_API_KEY` (required)
- `PORT` (required by this server; Railway typically provides it)
- `MCP_AUTH_TOKEN` (strongly recommended for any public URL)
- Optional tuning vars such as `LOG_LEVEL` when needed

Use `/healthz` for a lightweight health check and connect MCP clients to `/mcp`.
