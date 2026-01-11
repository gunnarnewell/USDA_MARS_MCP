export type LogLevel = "debug" | "info" | "warn" | "error";

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return levelWeight[level] >= levelWeight[configuredLevel];
}

function write(message: string): void {
  process.stderr.write(`${message}\n`);
}

export const logger = {
  debug(message: string): void {
    if (shouldLog("debug")) write(`[debug] ${message}`);
  },
  info(message: string): void {
    if (shouldLog("info")) write(`[info] ${message}`);
  },
  warn(message: string): void {
    if (shouldLog("warn")) write(`[warn] ${message}`);
  },
  error(message: string): void {
    if (shouldLog("error")) write(`[error] ${message}`);
  }
};
