import { describe, expect, it } from "vitest";
import { normalizeReportData } from "../src/mars/normalize.js";

const baseOptions = {
  slug: "test-slug",
  endpoint: "/reports/test-slug/report%20details",
  retrievedAt: new Date("2026-05-06T00:00:00.000Z")
};

describe("normalizeReportData", () => {
  it("normalizes an array of row objects", () => {
    const result = normalizeReportData([
      { report_date: "2026-05-01", price: "100" },
      { report_date: "2026-05-02", volume: "25" }
    ], baseOptions);

    expect(result).toMatchObject({
      normalization_status: "normalized",
      columns: ["report_date", "price", "volume"],
      row_count: 2,
      total_row_count: 2,
      source: {
        endpoint: "/reports/test-slug/report%20details",
        slug: "test-slug",
        retrieved_at: "2026-05-06T00:00:00.000Z"
      }
    });
    expect(result.rows).toEqual([
      { report_date: "2026-05-01", price: "100" },
      { report_date: "2026-05-02", volume: "25" }
    ]);
    expect(result.raw).toBeDefined();
  });

  it("normalizes nested table-like response keys", () => {
    const result = normalizeReportData({
      data: [{ commodity: "Corn" }],
      metadata: { ignored: true }
    }, baseOptions);

    expect(result.normalization_status).toBe("normalized");
    expect(result.rows).toEqual([{ commodity: "Corn" }]);
    expect(result.columns).toEqual(["commodity"]);
  });

  it("limits returned rows without changing total row count", () => {
    const result = normalizeReportData([
      { id: 1 },
      { id: 2 },
      { id: 3 }
    ], { ...baseOptions, maxRows: 2, includeRaw: false });

    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.row_count).toBe(2);
    expect(result.total_row_count).toBe(3);
    expect(result.raw).toBeUndefined();
  });

  it("returns unsupported status for unrecognized shapes", () => {
    const result = normalizeReportData({ message: "not tabular" }, baseOptions);

    expect(result).toMatchObject({
      normalization_status: "unsupported_shape",
      rows: [],
      columns: [],
      row_count: 0,
      total_row_count: 0
    });
    expect(result.raw).toEqual({ message: "not tabular" });
  });
});
