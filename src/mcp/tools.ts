import { MarsClient } from "../mars/client";
import { QueryParams } from "../mars/url";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
}

export const marsTools: ToolDefinition[] = [
  {
    name: "mars.get",
    description: "Fetch data from the MARS API using a path and optional query params.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "API path relative to the base URL." },
        params: {
          type: "object",
          additionalProperties: {
            anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array" }],
          },
        },
      },
      required: ["path"],
    },
  },
  {
    name: "mars.health",
    description: "Confirm the configured MARS base URL.",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  client: MarsClient,
): Promise<ToolCallResult> {
  switch (name) {
    case "mars.get": {
      const path = args.path as string;
      const params = (args.params ?? {}) as QueryParams;
      const response = await client.request<unknown>(path, params);
      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
    }
    case "mars.health": {
      return {
        content: [{ type: "text", text: "MARS client ready" }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
