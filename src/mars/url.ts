export interface QueryParams {
  q?: string;
  sort?: string;
  allSections?: boolean;
  correctionsOnly?: boolean;
  anyChangesSince?: string;
  lastDays?: number;
}

export function buildQuery(params: QueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set("q", params.q);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.allSections) searchParams.set("allSections", "true");
  if (params.correctionsOnly) searchParams.set("correctionsOnly", "true");
  if (params.anyChangesSince) searchParams.set("anyChangesSince", params.anyChangesSince);
  if (typeof params.lastDays === "number") searchParams.set("lastDays", String(params.lastDays));

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}
