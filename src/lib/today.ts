import type { Thread, UsageMetrics } from './types';
export const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
export const todayThreads = (threads: Thread[], now: number) => threads.filter(thread => dayKey(thread.updatedAt * 1000) === dayKey(now));
export const activeProjects = (threads: Thread[]) => [...new Set(threads.toSorted((a, b) => b.updatedAt - a.updatedAt).map(thread => thread.cwd))];
export const sumThreadUsage = (threads: Thread[]) => threads.reduce((sum, thread) => {
  if (!thread.usage) return sum;
  sum.total += thread.usage.totalTokens;
  sum.cached += thread.usage.cachedInputTokens ?? 0;
  sum.input += thread.usage.inputTokens - (thread.usage.cachedInputTokens ?? 0);
  sum.output += thread.usage.outputTokens;
  sum.calls += thread.usage.modelCalls;
  return sum;
}, { total: 0, cached: 0, input: 0, output: 0, calls: 0 });

const rates: Record<string, [number, number, number]> = {
  'gpt-6-astra': [250, 25, 1250], 'gpt-5.6-sol': [100, 10, 500],
  'gpt-5.6-terra': [50, 5, 300], 'gpt-5.6-luna': [5, .5, 30],
  'gpt-5.5': [125, 12.5, 750], 'gpt-5.4': [62.5, 6.25, 375],
  'gpt-5.4-mini': [18.75, 1.875, 113], 'gpt-5.3-codex': [43.75, 4.375, 350],
  'gpt-5.2': [43.75, 4.375, 350]
};

const modelRates = (model?: string | null) => rates[(model || '').toLowerCase()] || null;
export const estimatedCredits = (usage: UsageMetrics, model?: string | null) => {
  const rate = modelRates(model);
  if (!rate) return null;
  const cached = usage.cachedInputTokens ?? 0;
  return ((usage.inputTokens - cached) * rate[0] + cached * rate[1] + usage.outputTokens * rate[2]) / 1_000_000;
};
export const estimatedApiCost = (usage: UsageMetrics, model?: string | null) => {
  const credits = estimatedCredits(usage, model);
  return credits === null ? null : credits / 25;
};

export const efficiencyPressure = (usage: UsageMetrics, model?: string | null) => {
  const rate = modelRates(model);
  if (!rate) return null;
  const factors: [number, number][] = [];
  if (usage.cachedInputTokens !== null && usage.inputTokens > 0) factors.push([1 - usage.cachedInputTokens / usage.inputTokens, .5]);
  if (usage.last && usage.modelContextWindow) factors.push([Math.min(1, usage.last.totalTokens / usage.modelContextWindow), .3]);
  if (usage.recentRequests.length && usage.modelContextWindow) factors.push([Math.min(1, usage.recentRequests.reduce((a, b) => a + b, 0) / usage.recentRequests.length / usage.modelContextWindow), .2]);
  if (!factors.length) return null;
  const behavior = factors.reduce((sum, [value, weight]) => sum + value * weight, 0) / factors.reduce((sum, [, weight]) => sum + weight, 0);
  const solBlendedRate = 100 + 10 + 500;
  const modelMultiplier = Math.sqrt((rate[0] + rate[1] + rate[2]) / solBlendedRate);
  return Math.min(100, Math.round(behavior * modelMultiplier * 100));
};

const modelUsages = (thread: Thread): Array<[string, UsageMetrics]> => thread.usage
  ? Object.values(thread.usage.byModel || {}).some(usage => usage.modelCalls > 0) ? Object.entries(thread.usage.byModel).filter(([, usage]) => usage.modelCalls > 0) : [[thread.model || '', thread.usage]]
  : [];
export const threadApiCost = (thread: Thread) => {
  const costs = modelUsages(thread).map(([model, usage]) => estimatedApiCost(usage, model));
  return costs.some(cost => cost === null) ? null : costs.reduce<number>((sum, cost) => sum + cost!, 0);
};
export const threadPressure = (thread: Thread) => {
  const scored = modelUsages(thread).flatMap(([model, usage]) => {
    const score = efficiencyPressure(usage, model);
    const weight = estimatedCredits(usage, model);
    return score === null || weight === null ? [] : [{ score, weight: Math.max(weight, .001) }];
  });
  return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score * item.weight, 0) / scored.reduce((sum, item) => sum + item.weight, 0)) : null;
};

export const workflowPressure = (threads: Thread[]) => {
  const scored = threads.flatMap(thread => {
    if (!thread.usage) return [];
    const score = threadPressure(thread);
    const credits = threadApiCost(thread);
    return score === null || credits === null ? [] : [{ score, weight: Math.max(credits, .001) }];
  });
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, item) => sum + item.score * item.weight, 0) / scored.reduce((sum, item) => sum + item.weight, 0));
};

export type DayBucket = { day: string; tokens: number; threads: number; calls: number; isToday: boolean };
export const dailyBuckets = (threads: Thread[], now: number, maxDays = 6) => {
  const todayKey = dayKey(now);
  const buckets = new Map<string, DayBucket>();
  for (const thread of threads) {
    const day = dayKey(thread.updatedAt * 1000);
    const bucket = buckets.get(day) || { day, tokens: 0, threads: 0, calls: 0, isToday: day === todayKey };
    bucket.tokens += thread.usage?.totalTokens ?? 0;
    bucket.calls += thread.usage?.modelCalls ?? 0;
    bucket.threads++;
    buckets.set(day, bucket);
  }
  return [...buckets.values()].toSorted((a, b) => a.day.localeCompare(b.day)).slice(-maxDays).map(bucket => ({ ...bucket, isToday: bucket.day === todayKey }));
};

export type ProjectRollup = { cwd: string; name: string; tokens: number; threads: number };
export const projectRollup = (threads: Thread[], limit = 5) => {
  const rollup = new Map<string, ProjectRollup>();
  for (const thread of threads) {
    const row = rollup.get(thread.cwd) || { cwd: thread.cwd, name: thread.cwd.split(/[\\/]/).filter(Boolean).at(-1) || thread.cwd, tokens: 0, threads: 0 };
    row.tokens += thread.usage?.totalTokens ?? 0;
    row.threads++;
    rollup.set(thread.cwd, row);
  }
  return [...rollup.values()].toSorted((a, b) => b.tokens - a.tokens).slice(0, limit);
};

// Cached input is part of input; unknown stays unknown rather than reading as zero.
export const cacheRate = (usage: UsageMetrics | null | undefined) =>
  !usage || usage.cachedInputTokens === null || usage.inputTokens === 0 ? null : Math.round(usage.cachedInputTokens / usage.inputTokens * 100);

export const sumCacheRate = (threads: Thread[]) => {
  let cached = 0, input = 0, known = true;
  for (const thread of threads) {
    if (!thread.usage) continue;
    if (thread.usage.cachedInputTokens === null) known = false;
    else cached += thread.usage.cachedInputTokens;
    input += thread.usage.inputTokens;
  }
  return !input || !known ? null : Math.round(cached / input * 100);
};
