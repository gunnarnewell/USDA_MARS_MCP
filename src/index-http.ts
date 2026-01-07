import http from "node:http";
import { createLogger } from "./util/logger";
import { loadConfig } from "./util/config";
import { MarsClient } from "./mars/client";
import { callTool, marsTools } from "./mcp/tools";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const logger = createLogger({ name: "mars-mcp-http" });
const config = loadConfig();
const client = new MarsClient({ config, logger });

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/rpc") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const request = JSON.parse(body) as JsonRpcRequest;
      let result: unknown;

      switch (request.method) {
        case "initialize":
          result = { capabilities: { tools: {} } };
          break;
        case "tools/list":
          result = { tools: marsTools };
          break;
        case "tools/call": {
          const { name, arguments: args } = request.params ?? {};
          if (typeof name !== "string") {
            throw new Error("Tool name must be a string.");
          }
          result = await callTool(name, (args ?? {}) as Record<string, unknown>, client);
          break;
        }
        default:
          throw new Error(`Unsupported method: ${request.method}`);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, result }));
    } catch (error) {
      logger.error("HTTP RPC error", { error });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Unknown error",
          },
        }),
      );
    }
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  logger.info("HTTP server listening", { port });
});
