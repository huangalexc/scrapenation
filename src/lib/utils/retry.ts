/**
 * Retry utilities with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

const defaultOptions: Required<RetryOptions> = {
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 32000,
  backoffMultiplier: 2,
  shouldRetry: () => true,
  onRetry: () => {},
};

/**
 * Execute a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!opts.shouldRetry(error)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelay
      );

      opts.onRetry(attempt, error);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is a quota/rate limit error
 */
export function isQuotaError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  const status = error?.response?.status || error?.statusCode || 0;

  return (
    status === 429 ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

/**
 * Check if error is a network error that should be retried
 */
export function isRetryableNetworkError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code || '';

  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
}

/**
 * Determine if an error should be retried
 */
export function shouldRetryError(error: any): boolean {
  // Always retry quota and network errors
  if (isQuotaError(error) || isRetryableNetworkError(error)) {
    return true;
  }

  // Don't retry client errors (4xx except 429)
  const status = error?.response?.status || error?.statusCode || 0;
  if (status >= 400 && status < 500 && status !== 429) {
    return false;
  }

  // Retry server errors (5xx)
  if (status >= 500) {
    return true;
  }

  // Don't retry validation errors
  if (error?.name === 'ValidationError' || error?.name === 'ZodError') {
    return false;
  }

  // Default: don't retry
  return false;
}
