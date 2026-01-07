import { buildMarsUrl, QueryParams } from "./url";
import { MarsConfig } from "../util/config";
import { Logger } from "../util/logger";
import { withRetry } from "../util/retry";
import { Semaphore } from "../util/semaphore";

export interface MarsResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class MarsError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "MarsError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export interface MarsClientOptions {
  config: MarsConfig;
  logger: Logger;
  semaphore?: Semaphore;
  fetcher?: typeof fetch;
}

export class MarsClient {
  private config: MarsConfig;
  private logger: Logger;
  private semaphore: Semaphore;
  private fetcher: typeof fetch;

  constructor({ config, logger, semaphore, fetcher }: MarsClientOptions) {
    this.config = config;
    this.logger = logger;
    this.semaphore = semaphore ?? new Semaphore(config.concurrency);
    this.fetcher = fetcher ?? fetch;
  }

  async request<T>(
    path: string,
    params?: QueryParams,
    init?: RequestInit,
  ): Promise<MarsResponse<T>> {
    const url = buildMarsUrl(this.config.baseUrl, path, params);

    return withRetry(
      async () => {
        const release = await this.semaphore.acquire();
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

          const headers: HeadersInit = {
            ...(init?.headers ?? {}),
          };
          if (this.config.apiKey) {
            headers["Authorization"] = `Bearer ${this.config.apiKey}`;
          }

          const response = await this.fetcher(url, {
            ...init,
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            let errorBody: unknown = undefined;
            try {
              errorBody = await response.clone().json();
            } catch {
              try {
                errorBody = await response.clone().text();
              } catch {
                errorBody = undefined;
              }
            }

            throw new MarsError("MARS request failed", {
              status: response.status,
              code: "MARS_HTTP_ERROR",
              details: errorBody,
            });
          }

          const data = (await response.json()) as T;
          return { data, status: response.status, headers: response.headers };
        } catch (error) {
          if (error instanceof MarsError) {
            this.logger.warn("MARS request error", { error, url });
          } else {
            this.logger.warn("MARS request failure", { error, url });
          }
          throw error;
        } finally {
          release();
        }
      },
      {
        maxRetries: this.config.maxRetries,
        baseDelayMs: this.config.retryBaseDelayMs,
        retryOn: (error) => {
          if (error instanceof MarsError) {
            const status = error.status ?? 0;
            return status === 429 || status >= 500;
          }
          return true;
        },
      },
    );
  }
}
