import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { type Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./util/config.js";
import { createJsonLogger, type Logger } from "./util/logger.js";
import { createMarsMcpServer, SERVER_NAME, SERVER_VERSION } from "./mcp/server.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";
const logger = createJsonLogger({ name: "http" });

interface HttpTransport {
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> | void;
  close?(): Promise<void> | void;
}

export function parsePort(portValue: string | undefined): number {
  const trimmed = portValue?.trim();
  if (!trimmed) {
    throw new Error("Missing PORT environment variable.");
  }

  const port = Number(trimmed);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${trimmed}. PORT must be an integer from 1 to 65535.`);
  }

  return port;
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function hasBearerToken(req: IncomingMessage, authToken: string): boolean {
  return req.headers.authorization === `Bearer ${authToken}`;
}

export function createHttpRequestHandler(options: {
  transport: HttpTransport;
  authToken?: string;
  logger?: Logger;
  now?: () => number;
}) {
  const requestLogger = options.logger ?? logger;
  const now = options.now ?? Date.now;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const requestId = randomUUID();
    const startedAt = now();

    requestLogger.info("http_request_received", {
      request_id: requestId,
      method: req.method,
      path: url.pathname
    });

    res.once("finish", () => {
      requestLogger.info("http_request_completed", {
        request_id: requestId,
        method: req.method,
        path: url.pathname,
        status_code: res.statusCode,
        duration_ms: now() - startedAt
      });
    });

    if (req.method === "GET" && url.pathname === HEALTH_PATH) {
      writeJson(res, 200, {
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION
      });
      return;
    }

    if (url.pathname !== MCP_PATH) {
      writeJson(res, 404, {
        ok: false,
        error_code: "not_found",
        message: "Not found"
      });
      return;
    }

    if (options.authToken && !hasBearerToken(req, options.authToken)) {
      writeJson(
        res,
        401,
        {
          ok: false,
          error_code: "unauthorized",
          message: "Missing or invalid bearer token"
        },
        { "www-authenticate": "Bearer" }
      );
      return;
    }

    try {
      await options.transport.handleRequest(req, res);
    } catch (error) {
      requestLogger.error("http_mcp_request_failed", {
        request_id: requestId,
        error_code: "internal_error",
        error_message: error instanceof Error ? error.message : String(error)
      });
      if (!res.headersSent) {
        writeJson(res, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  };
}

function registerGracefulShutdown(options: {
  httpServer: ReturnType<typeof createServer>;
  mcpServer: Server;
}): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("http_server_shutdown_started", { signal });

    await new Promise<void>((resolve) => {
      options.httpServer.close((error) => {
        if (error) {
          logger.error("http_server_close_failed", { error_message: error.message });
        }
        resolve();
      });
    });

    await options.mcpServer.close();
    logger.info("http_server_shutdown_completed");
    process.exit(0);
  };

  process.on("SIGINT", (signal) => void shutdown(signal));
  process.on("SIGTERM", (signal) => void shutdown(signal));
}

export async function main(): Promise<void> {
  const config = await loadConfig({ useFile: false });
  if (!config) {
    logger.error("http_startup_missing_mars_api_key", { error_code: "missing_mars_api_key" });
    process.exit(1);
  }

  let port: number;
  try {
    port = parsePort(process.env.PORT);
  } catch (error) {
    logger.error("http_startup_invalid_port", {
      error_message: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }

  const authToken = process.env.MCP_AUTH_TOKEN?.trim();
  if (!authToken) {
    logger.warn("http_auth_disabled", {
      mode: "http",
      auth_enabled: false
    });
  }

  const mcpServer = createMarsMcpServer(config);
  const transport = new StreamableHTTPServerTransport();
  await mcpServer.connect(transport);

  const httpServer = createServer(
    createHttpRequestHandler({
      transport,
      authToken
    })
  );

  registerGracefulShutdown({ httpServer, mcpServer });

  httpServer.listen(port, () => {
    logger.info("http_server_started", {
      server_name: SERVER_NAME,
      server_version: SERVER_VERSION,
      mode: "http",
      port,
      mcp_path: MCP_PATH,
      health_path: HEALTH_PATH,
      cache_enabled: config.cacheEnabled ?? true,
      auth_enabled: Boolean(authToken)
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logger.error("http_server_fatal", {
      error_message: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}
