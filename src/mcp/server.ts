import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MarsClient } from "../mars/client.js";
import { type MarsConfig } from "../util/config.js";
import { registerTools } from "./tools.js";

export const SERVER_NAME = "mars-mcp-server";
export const SERVER_VERSION = "0.1.0";

export interface CreateMarsMcpServerOptions {
  client?: MarsClient;
}

export function createMarsMcpServer(
  config: MarsConfig,
  options: CreateMarsMcpServerOptions = {}
): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const client = options.client ?? new MarsClient({ config });
  registerTools(server, client);
  return server;
}
