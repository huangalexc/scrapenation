/**
 * Error handling and tracking utilities
 */

export class ScrapenationError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ScrapenationError';
  }
}

export class PlacesAPIError extends ScrapenationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'PLACES_API_ERROR', context);
    this.name = 'PlacesAPIError';
  }
}

export class CustomSearchError extends ScrapenationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CUSTOM_SEARCH_ERROR', context);
    this.name = 'CustomSearchError';
  }
}

export class OpenAIError extends ScrapenationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'OPENAI_ERROR', context);
    this.name = 'OpenAIError';
  }
}

export class ScrapingError extends ScrapenationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SCRAPING_ERROR', context);
    this.name = 'ScrapingError';
  }
}

export class QuotaExceededError extends ScrapenationError {
  constructor(service: string, context?: Record<string, any>) {
    super(`Quota exceeded for ${service}`, 'QUOTA_EXCEEDED', { service, ...context });
    this.name = 'QuotaExceededError';
  }
}

/**
 * Error logger with context
 */
export function logError(error: Error, context?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error instanceof ScrapenationError && { code: error.code }),
    ...context,
  };

  console.error('[ERROR]', JSON.stringify(errorInfo, null, 2));

  // TODO: Send to error tracking service (Sentry, etc.)
}

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}

/**
 * Error response for API routes
 */
export interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    context?: Record<string, any>;
  };
}

export function createErrorResponse(
  error: unknown,
  defaultMessage = 'An error occurred'
): ErrorResponse {
  if (error instanceof ScrapenationError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        context: error.context,
      },
    };
  }

  return {
    error: {
      message: getErrorMessage(error) || defaultMessage,
    },
  };
}
