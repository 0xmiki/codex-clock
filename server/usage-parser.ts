import type { TokenBreakdown, Usage, UsageCall, UsageMetrics } from '../src/lib/types';

const counter = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function parseUsage(value: any): TokenBreakdown | null {
  const totalTokens = counter(value?.total_tokens), inputTokens = counter(value?.input_tokens), outputTokens = counter(value?.output_tokens);
  if (totalTokens === null || inputTokens === null || outputTokens === null) return null;
  const cached = counter(value?.cached_input_tokens), reasoning = counter(value?.reasoning_output_tokens);
  return { totalTokens, inputTokens, outputTokens, cachedInputTokens: cached !== null && cached <= inputTokens ? cached : null, reasoningOutputTokens: reasoning !== null && reasoning <= outputTokens ? reasoning : null };
}
const blank = (): UsageMetrics => ({ totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 0, modelCalls: 0, recentRequests: [] });
export type ParserState = {
  total: UsageMetrics; byModel: Record<string, UsageMetrics>; recentCalls: UsageCall[];
  dailyTokens: Record<string, number>; dailyUsage: Record<string, UsageMetrics>; minuteTokens: Record<string, number>;
  longContextModels: string[]; previous: TokenBreakdown | null; currentModel: string; serviceTier: string | null;
  sawUsage: boolean; undatedTokens: number;
};
export const newParser = (model: string): ParserState => ({ total: blank(), byModel: {}, recentCalls: [], dailyTokens: {}, dailyUsage: {}, minuteTokens: {}, longContextModels: [], previous: null, currentModel: model, serviceTier: null, sawUsage: false, undatedTokens: 0 });
const add = (target: UsageMetrics, value: TokenBreakdown) => {
  target.totalTokens += value.totalTokens; target.inputTokens += value.inputTokens; target.outputTokens += value.outputTokens;
  target.cachedInputTokens = target.cachedInputTokens === null || value.cachedInputTokens === null ? null : target.cachedInputTokens + value.cachedInputTokens;
  target.reasoningOutputTokens = target.reasoningOutputTokens === null || value.reasoningOutputTokens === null ? null : target.reasoningOutputTokens + value.reasoningOutputTokens;
};
// The persisted state contains counters and settings only, never raw transcript lines.
export function consumeLine(s: ParserState, line: string) {
  let record: any;
  try { record = JSON.parse(line); } catch { return; }
  const settings = record?.type === 'event_msg' && record.payload?.type === 'thread_settings_applied'
    ? record.payload.thread_settings : record?.type === 'world_state' ? record.payload?.state : record?.type === 'turn_context' ? record.payload : null;
  if (settings && Object.hasOwn(settings, 'service_tier')) s.serviceTier = typeof settings.service_tier === 'string' ? settings.service_tier : null;
  if (typeof settings?.model === 'string' && settings.model) {
    if (settings.model !== s.currentModel) s.recentCalls.length = 0;
    s.currentModel = settings.model;
    return;
  }
  if (record?.type === 'compacted' || (record?.type === 'event_msg' && record.payload?.type === 'context_compacted')) { s.recentCalls.length = 0; return; }
  const modelUsage = () => {
    if (!Object.hasOwn(s.byModel, s.currentModel)) Object.defineProperty(s.byModel, s.currentModel, { value: blank(), enumerable: true, configurable: true, writable: true });
    return s.byModel[s.currentModel];
  };
  if (record?.type === 'event_msg' && record.payload?.type === 'task_started') { s.total.turns++; modelUsage().turns++; return; }
  if (record?.type !== 'event_msg' || record.payload?.type !== 'token_count') return;
  const nextTotal = parseUsage(record.payload.info?.total_token_usage);
  const nextLast = parseUsage(record.payload.info?.last_token_usage);
  const nextWindow = counter(record.payload.info?.model_context_window);
  if (nextLast && nextLast.inputTokens > 272_000 && !s.longContextModels.includes(s.currentModel)) s.longContextModels.push(s.currentModel);
  if (nextTotal && nextTotal.totalTokens !== s.previous?.totalTokens) {
    const p = s.previous;
    const reset = !p || nextTotal.totalTokens < p.totalTokens || nextTotal.inputTokens < p.inputTokens || nextTotal.outputTokens < p.outputTokens;
    if (reset) s.recentCalls.length = 0;
    const delta: TokenBreakdown = reset ? nextTotal : {
      totalTokens: nextTotal.totalTokens - p!.totalTokens, inputTokens: nextTotal.inputTokens - p!.inputTokens, outputTokens: nextTotal.outputTokens - p!.outputTokens,
      cachedInputTokens: nextTotal.cachedInputTokens === null || p!.cachedInputTokens === null ? null : nextTotal.cachedInputTokens - p!.cachedInputTokens,
      reasoningOutputTokens: nextTotal.reasoningOutputTokens === null || p!.reasoningOutputTokens === null ? null : nextTotal.reasoningOutputTokens - p!.reasoningOutputTokens
    };
    const recordedAt = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
    if (Number.isFinite(recordedAt)) {
      const day = new Date(recordedAt).toISOString().slice(0, 10), minute = new Date(recordedAt).toISOString().slice(0, 16);
      s.dailyTokens[day] = (s.dailyTokens[day] ?? 0) + delta.totalTokens;
      const dated = s.dailyUsage[day] ||= blank();
      add(dated, delta); dated.modelCalls++;
      s.minuteTokens[minute] = (s.minuteTokens[minute] ?? 0) + delta.totalTokens;
    } else s.undatedTokens += delta.totalTokens;
    const model = modelUsage();
    add(s.total, delta); add(model, delta); s.total.modelCalls++; model.modelCalls++;
    if (nextLast) {
      s.recentCalls.push({ ...nextLast, model: s.currentModel, serviceTier: s.serviceTier, timestamp: Number.isFinite(recordedAt) ? recordedAt : null });
      if (s.recentCalls.length > 12) s.recentCalls.shift();
      s.total.recentRequests.push(nextLast.totalTokens); model.recentRequests.push(nextLast.totalTokens);
      if (s.total.recentRequests.length > 12) s.total.recentRequests.shift();
      if (model.recentRequests.length > 12) model.recentRequests.shift();
    } else s.recentCalls.length = 0;
    s.sawUsage = true;
  }
  if (nextTotal) s.previous = nextTotal;
  if (nextLast) { s.total.last = nextLast; modelUsage().last = nextLast; }
  if (nextWindow !== null) { s.total.modelContextWindow = nextWindow; modelUsage().modelContextWindow = nextWindow; }
}
export const parserUsage = (s: ParserState): Usage | null => s.sawUsage ? { ...s.total, byModel: s.byModel, dailyTokens: s.dailyTokens, dailyUsage: s.dailyUsage, minuteTokens: s.minuteTokens, recentCalls: s.recentCalls, activeModel: s.currentModel, longContextModels: s.longContextModels, undatedTokens: s.undatedTokens } : null;
