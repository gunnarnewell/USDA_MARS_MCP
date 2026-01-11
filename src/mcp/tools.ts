import { z } from "zod";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MarsClient, MarsError } from "../mars/client.js";

const listReportsSchema = z.object({}).strict();
const getReportSchema = z.object({
  slug: z.string().min(1),
  q: z.string().optional(),
  sort: z.string().optional(),
  allSections: z.boolean().optional()
});
const getReportDataSchema = z.object({
  slug: z.string().min(1),
  q: z.string().optional(),
  sort: z.string().optional(),
  allSections: z.boolean().optional(),
  lastReports: z.number().int().positive().optional()
});
const getSectionSchema = z.object({
  slug: z.string().min(1),
  section: z.string().min(1),
  q: z.string().optional(),
  sort: z.string().optional()
});
const getDetailsSchema = z.object({
  slug: z.string().min(1),
  correctionsOnly: z.boolean().optional(),
  anyChangesSince: z.string().optional(),
  lastDays: z.number().int().positive().optional()
});
const getColumnsSchema = z.object({
  slug: z.string().min(1)
});
const getReportInfoSchema = z.object({
  slug: z.string().min(1)
});

const REPORT_DOC_BASE_URL = "https://mymarketnews.ams.usda.gov/viewReport";

function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  return withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i);
  return match?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function extractApiUrls(html: string): string[] {
  const matches = html.match(/https?:\/\/marsapi\.ams\.usda\.gov\/[^\s"'<>]+/gi) ?? [];
  return Array.from(new Set(matches));
}

function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError
  } as const;
}

function normalizeError(error: unknown) {
  if (error instanceof MarsError) {
    return {
      error_code: error.errorCode,
      message: error.message,
      details: error.details,
      http_status: error.httpStatus
    };
  }
  return {
    error_code: "unknown",
    message: "Unexpected error",
    details: error
  };
}

export function registerTools(server: Server, client: MarsClient): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "mars_healthcheck",
        description: "Check connectivity to the MARS reports endpoint",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_list_reports",
        description: "List MARS reports table of contents",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_get_report",
        description: "Fetch a MARS report by slug",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            q: { type: "string" },
            sort: { type: "string" },
            allSections: { type: "boolean" }
          },
          required: ["slug"],
          additionalProperties: false
        }
      },
      {
        name: "mars_get_report_data",
        description: "Fetch report data from the report details endpoint",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            q: { type: "string" },
            sort: { type: "string" },
            allSections: { type: "boolean" },
            lastReports: { type: "number" }
          },
          required: ["slug"],
          additionalProperties: false
        }
      },
      {
        name: "mars_get_report_section",
        description: "Fetch a specific section of a MARS report",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            section: { type: "string" },
            q: { type: "string" },
            sort: { type: "string" }
          },
          required: ["slug", "section"],
          additionalProperties: false
        }
      },
      {
        name: "mars_get_report_columns",
        description: "List available columns for a report",
        inputSchema: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
          additionalProperties: false
        }
      },
      {
        name: "mars_get_report_details",
        description: "Fetch report details metadata",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            correctionsOnly: { type: "boolean" },
            anyChangesSince: { type: "string" },
            lastDays: { type: "number" }
          },
          required: ["slug"],
          additionalProperties: false
        }
      },
      {
        name: "mars_get_report_info",
        description: "Fetch the report description and API documentation page",
        inputSchema: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
          additionalProperties: false
        }
      },
      {
        name: "mars_list_offices",
        description: "List MARS offices",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_list_market_types",
        description: "List MARS market types",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_list_commodities",
        description: "List MARS commodities",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const tool = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      switch (tool) {
        case "mars_healthcheck": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/reports");
          return toolResult({
            ok: true,
            http_status: response.status,
            message: "MARS API reachable"
          });
        }
        case "mars_list_reports": {
          listReportsSchema.parse(args);
          const response = await client.getJson<Array<{ slug_id: string; slug_name: string; report_name: string }>>("/reports");
          return toolResult({ results: response.data });
        }
        case "mars_get_report": {
          const input = getReportSchema.parse(args);
          const response = await client.getJson(`/reports/${encodeURIComponent(input.slug)}`, {
            q: input.q,
            sort: input.sort,
            allSections: input.allSections
          });
          return toolResult({ slug: input.slug, data: response.data });
        }
        case "mars_get_report_data": {
          const input = getReportDataSchema.parse(args);
          const response = await client.getJson(
            `/reports/${encodeURIComponent(input.slug)}/report%20details`,
            {
              q: input.q,
              sort: input.sort,
              allSections: input.allSections,
              lastReports: input.lastReports
            }
          );
          return toolResult({ slug: input.slug, data: response.data });
        }
        case "mars_get_report_section": {
          const input = getSectionSchema.parse(args);
          const response = await client.getJson(
            `/reports/${encodeURIComponent(input.slug)}/${encodeURIComponent(input.section)}`,
            { q: input.q, sort: input.sort }
          );
          return toolResult({ slug: input.slug, section: input.section, data: response.data });
        }
        case "mars_get_report_columns": {
          const input = getColumnsSchema.parse(args);
          const response = await client.getJson(
            `/reports/${encodeURIComponent(input.slug)}/columns`
          );
          return toolResult({ slug: input.slug, data: response.data });
        }
        case "mars_get_report_details": {
          const input = getDetailsSchema.parse(args);
          const response = await client.getJson(`/reports/${encodeURIComponent(input.slug)}/Details`, {
            correctionsOnly: input.correctionsOnly,
            anyChangesSince: input.anyChangesSince,
            lastDays: input.lastDays
          });
          return toolResult({ slug: input.slug, data: response.data });
        }
        case "mars_get_report_info": {
          const input = getReportInfoSchema.parse(args);
          const url = `${REPORT_DOC_BASE_URL}/${encodeURIComponent(input.slug)}`;
          const response = await fetch(url);
          const html = await response.text();
          const title = extractTitle(html);
          const description = extractMetaDescription(html);
          const apiUrls = extractApiUrls(html);
          const text = stripHtml(html);

          return toolResult({
            slug: input.slug,
            url,
            http_status: response.status,
            title,
            description,
            api_urls: apiUrls,
            text
          });
        }
        case "mars_list_offices": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/offices");
          return toolResult(response.data);
        }
        case "mars_list_market_types": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/marketTypes");
          return toolResult(response.data);
        }
        case "mars_list_commodities": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/commodities");
          return toolResult(response.data);
        }
        default:
          return toolResult({ error_code: "unknown", message: `Unknown tool: ${tool}` }, true);
      }
    } catch (error) {
      return toolResult(normalizeError(error), true);
    }
  });
}
