import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { TokenBreakdown, Usage } from '../src/lib/types';

const counter = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function parseUsage(value: any): TokenBreakdown | null {
  const totalTokens = counter(value?.total_tokens);
  const inputTokens = counter(value?.input_tokens);
  const outputTokens = counter(value?.output_tokens);
  if (totalTokens === null || inputTokens === null || outputTokens === null) return null;
  const cached = counter(value?.cached_input_tokens);
  const reasoning = counter(value?.reasoning_output_tokens);
  return { totalTokens, inputTokens, outputTokens, cachedInputTokens: cached !== null && cached <= inputTokens ? cached : null, reasoningOutputTokens: reasoning !== null && reasoning <= outputTokens ? reasoning : null };
}

export function createUsageReader() {
  const cache = new Map<string, { size: number; mtime: number; usage: Usage | null }>();
  return async (path: string | null | undefined): Promise<{ usage: Usage | null; usageError: string | null }> => {
    if (!path) return { usage: null, usageError: 'No saved usage file available.' };
    try {
      const info = await stat(path);
      const saved = cache.get(path);
      if (saved?.size === info.size && saved.mtime === info.mtimeMs) return { usage: saved.usage, usageError: null };
      let total: TokenBreakdown | null = null;
      let last: TokenBreakdown | null = null;
      let modelContextWindow: number | null = null;
      let turns = 0;
      let modelCalls = 0;
      const recentRequests: number[] = [];
      // ponytail: stream a changed file in full; switch to tail offsets if large logs make manual refresh slow.
      const input = createReadStream(path, { encoding: 'utf8' });
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.includes('token_count') && !line.includes('task_started')) continue;
          let record;
          try { record = JSON.parse(line); } catch { continue; } // A writer may leave a partial final line.
          if (record?.type === 'event_msg' && record.payload?.type === 'task_started') {
            turns++;
            continue;
          }
          if (record?.type !== 'event_msg' || record.payload?.type !== 'token_count') continue;
          const nextTotal = parseUsage(record.payload.info?.total_token_usage);
          const nextLast = parseUsage(record.payload.info?.last_token_usage);
          const nextWindow = counter(record.payload.info?.model_context_window);
          if (nextTotal && nextTotal.totalTokens !== total?.totalTokens) {
            modelCalls++;
            if (nextLast) {
              recentRequests.push(nextLast.totalTokens);
              if (recentRequests.length > 12) recentRequests.shift();
            }
          }
          if (nextTotal) total = nextTotal; // Cumulative snapshots replace, never add to, earlier snapshots.
          if (nextLast) last = nextLast;
          if (nextWindow !== null) modelContextWindow = nextWindow;
        }
      } finally { lines.close(); input.destroy(); }
      const usage: Usage | null = total ? { ...total, last, modelContextWindow, turns, modelCalls, recentRequests } : null;
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(path, { size: info.size, mtime: info.mtimeMs, usage });
      return { usage, usageError: null };
    } catch { return { usage: null, usageError: 'Saved usage could not be read. Check local file permissions and refresh.' }; }
  };
}
