import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MarsConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  concurrency?: number;
  cacheEnabled?: boolean;
  cacheTtlMs?: number;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  useFile?: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const CONFIG_PATH = join(homedir(), ".mars-mcp", "config.json");

type FileConfig = Partial<MarsConfig>;

export async function loadConfig(options: LoadConfigOptions = {}): Promise<MarsConfig | null> {
  const env = options.env ?? process.env;
  const fileConfig = options.useFile === false
    ? null
    : await loadFileConfig(options.configPath ?? CONFIG_PATH);
  const envConfig = loadEnvConfig(env);

  const apiKey = envConfig.apiKey ?? fileConfig?.apiKey;
  if (!apiKey) {
    return null;
  }

  return {
    ...fileConfig,
    ...envConfig,
    apiKey
  };
}

async function loadFileConfig(configPath: string): Promise<FileConfig | null> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as FileConfig;
    return normalizeFileConfig(parsed);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    return null;
  }
}

function normalizeFileConfig(parsed: FileConfig): FileConfig {
  const config: FileConfig = {};

  if (typeof parsed.apiKey === "string" && parsed.apiKey.trim()) {
    config.apiKey = parsed.apiKey.trim();
  }
  if (typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()) {
    config.baseUrl = parsed.baseUrl.trim();
  }
  if (parsed.timeoutMs !== undefined) {
    config.timeoutMs = requireInteger("timeoutMs", parsed.timeoutMs, { min: 1 });
  }
  if (parsed.maxRetries !== undefined) {
    config.maxRetries = requireInteger("maxRetries", parsed.maxRetries, { min: 0 });
  }
  if (parsed.retryBaseDelayMs !== undefined) {
    config.retryBaseDelayMs = requireInteger("retryBaseDelayMs", parsed.retryBaseDelayMs, { min: 1 });
  }
  if (parsed.concurrency !== undefined) {
    config.concurrency = requireInteger("concurrency", parsed.concurrency, { min: 1 });
  }
  if (parsed.cacheEnabled !== undefined) {
    config.cacheEnabled = requireBoolean("cacheEnabled", parsed.cacheEnabled);
  }
  if (parsed.cacheTtlMs !== undefined) {
    config.cacheTtlMs = requireInteger("cacheTtlMs", parsed.cacheTtlMs, { min: 0 });
  }

  return config;
}

function loadEnvConfig(env: NodeJS.ProcessEnv): Partial<MarsConfig> {
  const config: Partial<MarsConfig> = {};

  const apiKey = env.MARS_API_KEY?.trim();
  if (apiKey) {
    config.apiKey = apiKey;
  }

  const baseUrl = env.MARS_BASE_URL?.trim();
  if (baseUrl) {
    config.baseUrl = baseUrl;
  }

  if (env.MARS_TIMEOUT_MS !== undefined) {
    config.timeoutMs = parseIntegerEnv("MARS_TIMEOUT_MS", env.MARS_TIMEOUT_MS, { min: 1 });
  }
  if (env.MARS_MAX_RETRIES !== undefined) {
    config.maxRetries = parseIntegerEnv("MARS_MAX_RETRIES", env.MARS_MAX_RETRIES, { min: 0 });
  }
  if (env.MARS_RETRY_BASE_DELAY_MS !== undefined) {
    config.retryBaseDelayMs = parseIntegerEnv("MARS_RETRY_BASE_DELAY_MS", env.MARS_RETRY_BASE_DELAY_MS, { min: 1 });
  }
  if (env.MARS_CONCURRENCY !== undefined) {
    config.concurrency = parseIntegerEnv("MARS_CONCURRENCY", env.MARS_CONCURRENCY, { min: 1 });
  }
  if (env.MARS_CACHE_ENABLED !== undefined) {
    config.cacheEnabled = parseBooleanEnv("MARS_CACHE_ENABLED", env.MARS_CACHE_ENABLED);
  }
  if (env.MARS_CACHE_TTL_MS !== undefined) {
    config.cacheTtlMs = parseIntegerEnv("MARS_CACHE_TTL_MS", env.MARS_CACHE_TTL_MS, { min: 0 });
  }

  return config;
}

function parseIntegerEnv(
  name: string,
  value: string,
  options: { min: number }
): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < options.min) {
    throw new ConfigError(`${name} must be an integer greater than or equal to ${options.min}.`);
  }
  return parsed;
}

function requireInteger(
  name: string,
  value: unknown,
  options: { min: number }
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < options.min) {
    throw new ConfigError(`${name} must be an integer greater than or equal to ${options.min}.`);
  }
  return value;
}

function parseBooleanEnv(name: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new ConfigError(`${name} must be a boolean value: true/false, 1/0, yes/no, or on/off.`);
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ConfigError(`${name} must be a boolean value.`);
  }
  return value;
}
