import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { TokenBreakdown, Usage, UsageCall, UsageMetrics } from '../src/lib/types';

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
  return async (path: string | null | undefined, fallbackModel = 'unknown'): Promise<{ usage: Usage | null; usageError: string | null }> => {
    if (!path) return { usage: null, usageError: 'No saved usage file available.' };
    try {
      const info = await stat(path);
      const saved = cache.get(path);
      if (saved?.size === info.size && saved.mtime === info.mtimeMs) return { usage: saved.usage, usageError: null };
      const blank = (): UsageMetrics => ({ totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 0, modelCalls: 0, recentRequests: [] });
      const total = blank();
      const byModel: Record<string, UsageMetrics> = {};
      const recentCalls: UsageCall[] = [];
      const dailyTokens: Record<string, number> = {};
      const dailyUsage: Record<string, UsageMetrics> = {};
      const minuteTokens: Record<string, number> = {};
      const longContextModels = new Set<string>();
      let previous: TokenBreakdown | null = null;
      let currentModel = fallbackModel;
      let serviceTier: string | null = null;
      let sawUsage = false;
      const add = (target: UsageMetrics, value: TokenBreakdown) => {
        target.totalTokens += value.totalTokens; target.inputTokens += value.inputTokens; target.outputTokens += value.outputTokens;
        target.cachedInputTokens = target.cachedInputTokens === null || value.cachedInputTokens === null ? null : target.cachedInputTokens + value.cachedInputTokens;
        target.reasoningOutputTokens = target.reasoningOutputTokens === null || value.reasoningOutputTokens === null ? null : target.reasoningOutputTokens + value.reasoningOutputTokens;
      };
      // ponytail: stream a changed file in full; switch to tail offsets if large logs make manual refresh slow.
      const input = createReadStream(path, { encoding: 'utf8' });
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          let record;
          try { record = JSON.parse(line); } catch { continue; } // A writer may leave a partial final line.
          const settings = record?.type === 'event_msg' && record.payload?.type === 'thread_settings_applied'
            ? record.payload.thread_settings : record?.type === 'world_state' ? record.payload?.state : record?.type === 'turn_context' ? record.payload : null;
          if (settings && Object.hasOwn(settings, 'service_tier')) {
            serviceTier = typeof settings.service_tier === 'string' ? settings.service_tier : null;
          }
          const nextModel = settings?.model;
          if (typeof nextModel === 'string' && nextModel) {
            if (nextModel !== currentModel) recentCalls.length = 0;
            currentModel = nextModel;
            continue;
          }
          if (record?.type === 'compacted' || (record?.type === 'event_msg' && record.payload?.type === 'context_compacted')) {
            recentCalls.length = 0;
            continue;
          }
          if (record?.type === 'event_msg' && record.payload?.type === 'task_started') {
            total.turns++;
            (byModel[currentModel] ||= blank()).turns++;
            continue;
          }
          if (record?.type !== 'event_msg' || record.payload?.type !== 'token_count') continue;
          const nextTotal = parseUsage(record.payload.info?.total_token_usage);
          const nextLast = parseUsage(record.payload.info?.last_token_usage);
          const nextWindow = counter(record.payload.info?.model_context_window);
          if (nextLast && nextLast.inputTokens > 272_000) longContextModels.add(currentModel);
          if (nextTotal && nextTotal.totalTokens !== previous?.totalTokens) {
            const reset = !previous || nextTotal.totalTokens < previous.totalTokens || nextTotal.inputTokens < previous.inputTokens || nextTotal.outputTokens < previous.outputTokens;
            if (reset) recentCalls.length = 0;
            const delta: TokenBreakdown = reset ? nextTotal : {
              totalTokens: nextTotal.totalTokens - previous!.totalTokens,
              inputTokens: nextTotal.inputTokens - previous!.inputTokens,
              outputTokens: nextTotal.outputTokens - previous!.outputTokens,
              cachedInputTokens: nextTotal.cachedInputTokens === null || previous!.cachedInputTokens === null ? null : nextTotal.cachedInputTokens - previous!.cachedInputTokens,
              reasoningOutputTokens: nextTotal.reasoningOutputTokens === null || previous!.reasoningOutputTokens === null ? null : nextTotal.reasoningOutputTokens - previous!.reasoningOutputTokens
            };
            const modelUsage = byModel[currentModel] ||= blank();
            const recordedAt = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
            if (Number.isFinite(recordedAt)) {
              const day = new Date(recordedAt).toISOString().slice(0, 10);
              dailyTokens[day] = (dailyTokens[day] ?? 0) + delta.totalTokens;
              const dated = dailyUsage[day] ||= blank();
              add(dated, delta);
              dated.modelCalls++;
              const minute = new Date(recordedAt).toISOString().slice(0, 16);
              minuteTokens[minute] = (minuteTokens[minute] ?? 0) + delta.totalTokens;
            }
            add(total, delta); add(modelUsage, delta);
            total.modelCalls++; modelUsage.modelCalls++;
            if (nextLast) {
              const timestamp = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
              recentCalls.push({ ...nextLast, model: currentModel, serviceTier, timestamp: Number.isFinite(timestamp) ? timestamp : null });
              if (recentCalls.length > 12) recentCalls.shift();
              total.recentRequests.push(nextLast.totalTokens); modelUsage.recentRequests.push(nextLast.totalTokens);
              if (total.recentRequests.length > 12) total.recentRequests.shift();
              if (modelUsage.recentRequests.length > 12) modelUsage.recentRequests.shift();
            } else recentCalls.length = 0;
            sawUsage = true;
          }
          if (nextTotal) previous = nextTotal;
          if (nextLast) { total.last = nextLast; (byModel[currentModel] ||= blank()).last = nextLast; }
          if (nextWindow !== null) { total.modelContextWindow = nextWindow; (byModel[currentModel] ||= blank()).modelContextWindow = nextWindow; }
        }
      } finally { lines.close(); input.destroy(); }
      const usage: Usage | null = sawUsage ? { ...total, byModel, dailyTokens, dailyUsage, minuteTokens, recentCalls, activeModel: currentModel, longContextModels: [...longContextModels] } : null;
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(path, { size: info.size, mtime: info.mtimeMs, usage });
      return { usage, usageError: null };
    } catch { return { usage: null, usageError: 'Saved usage could not be read. Check local file permissions and refresh.' }; }
  };
}
