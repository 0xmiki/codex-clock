import type { Thread } from './types';
export const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
export const todayThreads = (threads: Thread[], now: number) => threads.filter(thread => dayKey(thread.updatedAt * 1000) === dayKey(now));
export const sumThreadUsage = (threads: Thread[]) => threads.reduce((sum, thread) => {
  if (!thread.usage) return sum;
  sum.total += thread.usage.totalTokens;
  sum.cached += thread.usage.cachedInputTokens ?? 0;
  sum.input += thread.usage.inputTokens - (thread.usage.cachedInputTokens ?? 0);
  sum.output += thread.usage.outputTokens;
  sum.calls += thread.usage.modelCalls;
  return sum;
}, { total: 0, cached: 0, input: 0, output: 0, calls: 0 });
