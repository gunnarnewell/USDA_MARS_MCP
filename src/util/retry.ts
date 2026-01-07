export interface RetryOptions {
  retries: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
  shouldRetry: (error: unknown) => boolean
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= options.retries) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.retries || !shouldRetry(error)) {
        break;
      }

      const baseDelay = Math.min(
        options.maxDelayMs,
        options.minDelayMs * 2 ** attempt
      );
      const jitter = Math.random() * baseDelay * 0.2;
      const delay = baseDelay + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }

  throw lastError;
}
