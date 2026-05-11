import { describe, expect, it, vi } from "vitest";
import { MarsClient } from "../src/mars/client";
import { createLogger } from "../src/util/logger";
import { MarsConfig } from "../src/util/config";

const config: MarsConfig = {
  baseUrl: "https://example.com/api/",
  apiKey: "token",
  timeoutMs: 1000,
  maxRetries: 2,
  retryBaseDelayMs: 1,
  concurrency: 1,
};

describe("MarsClient retry behavior", () => {
  it("retries failed requests before succeeding", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "fail" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "fail" }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = new MarsClient({
      config,
      logger: createLogger({ name: "test", stream: process.stderr }),
      fetcher,
    });

    const result = await client.request<{ ok: boolean }>("/status");

    expect(result.data.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("caches discovery endpoint responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([{ slug_id: "1" }]), { status: 200 }));

    const client = new MarsClient({
      config: { ...config, cacheTtlMs: 1000 },
      logger: createLogger({ name: "test", stream: process.stderr }),
      fetcher,
    });

    await client.request("/reports");
    await client.request("/reports");

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("can disable discovery endpoint caching", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify([{ slug_id: "1" }]), { status: 200 }));

    const client = new MarsClient({
      config: { ...config, cacheTtlMs: 0 },
      logger: createLogger({ name: "test", stream: process.stderr }),
      fetcher,
    });

    await client.request("/reports");
    await client.request("/reports");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
