export interface QueryParams {
  q?: string;
  sort?: string;
  allSections?: boolean;
  correctionsOnly?: boolean;
  anyChangesSince?: string;
  lastDays?: number;
  lastReports?: number;
  dsId?: string;
}

export function buildQuery(params: QueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set("q", params.q);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.allSections) searchParams.set("allSections", "true");
  if (params.correctionsOnly) searchParams.set("correctionsOnly", "true");
  if (params.anyChangesSince) searchParams.set("anyChangesSince", params.anyChangesSince);
  if (typeof params.lastDays === "number") searchParams.set("lastDays", String(params.lastDays));
  if (typeof params.lastReports === "number") searchParams.set("lastReports", String(params.lastReports));
  if (params.dsId) searchParams.set("dsId", params.dsId);

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export type MarsUrlParamValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | null
  | undefined;

export function buildMarsUrl(
  baseUrl: string,
  path: string,
  params: Record<string, MarsUrlParamValue> = {}
): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${normalizedBase}/${normalizedPath}`;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        searchParams.append(key, String(item));
      }
    } else {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
}
