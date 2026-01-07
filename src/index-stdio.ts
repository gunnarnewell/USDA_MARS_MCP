import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MARS MCP server running in stdio mode");
}

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
