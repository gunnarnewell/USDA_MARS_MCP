import { describe, expect, it } from "vitest";
import { listMarsTools } from "../src/mcp/tools";

describe("MCP tool definitions", () => {
  it("exposes the complete skill-ready MARS tool surface", () => {
    const names = listMarsTools().map((tool) => tool.name);

    expect(names).toEqual([
      "mars_healthcheck",
      "mars_list_reports",
      "mars_get_report",
      "mars_get_report_data",
      "mars_get_report_section",
      "mars_get_report_columns",
      "mars_get_report_details",
      "mars_get_report_info",
      "mars_list_offices",
      "mars_list_market_types",
      "mars_list_commodities"
    ]);
  });

  it("documents normalized report-data inputs", () => {
    const reportDataTool = listMarsTools().find((tool) => tool.name === "mars_get_report_data");

    expect(reportDataTool?.inputSchema.properties).toMatchObject({
      normalize: { type: "boolean" },
      includeRaw: { type: "boolean" },
      maxRows: { type: "number", maximum: 10000 },
      lastReports: { type: "number", maximum: 1000 }
    });
  });
});
