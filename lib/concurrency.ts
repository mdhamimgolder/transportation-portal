/**
 * Runs `fn` over `items` with at most `limit` calls in flight, preserving
 * result order. Use instead of an unbounded `Promise.all(items.map(...))`
 * whenever each call opens a DB connection or a network request — an
 * unbounded fan-out over hundreds of rows exhausts the Neon connection pool.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
