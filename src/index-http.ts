import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./util/logger.js";
import { MarsClient } from "./mars/client.js";
import { registerTools } from "./mcp/tools.js";

async function main() {
  const apiKey = process.env.MARS_API_KEY?.trim();
  if (!apiKey) {
    logger.error("Missing MARS API key. Set MARS_API_KEY.");
    process.exit(1);
  }

  const server = new Server(
    {
      name: "mars-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const client = new MarsClient(apiKey);
  registerTools(server, client);

  const transport = new StreamableHTTPServerTransport();
  await server.connect(transport);

  const portValue = process.env.PORT?.trim();
  if (!portValue) {
    logger.error("Missing PORT environment variable.");
    process.exit(1);
  }
  const port = Number(portValue);
  if (!Number.isFinite(port) || port <= 0) {
    logger.error(`Invalid PORT value: ${portValue}`);
    process.exit(1);
  }
  const httpServer = createServer((req, res) => {
    transport.handleRequest(req, res);
  });

  httpServer.listen(port, () => {
    logger.info(`MARS MCP server listening on http://localhost:${port}/mcp`);
  });
}

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
