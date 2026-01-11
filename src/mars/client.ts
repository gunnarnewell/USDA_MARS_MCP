import { request } from "undici";
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

export type MarsErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "server_error"
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
}

export class MarsClient {
  private readonly authHeader: string;
  private readonly config: Required<MarsConfig>;
  private readonly logger: Logger;
  private readonly fetcher: typeof fetch;
  private readonly semaphore: Semaphore;

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
    this.semaphore = new Semaphore(this.config.concurrency);

    const token = Buffer.from(`${config.apiKey}:`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async getJson<T>(path: string, params: QueryParams = {}): Promise<MarsResponse<T>> {
    const release = await this.semaphore.acquire();
    try {
      const url = `${this.buildUrl(path)}${buildQuery(params)}`;
      const result = await retryWithBackoff(
        async () => {
          const response = await request(url, {
            method: "GET",
            headers: {
              authorization: this.authHeader,
              accept: "application/json"
            },
            signal: AbortSignal.timeout(this.config.timeoutMs)
          });

          const bodyText = await response.body.text();
          const header = response.headers["content-type"];
          const contentType = Array.isArray(header) ? header[0] : header;
          const parsedBody = this.parseBody(bodyText, contentType);

          if (response.statusCode >= 400) {
            throw this.toMarsError(response.statusCode, parsedBody);
          }

          return {
            status: response.statusCode,
            data: parsedBody as T
          };
        },
        {
          retries: this.config.maxRetries,
          minDelayMs: this.config.retryBaseDelayMs,
          maxDelayMs: Math.max(this.config.retryBaseDelayMs * 5, this.config.retryBaseDelayMs)
        },
        (error) => this.shouldRetry(error)
      );

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

  async request<T>(path: string, params: QueryParams = {}): Promise<MarsResponse<T>> {
    const release = await this.semaphore.acquire();
    try {
      const url = `${this.buildUrl(path)}${buildQuery(params)}`;
      const result = await retryWithBackoff(
        async () => {
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
        },
        {
          retries: this.config.maxRetries,
          minDelayMs: this.config.retryBaseDelayMs,
          maxDelayMs: Math.max(this.config.retryBaseDelayMs * 5, this.config.retryBaseDelayMs)
        },
        (error) => this.shouldRetry(error)
      );

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
      return error.errorCode === "rate_limited" || error.errorCode === "server_error";
    }
    return false;
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
      concurrency: config.concurrency ?? CONCURRENCY
    };
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
