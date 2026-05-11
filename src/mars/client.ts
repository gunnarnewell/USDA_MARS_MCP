import { buildQuery, QueryParams } from "./url.js";
import { retryWithBackoff } from "../util/retry.js";
import { Semaphore } from "../util/semaphore.js";
import { MarsConfig } from "../util/config.js";
import { Logger, logger as defaultLogger } from "../util/logger.js";

const BASE_URL = "https://marsapi.ams.usda.gov/services/v1.2";
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;
const CONCURRENCY = 5;
const CACHE_TTL_MS = 15 * 60 * 1000;

export type MarsErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "timeout"
  | "unknown";

export class MarsError extends Error {
  constructor(
    public readonly errorCode: MarsErrorCode,
    message: string,
    public readonly httpStatus?: number,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export interface MarsResponse<T> {
  data: T;
  status: number;
}

export interface MarsClientInit {
  config: MarsConfig;
  logger?: Logger;
  fetcher?: typeof fetch;
  now?: () => number;
}

interface CacheEntry<T> {
  expiresAt: number;
  response: MarsResponse<T>;
}

export class MarsClient {
  private readonly authHeader: string;
  private readonly config: Required<MarsConfig>;
  private readonly logger: Logger;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly semaphore: Semaphore;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(input: string | MarsClientInit) {
    const config = this.normalizeConfig(
      typeof input === "string" ? { apiKey: input } : input.config
    );
    this.config = config;
    this.logger = typeof input === "string" ? defaultLogger : input.logger ?? defaultLogger;
    this.fetcher =
      typeof input === "string"
        ? this.getDefaultFetcher()
        : input.fetcher ?? this.getDefaultFetcher();
    this.now = typeof input === "string" ? Date.now : input.now ?? Date.now;
    this.semaphore = new Semaphore(this.config.concurrency);

    const token = Buffer.from(`${config.apiKey}:`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async getJson<T>(path: string, params: QueryParams = {}): Promise<MarsResponse<T>> {
    return this.request<T>(path, params);
  }

  async request<T>(path: string, params: QueryParams = {}): Promise<MarsResponse<T>> {
    const release = await this.semaphore.acquire();
    try {
      const query = buildQuery(params);
      const url = `${this.buildUrl(path)}${query}`;
      const cacheKey = this.getCacheKey(path, query);
      const cached = cacheKey ? this.getCachedResponse<T>(cacheKey) : null;
      if (cached) {
        return cached;
      }

      const result = await retryWithBackoff(
        async () => {
          try {
            const response = await this.fetcher(url, {
              method: "GET",
              headers: {
                authorization: this.authHeader,
                accept: "application/json"
              },
              signal: AbortSignal.timeout(this.config.timeoutMs)
            });

            const bodyText = await response.text();
            const contentType = response.headers?.get?.("content-type");
            const parsedBody = this.parseBody(bodyText, contentType ?? undefined);

            if (response.status >= 400) {
              throw this.toMarsError(response.status, parsedBody);
            }

            return {
              status: response.status,
              data: parsedBody as T
            };
          } catch (error) {
            throw this.normalizeRequestError(error);
          }
        },
        {
          retries: this.config.maxRetries,
          minDelayMs: this.config.retryBaseDelayMs,
          maxDelayMs: Math.max(this.config.retryBaseDelayMs * 5, this.config.retryBaseDelayMs)
        },
        (error) => this.shouldRetry(error)
      );

      if (cacheKey) {
        this.setCachedResponse(cacheKey, result);
      }

      return result;
    } catch (error) {
      if (error instanceof MarsError) {
        throw error;
      }
      throw new MarsError("unknown", "Unexpected error while calling MARS API", undefined, error);
    } finally {
      release();
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof MarsError) {
      return ["rate_limited", "server_error", "network_error", "timeout"].includes(error.errorCode);
    }
    return false;
  }

  private normalizeRequestError(error: unknown): MarsError {
    if (error instanceof MarsError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        return new MarsError("timeout", "Timed out while calling MARS API", undefined, {
          name: error.name,
          message: error.message
        });
      }

      return new MarsError("network_error", "Network error while calling MARS API", undefined, {
        name: error.name,
        message: error.message
      });
    }

    return new MarsError("network_error", "Network error while calling MARS API", undefined, error);
  }

  private toMarsError(status: number, details: unknown): MarsError {
    switch (status) {
      case 400:
        return new MarsError("bad_request", "Bad request to MARS API", status, details);
      case 401:
        return new MarsError("unauthorized", "Unauthorized: invalid API key", status, details);
      case 404:
        return new MarsError("not_found", "Resource not found", status, details);
      case 429:
        return new MarsError("rate_limited", "Rate limited by MARS API", status, details);
      case 500:
      case 502:
      case 503:
      case 504:
        return new MarsError("server_error", "MARS API server error", status, details);
      default:
        return new MarsError("unknown", "Unexpected MARS API error", status, details);
    }
  }

  private normalizeConfig(config: MarsConfig): Required<MarsConfig> {
    return {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? BASE_URL,
      timeoutMs: config.timeoutMs ?? TIMEOUT_MS,
      maxRetries: config.maxRetries ?? MAX_RETRIES,
      retryBaseDelayMs: config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS,
      concurrency: config.concurrency ?? CONCURRENCY,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTtlMs: config.cacheTtlMs ?? CACHE_TTL_MS
    };
  }

  private getCacheKey(path: string, query: string): string | null {
    if (!this.config.cacheEnabled || this.config.cacheTtlMs <= 0 || !this.isCacheablePath(path)) {
      return null;
    }
    return `${path}${query}`;
  }

  private isCacheablePath(path: string): boolean {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return ["/reports", "/offices", "/marketTypes", "/commodities"].includes(normalizedPath)
      || /^\/reports\/[^/]+\/columns$/i.test(normalizedPath);
  }

  private getCachedResponse<T>(cacheKey: string): MarsResponse<T> | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= this.now()) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.response as MarsResponse<T>;
  }

  private setCachedResponse<T>(cacheKey: string, response: MarsResponse<T>): void {
    this.cache.set(cacheKey, {
      expiresAt: this.now() + this.config.cacheTtlMs,
      response
    });
  }

  private buildUrl(path: string): string {
    const base = this.config.baseUrl.endsWith("/")
      ? this.config.baseUrl.slice(0, -1)
      : this.config.baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private parseBody(bodyText: string, contentType?: string): unknown {
    if (contentType?.includes("application/json")) {
      return JSON.parse(bodyText);
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      return bodyText;
    }
  }

  private getDefaultFetcher(): typeof fetch {
    if (typeof globalThis.fetch !== "function") {
      throw new Error("Fetch API is not available in this runtime.");
    }
    return globalThis.fetch.bind(globalThis);
  }
}
