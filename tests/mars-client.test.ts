import { afterEach, describe, expect, it, vi } from "vitest";
import { MarsClient, MarsError } from "../src/mars/client.js";

const jsonResponse = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("MarsClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the fetch implementation path for getJson", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, [{ slug_id: "1" }]));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    const response = await client.getJson<Array<{ slug_id: string }>>("/reports");

    expect(response.status).toBe(200);
    expect(response.data).toEqual([{ slug_id: "1" }]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://marsapi.ams.usda.gov/services/v1.2/reports");
  });

  it("sends basic auth and accept headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    await client.getJson("/reports");

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("test-key:").toString("base64")}`,
      accept: "application/json"
    });
  });

  it("retries on 429 and succeeds", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limit" }))
      .mockResolvedValueOnce(jsonResponse(200, [{ slug_id: "1", slug_name: "abc", report_name: "Report" }]));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    const response = await client.getJson("/reports");

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 and succeeds", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, { error: "server error" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    const response = await client.getJson("/reports");

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry deterministic 400 errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(400, { error: "bad query" }));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    await expect(client.getJson("/reports")).rejects.toMatchObject({
      errorCode: "bad_request",
      httpStatus: 400
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("normalizes and retries network errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    const response = await client.getJson("/reports");

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("caches discovery endpoint responses within the configured TTL", async () => {
    let currentTime = 1000;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, [{ slug_id: "cached" }]));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1, cacheTtlMs: 1000 },
      fetcher,
      now: () => currentTime
    });

    const first = await client.getJson("/reports");
    currentTime += 999;
    const second = await client.getJson("/reports");

    expect(first.data).toEqual(second.data);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("refreshes cached discovery responses after TTL expiry", async () => {
    let currentTime = 1000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [{ slug_id: "first" }]))
      .mockResolvedValueOnce(jsonResponse(200, [{ slug_id: "second" }]));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1, cacheTtlMs: 1000 },
      fetcher,
      now: () => currentTime
    });

    const first = await client.getJson<Array<{ slug_id: string }>>("/reports");
    currentTime += 1000;
    const second = await client.getJson<Array<{ slug_id: string }>>("/reports");

    expect(first.data[0]?.slug_id).toBe("first");
    expect(second.data[0]?.slug_id).toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("can disable the discovery endpoint cache", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [{ slug_id: "first" }]))
      .mockResolvedValueOnce(jsonResponse(200, [{ slug_id: "second" }]));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1, cacheEnabled: false },
      fetcher
    });

    await client.getJson("/reports");
    await client.getJson("/reports");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("caches report column discovery endpoints but not report data endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(200, { ok: true }));
    const client = new MarsClient({
      config: { apiKey: "test-key", retryBaseDelayMs: 1 },
      fetcher
    });

    await client.getJson("/reports/test-report/columns");
    await client.getJson("/reports/test-report/columns");
    await client.getJson("/reports/test-report/report%20details");
    await client.getJson("/reports/test-report/report%20details");

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("normalizes timeout errors", async () => {
    const timeoutError = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(timeoutError);
    const client = new MarsClient({
      config: { apiKey: "test-key", maxRetries: 0, retryBaseDelayMs: 1 },
      fetcher
    });

    await expect(client.getJson("/reports")).rejects.toMatchObject({
      errorCode: "timeout",
      message: "Timed out while calling MARS API"
    });
    await expect(client.getJson("/reports")).rejects.toBeInstanceOf(MarsError);
  });
});
