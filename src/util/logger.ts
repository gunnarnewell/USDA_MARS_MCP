export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

export function createLogger(options: {
  name?: string;
  stream?: NodeJS.WritableStream;
  level?: LogLevel;
} = {}): Logger {
  const stream = options.stream ?? process.stderr;
  const level = options.level ?? configuredLevel;
  const namePrefix = options.name ? `[${options.name}] ` : "";

  const shouldLog = (candidate: LogLevel): boolean =>
    levelWeight[candidate] >= levelWeight[level];

  const write = (message: string): void => {
    stream.write(`${message}\n`);
  };

  return {
    debug(message: string): void {
      if (shouldLog("debug")) write(`[debug] ${namePrefix}${message}`);
    },
    info(message: string): void {
      if (shouldLog("info")) write(`[info] ${namePrefix}${message}`);
    },
    warn(message: string): void {
      if (shouldLog("warn")) write(`[warn] ${namePrefix}${message}`);
    },
    error(message: string): void {
      if (shouldLog("error")) write(`[error] ${namePrefix}${message}`);
    }
  };
}

export const logger = createLogger();
