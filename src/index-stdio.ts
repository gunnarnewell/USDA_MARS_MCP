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

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const logger = createLogger({ name: "mars-mcp-stdio", stream: process.stderr });
const config = loadConfig();
const client = new MarsClient({ config, logger });

function writeResponse(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    switch (request.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            capabilities: {
              tools: {},
            },
          },
        };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            tools: marsTools,
          },
        };
      case "tools/call": {
        const { name, arguments: args } = request.params ?? {};
        if (typeof name !== "string") {
          throw new Error("Tool name must be a string.");
        }
        const result = await callTool(name, (args ?? {}) as Record<string, unknown>, client);
        return { jsonrpc: "2.0", id: request.id ?? null, result };
      }
      default:
        throw new Error(`Unsupported method: ${request.method}`);
    }
  } catch (error) {
    logger.error("RPC error", { error, method: request.method });
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let boundary = buffer.indexOf("\n");
  while (boundary !== -1) {
    const line = buffer.slice(0, boundary).trim();
    buffer = buffer.slice(boundary + 1);
    if (line.length > 0) {
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        handleRequest(request).then(writeResponse).catch((error) => {
          logger.error("Unhandled error", { error });
        });
      } catch (error) {
        logger.error("Failed to parse JSON", { error });
      }
    }
    boundary = buffer.indexOf("\n");
  }
});

process.stdin.on("end", () => {
  logger.info("STDIN closed");
});
