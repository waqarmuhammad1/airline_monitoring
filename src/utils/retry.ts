import { logger } from "./logger";

const CTX = "retry";

export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? parseInt(process.env.MAX_RETRIES || "3", 10);
  const backoffMs = opts.backoffMs ?? parseInt(process.env.RETRY_BACKOFF_MS || "1000", 10);
  const label = opts.label ?? "operation";

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(CTX, `${label} attempt ${attempt}/${maxRetries} failed: ${msg}`);
      if (attempt < maxRetries) {
        const delay = backoffMs * attempt;
        logger.info(CTX, `Retrying ${label} in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
