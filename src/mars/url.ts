export type QueryValue = string | number | boolean;
export type QueryParams = Record<string, QueryValue | QueryValue[] | null | undefined>;

export function buildMarsUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, String(entry)));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  return url.toString();
}
