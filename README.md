# USDA MARS MCP

A TypeScript Model Context Protocol (MCP) server that proxies NASA MARS requests with retries, timeouts, structured errors, and configurable concurrency.

## Features

- **Transports**: STDIO (`src/index-stdio.ts`) and HTTP (`src/index-http.ts`).
- **Tools**: `mars.get` for MARS API access, `mars.health` for readiness.
- **Authentication**: Bearer token via `MARS_API_KEY`.
- **Resilience**: retries with exponential backoff + jitter and request timeouts.
- **Concurrency limits**: in-flight requests capped by `MARS_CONCURRENCY`.
- **Structured errors**: `MarsError` captures status, code, and details.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `MARS_BASE_URL` | Base URL for the MARS API | `https://api.nasa.gov/mars-photos/api/v1/` |
| `MARS_API_KEY` | API key for authentication | `undefined` |
| `MARS_TIMEOUT_MS` | Timeout per request | `15000` |
| `MARS_MAX_RETRIES` | Retries for retryable errors | `2` |
| `MARS_RETRY_BASE_DELAY_MS` | Base backoff delay | `250` |
| `MARS_CONCURRENCY` | Max concurrent requests | `4` |

## Development

```bash
npm install
npm run build
```

## STDIO mode

STDIO mode logs only to stderr.

```bash
node dist/index-stdio.js
```

Send JSON-RPC requests over stdin, for example:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

## HTTP mode

```bash
node dist/index-http.js
```

POST JSON-RPC requests to `/rpc`:

```bash
curl -X POST http://localhost:3000/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Docker

```bash
docker compose up --build
```
