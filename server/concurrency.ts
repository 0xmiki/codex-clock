export async function mapConcurrent<T, R>(values: T[], concurrency: number, work: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= values.length) return;
      result[index] = await work(values[index], index);
    }
  }));
  return result;
}
