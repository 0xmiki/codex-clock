import type { Thread, UsageCall } from './types';

export type CostRange = { low: number; high: number };
export type EfficiencyGrade = 'A' | 'B' | 'C' | 'D' | 'F';

// Standard API-equivalent USD per million tokens; not subscription credits.
// Verified 2026-09-16: https://developers.openai.com/api/docs/models/<model>
const prices: Record<string, { input: number; cached: number; output: number; writes: boolean }> = {
  'gpt-6-astra': { input: 10, cached: 1, output: 50, writes: true },
  'gpt-5.6-sol': { input: 4, cached: .4, output: 20, writes: true },
  'gpt-5.6-terra': { input: 2, cached: .2, output: 12, writes: true },
  'gpt-5.6-luna': { input: .2, cached: .02, output: 1.2, writes: true },
  'gpt-5.5': { input: 5, cached: .5, output: 30, writes: false }
};

export function callCost(model: string, input: number, cached: number, output: number): CostRange | null {
  const rate = Object.hasOwn(prices, model) ? prices[model] : null;
  if (!rate || ![input, cached, output].every(n => Number.isFinite(n) && n >= 0) || cached > input || input > 272_000) return null;
  const low = ((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1_000_000;
  return { low, high: low + (rate.writes ? (input - cached) * rate.input * .25 / 1_000_000 : 0) };
}

const midpoint = (range: CostRange) => (range.low + range.high) / 2;
const add = (a: CostRange, b: CostRange): CostRange => ({ low: a.low + b.low, high: a.high + b.high });
const scale = (a: CostRange, n: number): CostRange => ({ low: a.low * n, high: a.high * n });
const BASELINE_THREADS = 30;
const MIN_BASELINE_THREADS = 5;
export const burnGrade = (ratio: number): EfficiencyGrade => ratio <= 1 ? 'A' : ratio <= 1.5 ? 'B' : ratio <= 2 ? 'C' : ratio <= 3 ? 'D' : 'F';

type RecentUsage = {
  available: true;
  model: string;
  samples: number;
  lastSampleAt: number | null;
  averageInput: number;
  averageCached: number;
  averageOutput: number;
  cachePercent: number;
  recentCost: CostRange;
} | { available: false; reason: string };

export type ThreadEfficiency = (Extract<RecentUsage, { available: true }> & {
  grade: EfficiencyGrade;
  normalCost: number;
  costPerMillion: number;
  normalCostPerMillion: number;
  burnRatio: number;
  baselineThreads: number;
  costRatio: number;
  reason: string;
}) | { available: false; reason: string };

function recentUsage(thread: Thread): RecentUsage {
  const recent = thread.usage?.recentCalls ?? [];
  const last = recent.at(-1);
  if (!last) return { available: false, reason: 'No recent call breakdowns. Refresh saved usage.' };
  const model = thread.usage?.activeModel ?? last.model;
  if (!Object.hasOwn(prices, model)) return { available: false, reason: `No verified pricing for ${model}.` };
  if (model === 'gpt-5.5' && thread.usage?.longContextModels?.includes(model)) return { available: false, reason: 'This session crossed the long-context pricing threshold.' };
  const calls: UsageCall[] = [];
  for (let i = recent.length - 1; i >= 0 && calls.length < 5; i--) {
    if (recent[i].model !== model) break;
    calls.unshift(recent[i]);
  }
  if (calls.length < 5) return { available: false, reason: 'Need 5 recent calls on the current model after a switch or compaction.' };
  if (calls.some(call => call.cachedInputTokens === null)) return { available: false, reason: 'Recent cache counters are missing.' };
  if (calls.some(call => call.inputTokens > 272_000)) return { available: false, reason: 'Long-context pricing is not supported by this grade.' };
  const costs = calls.map(call => callCost(model, call.inputTokens, call.cachedInputTokens!, call.outputTokens));
  if (costs.some(cost => cost === null)) return { available: false, reason: 'Recent token counters cannot be priced reliably.' };
  const recentCost = scale(costs.reduce<CostRange>((sum, cost) => add(sum, cost!), { low: 0, high: 0 }), 1 / calls.length);
  const averageInput = calls.reduce((sum, call) => sum + call.inputTokens, 0) / calls.length;
  const averageCached = calls.reduce((sum, call) => sum + call.cachedInputTokens!, 0) / calls.length;
  const averageOutput = calls.reduce((sum, call) => sum + call.outputTokens, 0) / calls.length;
  return { available: true, model, samples: calls.length, lastSampleAt: last.timestamp, averageInput, averageCached, averageOutput, cachePercent: averageInput ? averageCached / averageInput * 100 : 0, recentCost };
}

// Build once from the complete snapshot, before project/day filtering. Each peer
// contributes one recent per-call average regardless of its lifetime call count.
export function gradeThreads(threads: Thread[]): Map<string, ThreadEfficiency> {
  const unique = [...new Map(threads.map(thread => [thread.id, thread])).values()];
  const samples = unique.map(thread => ({ thread, usage: recentUsage(thread) }));
  const eligible = samples.filter((sample): sample is { thread: Thread; usage: Extract<RecentUsage, { available: true }> } => sample.usage.available)
    .toSorted((a, b) => b.thread.updatedAt - a.thread.updatedAt || a.thread.id.localeCompare(b.thread.id));
  return new Map(samples.map(({ thread, usage }): [string, ThreadEfficiency] => {
    if (!usage.available) return [thread.id, usage];
    const tokenRate = (u: Extract<RecentUsage, { available: true }>) => midpoint(u.recentCost) / (u.averageInput + u.averageOutput) * 1_000_000;
    const median = (values: number[]) => {
      const sorted = values.toSorted((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const others = eligible.filter(sample => sample.thread.id !== thread.id);
    const peers = others.filter(sample => sample.usage.model === usage.model && Number.isFinite(tokenRate(sample.usage))).slice(0, BASELINE_THREADS);
    if (peers.length < MIN_BASELINE_THREADS) return [thread.id, { available: false, reason: 'Need 5 other threads with recent priced calls on the same model to grade efficiency.' }];
    const costPerMillion = tokenRate(usage);
    const normalCostPerMillion = median(peers.map(peer => tokenRate(peer.usage)));
    const normalCost = median(others.slice(0, BASELINE_THREADS).map(peer => midpoint(peer.usage.recentCost)));
    if (!Number.isFinite(costPerMillion) || normalCostPerMillion <= 0 || normalCost <= 0) return [thread.id, { available: false, reason: 'Not enough nonzero usage to calculate a meaningful comparison.' }];
    const costRatio = costPerMillion / normalCostPerMillion;
    const burnRatio = midpoint(usage.recentCost) / normalCost;
    return [thread.id, { ...usage, grade: burnGrade(costRatio), normalCost, costPerMillion, normalCostPerMillion, burnRatio, baselineThreads: peers.length, costRatio, reason: `${costRatio.toFixed(2)}× normal cost per token for ${usage.model}; ${burnRatio.toFixed(2)}× normal usage per call across models.` }];
  }));
}

export function workflowGrades(threads: Thread[], results: ReadonlyMap<string, ThreadEfficiency>) {
  const counts: Record<EfficiencyGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let available = 0;
  for (const thread of threads) {
    const result = results.get(thread.id);
    if (!result?.available) continue;
    counts[result.grade]++;
    available++;
  }
  return { counts, available, total: threads.length };
}
