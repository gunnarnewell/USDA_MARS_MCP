# USDA MARS MCP Production Readiness Plan

## Summary

Bring this MCP server up to date and make it reliable enough for local/internal use plus a single-user Railway deployment exposed over the internet. The improved server should remain generic and reusable, so future Codex/ChatGPT skills can pull data from specific USDA AMS MARS reports by using shared report-discovery, filtering, and data-fetching tools rather than requiring a custom MCP tool for every report.

Chosen defaults:

- Deployment target: local/internal first, with practical hardening for a personally hosted Railway endpoint.
- Skill integration shape: generic MCP tools plus skill guides for specific reports.
- Data contract: preserve raw MARS responses and add optional normalized rows/metadata for skill-friendly use.

Current repo facts:

- Runtime: Node 20 TypeScript ESM.
- Entry points: `src/index-stdio.ts` and `src/index-http.ts`.
- Core client: `src/mars/client.ts`.
- Tool registration: `src/mcp/tools.ts`.
- Utilities: config loading, retry, semaphore, logger, URL builders.
- Existing tools include documented tools plus undocumented `mars_get_report_data`, `mars_get_report_columns`, and `mars_get_report_info`.
- Current tests cover URL encoding and partial retry behavior, but not MCP tool schemas, HTTP behavior, report normalization, auth, or skill workflows.

## Key Improvements

### 1. Upgrade Dependencies And MCP Transport Usage

- Update `@modelcontextprotocol/sdk`, `typescript`, `vitest`, `undici`, and `zod` to current stable versions compatible with Node 20 or Node 22.
- Confirm whether current `Server` and `StreamableHTTPServerTransport` APIs changed in the latest MCP SDK; adapt imports and request handling to current SDK recommendations.
- Keep both stdio and HTTP modes.
- Add a single shared server factory so stdio and HTTP entry points cannot drift in server metadata, tool registration, and config behavior.
- Add a `prepare` or documented `npm install` flow only if needed; do not require global `tsc` or global `vitest`.
- Fix README encoding issue around the ChatGPT settings arrow.

### 2. Configuration And Deployment Hardening

- Make config loading consistent across stdio and HTTP:
  - `MARS_API_KEY` remains the primary API key source.
  - `~/.mars-mcp/config.json` remains supported for local stdio.
  - Optional env vars should include `MARS_BASE_URL`, `MARS_TIMEOUT_MS`, `MARS_MAX_RETRIES`, `MARS_RETRY_BASE_DELAY_MS`, `MARS_CONCURRENCY`, `PORT`, `LOG_LEVEL`.
- Add optional HTTP bearer-token protection:
  - Env var: `MCP_AUTH_TOKEN`.
  - If set, HTTP requests must include `Authorization: Bearer <token>`.
  - If not set, HTTP mode logs a warning that the endpoint is unauthenticated.
  - Do not apply this auth to stdio mode.
- Make HTTP path handling explicit:
  - Only serve MCP traffic on `/mcp`.
  - Add `GET /healthz` returning a small JSON status without calling USDA.
  - Return `404` for unknown paths.
- Add graceful shutdown for HTTP mode on `SIGINT` and `SIGTERM`.
- Keep Docker and Railway simple:
  - Docker image builds from package lock if present.
  - Railway deployment requires `MARS_API_KEY`, `PORT`, and strongly recommends `MCP_AUTH_TOKEN`.

### 3. MARS Client Reliability

- Use one request implementation path. Prefer `fetch` injection for testability unless latest SDK/runtime guidance strongly favors `undici.request`.
- Ensure all MARS API calls use the same timeout, retry, concurrency, auth, and error-normalization behavior.
- Retry transient failures:
  - HTTP `429`, `500`, `502`, `503`, `504`.
  - Network timeout and connection reset style errors.
  - Use exponential backoff with jitter.
- Do not retry deterministic client errors such as `400`, `401`, and `404`.
- Add structured `MarsError` payloads with:
  - `error_code`
  - `message`
  - `http_status`
  - `details`
  - `url` or sanitized path/query when useful
- Never log the USDA API key or MCP auth token.
- Validate config numeric values at startup and fail fast with clear messages.
- Consider a small in-memory TTL cache for low-change discovery endpoints:
  - `/reports`
  - `/offices`
  - `/marketTypes`
  - `/commodities`
  - report columns/info
  - Default TTL: 15 minutes.
  - Include a config flag to disable cache if needed.

### 4. Tool Interface Cleanup

- Keep existing generic tools for backward compatibility:
  - `mars_healthcheck`
  - `mars_list_reports`
  - `mars_get_report`
  - `mars_get_report_data`
  - `mars_get_report_section`
  - `mars_get_report_columns`
  - `mars_get_report_details`
  - `mars_get_report_info`
  - `mars_list_offices`
  - `mars_list_market_types`
  - `mars_list_commodities`
- Update README so all actual tools are documented.
- Improve tool descriptions so an LLM can choose correctly:
  - Use `mars_list_reports` to find report slugs.
  - Use `mars_get_report_info` and `mars_get_report_columns` before querying unfamiliar report data.
  - Use `mars_get_report_data` for rows from the report details endpoint.
  - Use `mars_get_report_details` for metadata/corrections/change checks.
- Tighten schemas:
  - Add descriptions to JSON schemas.
  - Add safe bounds for `lastReports` and `lastDays`.
  - Validate `anyChangesSince` format if USDA requires a specific format; document the accepted format.
  - Keep `q` and `sort` as strings because MARS query syntax is report-specific.
- Standardize successful tool output envelope:
  - `ok: true`
  - `slug` when applicable
  - `data`
  - `metadata` where useful
  - `raw` when normalization is requested
- Standardize error output envelope:
  - `ok: false`
  - `error_code`
  - `message`
  - `http_status`
  - `details`

### 5. Normalized Report Data For Skills

- Add optional normalization to `mars_get_report_data` without removing raw data.
- Proposed input additions:
  - `normalize?: boolean`
  - `includeRaw?: boolean`
  - `maxRows?: number`
- Default behavior:
  - Keep current raw behavior unless the caller asks for `normalize: true`.
  - If `normalize: true`, return normalized rows and include raw data by default unless `includeRaw: false`.
- Normalized output should include:
  - `rows`: array of row objects with stable keys.
  - `columns`: discovered or inferred column names.
  - `row_count`.
  - `source`: endpoint path, slug, query, sort, and retrieval timestamp.
  - `raw` if included.
- Normalization must be conservative:
  - Preserve original values.
  - Do not coerce units, dates, or prices unless the shape is clearly typed by MARS.
  - Do not silently drop fields.
  - If the API shape is not recognized, return `normalization_status: "unsupported_shape"` with raw data.
- Add helper functions in a dedicated module rather than embedding transformation logic inside tool handlers.

### 6. Skill-Ready Documentation

- Create a report-skill authoring guide in the repo, for example `docs/SKILL_AUTHORING.md`.
- The guide should explain the recommended report workflow:
  1. `mars_list_reports` to locate candidate slugs.
  2. `mars_get_report_info` to understand a report.
  3. `mars_get_report_columns` to inspect available fields.
  4. `mars_get_report_data` with `q`, `sort`, and `lastReports`.
  5. Use normalized rows when the skill needs stable tabular data.
- Include examples for report-specific skills:
  - How to pin a known slug.
  - How to document known filters.
  - How to ask for date/commodity/location input.
  - How to handle missing rows and USDA errors.
- Add at least one example skill spec or pseudo-skill document for a specific report, but do not hard-code report-specific tools unless a later phase identifies stable high-value reports.

### 7. Observability And Operations

- Replace plain string logs with simple structured JSON logs for HTTP mode.
- Include request lifecycle logs:
  - request received
  - tool name
  - duration
  - status/error code
  - retry count if available
- Avoid logging full arguments when they may contain sensitive data.
- Add startup logs for:
  - server version
  - mode
  - port
  - cache enabled/disabled
  - auth enabled/disabled
- Add health checks:
  - `/healthz` process-level health.
  - `mars_healthcheck` USDA API reachability.

## Implementation Order

### Phase 1: Baseline And Dependency Refresh

- Install dependencies and commit or update lockfile if the project uses one.
- Upgrade dependencies and fix TypeScript build breaks.
- Refactor server creation into a shared factory.
- Ensure `npm.cmd run build` and `npm.cmd test` work on Windows PowerShell environments.
- Update README for install/build/test commands and all current tools.

Acceptance criteria:

- `npm run build` passes.
- `npm test` passes.
- Both stdio and HTTP entry points compile.
- README accurately lists every MCP tool in `src/mcp/tools.ts`.

### Phase 2: HTTP Production Hardening

- Add HTTP path routing for `/mcp` and `/healthz`.
- Add optional `MCP_AUTH_TOKEN` bearer auth for `/mcp`.
- Add startup validation for `PORT` and MARS config.
- Add graceful shutdown.
- Update Docker/Railway docs.

Acceptance criteria:

- `/healthz` works without USDA API access.
- `/mcp` rejects unauthorized requests when `MCP_AUTH_TOKEN` is set.
- `/mcp` remains usable without bearer auth when `MCP_AUTH_TOKEN` is unset, with a startup warning.
- Unknown paths return `404`.

### Phase 3: Client Reliability And Testability

- Consolidate `getJson` and `request` into one implementation path or make one delegate to the other.
- Preserve injectable fetch/request behavior for tests.
- Add retry coverage for transient HTTP and network failures.
- Add config validation and sanitized errors.
- Add optional TTL cache for discovery endpoints.

Acceptance criteria:

- Retry behavior is covered for `429`, `500`, timeout/network failure, and no-retry `400`.
- API-key and auth-token values never appear in logs or errors.
- Discovery endpoint cache can be enabled, disabled, and tested deterministically.

### Phase 4: Tool Schema And Output Contract

- Add schema descriptions and bounds.
- Standardize success/error envelopes.
- Add normalized report-data options to `mars_get_report_data`.
- Implement conservative normalization helper.
- Keep backward compatibility where practical by preserving existing `data` fields.

Acceptance criteria:

- Existing tool names still work.
- Invalid inputs return clear MCP tool errors.
- `mars_get_report_data` can return raw-only, normalized-plus-raw, and normalized-without-raw responses.
- Unsupported raw response shapes are handled explicitly rather than crashing.

### Phase 5: Skill Authoring Assets

- Add `docs/SKILL_AUTHORING.md`.
- Add one example report-specific skill guide or template.
- Include examples showing exact MCP calls and expected response handling.
- Update README to point skill authors to the guide.

Acceptance criteria:

- A new agent can create a report-specific skill from the guide without reading source code.
- The guide explains how to discover slugs, columns, filters, and normalized rows.

## Test Plan

Add or expand tests in these areas:

- URL/query builder:
  - preserves MARS parameter casing.
  - encodes `q`, `sort`, `lastReports`, `lastDays`, `correctionsOnly`, `allSections`.
- Config:
  - env precedence over file config.
  - invalid numeric env vars fail fast.
  - defaults are applied correctly.
- Client:
  - auth header is set.
  - retryable statuses retry.
  - non-retryable statuses do not retry.
  - network timeout is normalized.
  - concurrency limiter prevents excess simultaneous calls.
  - cache hit/miss behavior.
- MCP tools:
  - `list_tools` exposes all expected tool names and schemas.
  - each tool validates required inputs.
  - each tool returns standardized success/error envelopes.
  - undocumented current tools are covered.
- HTTP server:
  - `/healthz`.
  - `/mcp` bearer auth.
  - unknown route.
  - startup validation.
- Normalization:
  - known table-like response becomes normalized rows.
  - unknown shape returns unsupported status with raw preserved.
  - row limiting works.

## Assumptions

- This server remains private/internal, but may be reachable over the public internet through Railway.
- A single shared `MARS_API_KEY` is acceptable for the deployment.
- Per-user OAuth or multi-tenant API-key isolation is out of scope for this plan.
- Skills should usually encode report-specific knowledge outside the MCP server, using generic MCP tools as the data access layer.
- Report-specific MCP tools may be added later only after the target reports and stable normalized schemas are known.
- Raw USDA MARS response shapes may vary by report, so normalization must be opt-in and conservative.
