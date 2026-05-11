import { QueryParams } from "./url.js";

export type NormalizationStatus = "normalized" | "unsupported_shape";

export interface ReportDataSource {
  endpoint: string;
  slug: string;
  query?: QueryParams;
  sort?: string;
  retrieved_at: string;
}

export interface NormalizedReportData {
  normalization_status: NormalizationStatus;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  row_count: number;
  total_row_count: number;
  source: ReportDataSource;
  raw?: unknown;
}

export interface NormalizeReportDataOptions {
  slug: string;
  endpoint: string;
  query?: QueryParams;
  sort?: string;
  retrievedAt?: Date;
  includeRaw?: boolean;
  maxRows?: number;
}

const TABLE_KEYS = ["data", "results", "rows", "items", "report_data", "reportData"];

export function normalizeReportData(raw: unknown, options: NormalizeReportDataOptions): NormalizedReportData {
  const tableRows = extractTableRows(raw);
  const source: ReportDataSource = {
    endpoint: options.endpoint,
    slug: options.slug,
    query: options.query,
    sort: options.sort,
    retrieved_at: (options.retrievedAt ?? new Date()).toISOString()
  };

  if (!tableRows) {
    return withOptionalRaw({
      normalization_status: "unsupported_shape",
      rows: [],
      columns: [],
      row_count: 0,
      total_row_count: 0,
      source
    }, raw, options.includeRaw ?? true);
  }

  const rows = options.maxRows === undefined
    ? tableRows
    : tableRows.slice(0, options.maxRows);

  return withOptionalRaw({
    normalization_status: "normalized",
    rows,
    columns: collectColumns(tableRows),
    row_count: rows.length,
    total_row_count: tableRows.length,
    source
  }, raw, options.includeRaw ?? true);
}

function withOptionalRaw<T extends NormalizedReportData>(
  result: T,
  raw: unknown,
  includeRaw: boolean
): T {
  if (includeRaw) {
    return { ...result, raw };
  }
  return result;
}

function extractTableRows(raw: unknown): Array<Record<string, unknown>> | null {
  if (isPlainObjectArray(raw)) {
    return raw;
  }

  if (!isPlainObject(raw)) {
    return null;
  }

  for (const key of TABLE_KEYS) {
    const value = raw[key];
    if (isPlainObjectArray(value)) {
      return value;
    }
  }

  return null;
}

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return Array.from(columns);
}

function isPlainObjectArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isPlainObject);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}
