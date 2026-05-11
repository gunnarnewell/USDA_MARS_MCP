import { z } from "zod";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MarsClient, MarsError } from "../mars/client.js";
import { normalizeReportData } from "../mars/normalize.js";

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
  lastReports: z.number().int().positive().max(1000).optional(),
  normalize: z.boolean().optional(),
  includeRaw: z.boolean().optional(),
  maxRows: z.number().int().positive().max(10000).optional()
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
  anyChangesSince: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/).optional(),
  lastDays: z.number().int().positive().max(3660).optional()
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

function successResult(payload: Record<string, unknown>) {
  return toolResult({ ok: true, ...payload });
}

function errorResult(payload: Record<string, unknown>) {
  return toolResult({ ok: false, ...payload }, true);
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
  if (error instanceof z.ZodError) {
    return {
      error_code: "invalid_input",
      message: "Invalid tool input",
      details: error.issues
    };
  }
  return {
    error_code: "unknown",
    message: "Unexpected error",
    details: error
  };
}

export function listMarsTools() {
  return [
      {
        name: "mars_healthcheck",
        description: "Check connectivity to the MARS reports endpoint",
        inputSchema: { type: "object", description: "No input is required.", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_list_reports",
        description: "List MARS reports table of contents",
        inputSchema: { type: "object", description: "No input is required.", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_get_report",
        description: "Fetch a MARS report by slug",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string", description: "MARS report slug from mars_list_reports." },
            q: { type: "string", description: "Report-specific MARS query expression. Inspect columns before use." },
            sort: { type: "string", description: "Report-specific MARS sort expression, such as -report_date when supported." },
            allSections: { type: "boolean", description: "Request all report sections when supported by MARS." }
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
            slug: { type: "string", description: "MARS report slug from mars_list_reports." },
            q: { type: "string", description: "Report-specific MARS query expression. Inspect columns before use." },
            sort: { type: "string", description: "Report-specific MARS sort expression, such as -report_date when supported." },
            allSections: { type: "boolean", description: "Request all report sections when supported by MARS." },
            lastReports: { type: "number", minimum: 1, maximum: 1000 },
            normalize: { type: "boolean", description: "When true, return conservative normalized rows plus source metadata." },
            includeRaw: { type: "boolean", description: "When normalize is true, include the original MARS response. Defaults to true." },
            maxRows: { type: "number", minimum: 1, maximum: 10000, description: "Optional maximum number of normalized rows to return." }
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
            slug: { type: "string", description: "MARS report slug from mars_list_reports." },
            section: { type: "string", description: "Report section name to fetch." },
            q: { type: "string", description: "Report-specific MARS query expression. Inspect columns before use." },
            sort: { type: "string", description: "Report-specific MARS sort expression, such as -report_date when supported." }
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
          properties: { slug: { type: "string", description: "MARS report slug from mars_list_reports." } },
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
            slug: { type: "string", description: "MARS report slug from mars_list_reports." },
            correctionsOnly: { type: "boolean", description: "When true, request only correction records." },
            anyChangesSince: { type: "string", pattern: "^\\d{4}/\\d{2}/\\d{2}$", description: "Return records changed since this date in YYYY/MM/DD format." },
            lastDays: { type: "number", minimum: 1, maximum: 3660, description: "Limit details to reports from the last N days." }
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
          properties: { slug: { type: "string", description: "MARS report slug from mars_list_reports." } },
          required: ["slug"],
          additionalProperties: false
        }
      },
      {
        name: "mars_list_offices",
        description: "List MARS offices",
        inputSchema: { type: "object", description: "No input is required.", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_list_market_types",
        description: "List MARS market types",
        inputSchema: { type: "object", description: "No input is required.", properties: {}, additionalProperties: false }
      },
      {
        name: "mars_list_commodities",
        description: "List MARS commodities",
        inputSchema: { type: "object", description: "No input is required.", properties: {}, additionalProperties: false }
      }
  ];
}

export function registerTools(server: Server, client: MarsClient): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMarsTools()
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const tool = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      switch (tool) {
        case "mars_healthcheck": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/reports");
          return successResult({
            http_status: response.status,
            message: "MARS API reachable"
          });
        }
        case "mars_list_reports": {
          listReportsSchema.parse(args);
          const response = await client.getJson<Array<{ slug_id: string; slug_name: string; report_name: string }>>("/reports");
          return successResult({ data: response.data, results: response.data });
        }
        case "mars_get_report": {
          const input = getReportSchema.parse(args);
          const response = await client.getJson(`/reports/${encodeURIComponent(input.slug)}`, {
            q: input.q,
            sort: input.sort,
            allSections: input.allSections
          });
          return successResult({ slug: input.slug, data: response.data });
        }
        case "mars_get_report_data": {
          const input = getReportDataSchema.parse(args);
          const endpoint = `/reports/${encodeURIComponent(input.slug)}/report%20details`;
          const query = {
            q: input.q,
            sort: input.sort,
            allSections: input.allSections,
            lastReports: input.lastReports
          };
          const response = await client.getJson(endpoint, query);

          if (!input.normalize) {
            return successResult({ slug: input.slug, data: response.data });
          }

          const normalized = normalizeReportData(response.data, {
            slug: input.slug,
            endpoint,
            query,
            sort: input.sort,
            includeRaw: input.includeRaw ?? true,
            maxRows: input.maxRows
          });

          return successResult({
            slug: input.slug,
            data: normalized,
            ...normalized
          });
        }
        case "mars_get_report_section": {
          const input = getSectionSchema.parse(args);
          const response = await client.getJson(
            `/reports/${encodeURIComponent(input.slug)}/${encodeURIComponent(input.section)}`,
            { q: input.q, sort: input.sort }
          );
          return successResult({ slug: input.slug, section: input.section, data: response.data });
        }
        case "mars_get_report_columns": {
          const input = getColumnsSchema.parse(args);
          const response = await client.getJson(
            `/reports/${encodeURIComponent(input.slug)}/columns`
          );
          return successResult({ slug: input.slug, data: response.data });
        }
        case "mars_get_report_details": {
          const input = getDetailsSchema.parse(args);
          const response = await client.getJson(`/reports/${encodeURIComponent(input.slug)}/Details`, {
            correctionsOnly: input.correctionsOnly,
            anyChangesSince: input.anyChangesSince,
            lastDays: input.lastDays
          });
          return successResult({ slug: input.slug, data: response.data });
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

          return successResult({
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
          return successResult({ data: response.data });
        }
        case "mars_list_market_types": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/marketTypes");
          return successResult({ data: response.data });
        }
        case "mars_list_commodities": {
          listReportsSchema.parse(args);
          const response = await client.getJson("/commodities");
          return successResult({ data: response.data });
        }
        default:
          return errorResult({ error_code: "unknown", message: `Unknown tool: ${tool}` });
      }
    } catch (error) {
      return errorResult(normalizeError(error));
    }
  });
}
