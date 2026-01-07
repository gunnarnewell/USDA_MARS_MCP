import { request } from "undici";
import { buildQuery, QueryParams } from "./url.js";
import { retryWithBackoff } from "../util/retry.js";
import { Semaphore } from "../util/semaphore.js";

const BASE_URL = "https://marsapi.ams.usda.gov/services/v1.2";
const TIMEOUT_MS = 15000;
const semaphore = new Semaphore(5);

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

export class MarsClient {
  private readonly authHeader: string;

  constructor(apiKey: string) {
    const token = Buffer.from(`${apiKey}:`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async getJson<T>(path: string, params: QueryParams = {}): Promise<MarsResponse<T>> {
    const release = await semaphore.acquire();
    try {
      const url = `${BASE_URL}${path}${buildQuery(params)}`;
      const result = await retryWithBackoff(
        async () => {
          const response = await request(url, {
            method: "GET",
            headers: {
              authorization: this.authHeader,
              accept: "application/json"
            },
            signal: AbortSignal.timeout(TIMEOUT_MS)
          });

          const bodyText = await response.body.text();
          const contentType = response.headers["content-type"] ?? "";
          const parsedBody = contentType.includes("application/json")
            ? JSON.parse(bodyText)
            : bodyText;

          if (response.statusCode >= 400) {
            throw this.toMarsError(response.statusCode, parsedBody);
          }

          return {
            status: response.statusCode,
            data: parsedBody as T
          };
        },
        { retries: 2, minDelayMs: 400, maxDelayMs: 2000 },
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
}
