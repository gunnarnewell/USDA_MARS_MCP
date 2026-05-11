import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/util/config.js";

async function writeTempConfig(contents: unknown): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "mars-mcp-config-"));
  const path = join(dir, "config.json");
  await writeFile(path, JSON.stringify(contents), "utf8");
  return { dir, path };
}

describe("loadConfig", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("returns null when no API key is configured", async () => {
    await expect(loadConfig({ env: {}, useFile: false })).resolves.toBeNull();
  });

  it("loads all supported MARS env vars", async () => {
    await expect(loadConfig({
      env: {
        MARS_API_KEY: " env-key ",
        MARS_BASE_URL: " https://example.test/mars ",
        MARS_TIMEOUT_MS: "1000",
        MARS_MAX_RETRIES: "0",
        MARS_RETRY_BASE_DELAY_MS: "25",
        MARS_CONCURRENCY: "3",
        MARS_CACHE_ENABLED: "false",
        MARS_CACHE_TTL_MS: "5000"
      },
      useFile: false
    })).resolves.toEqual({
      apiKey: "env-key",
      baseUrl: "https://example.test/mars",
      timeoutMs: 1000,
      maxRetries: 0,
      retryBaseDelayMs: 25,
      concurrency: 3,
      cacheEnabled: false,
      cacheTtlMs: 5000
    });
  });

  it("lets environment values override file config values", async () => {
    const temp = await writeTempConfig({
      apiKey: "file-key",
      baseUrl: "https://file.example.test",
      timeoutMs: 2000,
      maxRetries: 1,
      retryBaseDelayMs: 50,
      concurrency: 2,
      cacheEnabled: true,
      cacheTtlMs: 1000
    });
    tempDirs.push(temp.dir);

    await expect(loadConfig({
      configPath: temp.path,
      env: {
        MARS_API_KEY: "env-key",
        MARS_TIMEOUT_MS: "3000"
      }
    })).resolves.toEqual({
      apiKey: "env-key",
      baseUrl: "https://file.example.test",
      timeoutMs: 3000,
      maxRetries: 1,
      retryBaseDelayMs: 50,
      concurrency: 2,
      cacheEnabled: true,
      cacheTtlMs: 1000
    });
  });

  it("loads file config when env key is absent", async () => {
    const temp = await writeTempConfig({ apiKey: "file-key", concurrency: 4 });
    tempDirs.push(temp.dir);

    await expect(loadConfig({ configPath: temp.path, env: {} })).resolves.toEqual({
      apiKey: "file-key",
      concurrency: 4
    });
  });

  it("rejects invalid numeric env vars with clear errors", async () => {
    await expect(loadConfig({
      env: { MARS_API_KEY: "env-key", MARS_TIMEOUT_MS: "0" },
      useFile: false
    })).rejects.toThrow(ConfigError);
    await expect(loadConfig({
      env: { MARS_API_KEY: "env-key", MARS_TIMEOUT_MS: "0" },
      useFile: false
    })).rejects.toThrow("MARS_TIMEOUT_MS must be an integer greater than or equal to 1");
  });

  it("rejects invalid boolean env vars with clear errors", async () => {
    await expect(loadConfig({
      env: { MARS_API_KEY: "env-key", MARS_CACHE_ENABLED: "sometimes" },
      useFile: false
    })).rejects.toThrow("MARS_CACHE_ENABLED must be a boolean value");
  });

  it("rejects invalid numeric file config values", async () => {
    const temp = await writeTempConfig({ apiKey: "file-key", maxRetries: -1 });
    tempDirs.push(temp.dir);

    await expect(loadConfig({ configPath: temp.path, env: {} })).rejects.toThrow("maxRetries must be an integer greater than or equal to 0");
  });
});
