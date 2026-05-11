export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function shouldLogLevel(configured: LogLevel, candidate: LogLevel): boolean {
  return levelWeight[candidate] >= levelWeight[configured];
}

export function createLogger(options: {
  name?: string;
  stream?: NodeJS.WritableStream;
  level?: LogLevel;
} = {}): Logger {
  const stream = options.stream ?? process.stderr;
  const level = options.level ?? configuredLevel;
  const namePrefix = options.name ? `[${options.name}] ` : "";

  const shouldLog = (candidate: LogLevel): boolean =>
    shouldLogLevel(level, candidate);

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

export function createJsonLogger(options: {
  name?: string;
  stream?: NodeJS.WritableStream;
  level?: LogLevel;
  now?: () => Date;
} = {}): Logger {
  const stream = options.stream ?? process.stderr;
  const level = options.level ?? configuredLevel;
  const now = options.now ?? (() => new Date());

  const write = (candidate: LogLevel, message: string, fields: LogFields = {}): void => {
    if (!shouldLogLevel(level, candidate)) return;

    stream.write(`${JSON.stringify({
      timestamp: now().toISOString(),
      level: candidate,
      logger: options.name,
      message,
      ...fields
    })}\n`);
  };

  return {
    debug(message: string, fields?: LogFields): void {
      write("debug", message, fields);
    },
    info(message: string, fields?: LogFields): void {
      write("info", message, fields);
    },
    warn(message: string, fields?: LogFields): void {
      write("warn", message, fields);
    },
    error(message: string, fields?: LogFields): void {
      write("error", message, fields);
    }
  };
}

export const logger = createLogger();
