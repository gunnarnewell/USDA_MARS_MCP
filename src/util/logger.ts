export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  name: string;
  stream?: NodeJS.WritableStream;
}

const defaultStream = process.stderr;

function serializeError(value: unknown): Record<string, unknown> | undefined {
  if (!(value instanceof Error)) {
    return undefined;
  }

  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
}

function writeLog(
  stream: NodeJS.WritableStream,
  name: string,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    name,
    message,
  };

  if (meta) {
    payload.meta = meta;
    const errorMeta = serializeError(meta.error);
    if (errorMeta) {
      payload.error = errorMeta;
    }
  }

  stream.write(`${JSON.stringify(payload)}\n`);
}

export function createLogger({ name, stream = defaultStream }: LoggerOptions): Logger {
  return {
    debug(message, meta) {
      writeLog(stream, name, "debug", message, meta);
    },
    info(message, meta) {
      writeLog(stream, name, "info", message, meta);
    },
    warn(message, meta) {
      writeLog(stream, name, "warn", message, meta);
    },
    error(message, meta) {
      writeLog(stream, name, "error", message, meta);
    },
  };
}
