import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./util/config.js";
import { logger } from "./util/logger.js";
import { MarsClient } from "./mars/client.js";
import { registerTools } from "./mcp/tools.js";

async function main() {
  const config = await loadConfig();
  if (!config) {
    logger.error("Missing MARS API key. Set MARS_API_KEY or ~/.mars-mcp/config.json.");
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

  const client = new MarsClient(config.apiKey);
  registerTools(server, client);

  const transport = new StreamableHTTPServerTransport({ endpoint: "/mcp" });
  await server.connect(transport);

  const port = Number(process.env.PORT ?? 3333);
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
