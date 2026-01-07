export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  retryOn?: (error: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(attempt: number, baseDelayMs: number, maxDelayMs?: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  const capped = maxDelayMs ? Math.min(delay, maxDelayMs) : delay;
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return capped + jitter;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  { maxRetries, baseDelayMs, maxDelayMs, retryOn }: RetryOptions,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxRetries || (retryOn && !retryOn(error))) {
        throw error;
      }

      const delay = nextDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
      attempt += 1;
    }
  }
}
