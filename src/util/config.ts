import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MarsConfig {
  apiKey: string;
}

const CONFIG_PATH = join(homedir(), ".mars-mcp", "config.json");

export async function loadConfig(): Promise<MarsConfig | null> {
  const envKey = process.env.MARS_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey };
  }

  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as { apiKey?: string };
    if (parsed.apiKey?.trim()) {
      return { apiKey: parsed.apiKey.trim() };
    }
  } catch {
    return null;
  }

  return null;
}
