import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpRequestHandler, parsePort } from "../src/index-http.js";
import { type Logger, type LogFields } from "../src/util/logger.js";

async function startTestServer(options: { authToken?: string; logger?: Logger; now?: () => number } = {}) {
  let mcpCalls = 0;
  const transport = {
    async handleRequest(_req: unknown, res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void }) {
      mcpCalls += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, handled: true }));
    }
  };

  const server = createServer(createHttpRequestHandler({
    transport,
    authToken: options.authToken,
    logger: options.logger ?? createCapturingLogger().logger,
    now: options.now
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server to listen on a TCP port");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    get mcpCalls() {
      return mcpCalls;
    }
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function createCapturingLogger() {
  const entries: Array<{ level: string; message: string; fields?: LogFields }> = [];
  const logger: Logger = {
    debug(message, fields) {
      entries.push({ level: "debug", message, fields });
    },
    info(message, fields) {
      entries.push({ level: "info", message, fields });
    },
    warn(message, fields) {
      entries.push({ level: "warn", message, fields });
    },
    error(message, fields) {
      entries.push({ level: "error", message, fields });
    }
  };

  return { logger, entries };
}

describe("HTTP server routing", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  });

  it("serves /healthz without invoking the MCP transport", async () => {
    const testServer = await startTestServer();
    servers.push(testServer.server);

    const response = await fetch(`${testServer.baseUrl}/healthz`);
    const body = await response.json() as { ok: boolean; name: string; version: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, name: "mars-mcp-server", version: "0.1.0" });
    expect(testServer.mcpCalls).toBe(0);
  });

  it("returns 404 for unknown paths", async () => {
    const testServer = await startTestServer();
    servers.push(testServer.server);

    const response = await fetch(`${testServer.baseUrl}/unknown`);
    const body = await response.json() as { ok: boolean; error_code: string };

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ ok: false, error_code: "not_found" });
    expect(testServer.mcpCalls).toBe(0);
  });

  it("rejects /mcp requests without the configured bearer token", async () => {
    const testServer = await startTestServer({ authToken: "secret-token" });
    servers.push(testServer.server);

    const response = await fetch(`${testServer.baseUrl}/mcp`, { method: "POST" });
    const body = await response.json() as { ok: boolean; error_code: string };

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(body).toMatchObject({ ok: false, error_code: "unauthorized" });
    expect(testServer.mcpCalls).toBe(0);
  });


  it("logs HTTP request lifecycle without request arguments", async () => {
    const captured = createCapturingLogger();
    let currentTime = 1000;
    const testServer = await startTestServer({
      logger: captured.logger,
      now: () => {
        const value = currentTime;
        currentTime += 42;
        return value;
      }
    });
    servers.push(testServer.server);

    const response = await fetch(`${testServer.baseUrl}/healthz`);
    await response.text();

    expect(captured.entries).toHaveLength(2);
    expect(captured.entries[0]).toMatchObject({
      level: "info",
      message: "http_request_received",
      fields: { method: "GET", path: "/healthz" }
    });
    expect(captured.entries[1]).toMatchObject({
      level: "info",
      message: "http_request_completed",
      fields: {
        method: "GET",
        path: "/healthz",
        status_code: 200,
        duration_ms: 42
      }
    });
    expect(captured.entries[0]?.fields).not.toHaveProperty("arguments");
    expect(captured.entries[1]?.fields).not.toHaveProperty("authorization");
  });

  it("allows /mcp requests with the configured bearer token", async () => {
    const testServer = await startTestServer({ authToken: "secret-token" });
    servers.push(testServer.server);

    const response = await fetch(`${testServer.baseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer secret-token" }
    });
    const body = await response.json() as { ok: boolean; handled: boolean };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, handled: true });
    expect(testServer.mcpCalls).toBe(1);
  });
});

describe("parsePort", () => {
  it("accepts TCP port numbers", () => {
    expect(parsePort("3333")).toBe(3333);
  });

  it("rejects missing or invalid ports", () => {
    expect(() => parsePort(undefined)).toThrow("Missing PORT");
    expect(() => parsePort("abc")).toThrow("Invalid PORT");
    expect(() => parsePort("0")).toThrow("Invalid PORT");
    expect(() => parsePort("65536")).toThrow("Invalid PORT");
  });
});
