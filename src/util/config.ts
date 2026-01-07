export interface MarsConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  concurrency: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MarsConfig {
  return {
    baseUrl: env.MARS_BASE_URL ?? "https://api.nasa.gov/mars-photos/api/v1/",
    apiKey: env.MARS_API_KEY,
    timeoutMs: Number(env.MARS_TIMEOUT_MS ?? 15000),
    maxRetries: Number(env.MARS_MAX_RETRIES ?? 2),
    retryBaseDelayMs: Number(env.MARS_RETRY_BASE_DELAY_MS ?? 250),
    concurrency: Number(env.MARS_CONCURRENCY ?? 4),
  };
}
