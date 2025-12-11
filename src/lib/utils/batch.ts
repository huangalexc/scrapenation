import pLimit from 'p-limit';

/**
 * Process items in batches with concurrency control
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    concurrency?: number;
    batchSize?: number;
    onProgress?: (completed: number, total: number, results: R[]) => void;
    onError?: (error: Error, item: T) => void;
  } = {}
): Promise<R[]> {
  const { concurrency = 10, batchSize = 50, onProgress, onError } = options;

  const limit = pLimit(concurrency);
  const results: R[] = [];
  const total = items.length;
  let completed = 0;

  // Process in batches to avoid overwhelming memory
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map((item) =>
        limit(async () => {
          try {
            const result = await processor(item);
            completed++;
            if (onProgress) {
              onProgress(completed, total, results);
            }
            return result;
          } catch (error) {
            completed++;
            if (onError) {
              onError(error as Error, item);
            }
            if (onProgress) {
              onProgress(completed, total, results);
            }
            throw error;
          }
        })
      )
    );

    // Collect successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  }

  return results;
}

/**
 * Process items in chunks (for rate limiting)
 */
export async function processInChunks<T, R>(
  items: T[],
  chunkSize: number,
  processor: (chunk: T[]) => Promise<R[]>,
  delayBetweenChunks: number = 0
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await processor(chunk);
    results.push(...chunkResults);

    // Delay between chunks if specified
    if (delayBetweenChunks > 0 && i + chunkSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenChunks));
    }
  }

  return results;
}

/**
 * Execute functions in parallel with concurrency limit
 */
export async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const limit = pLimit(concurrency);
  return Promise.all(tasks.map((task) => limit(task)));
}

/**
 * Batch items into groups
 */
export function batchItems<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}
