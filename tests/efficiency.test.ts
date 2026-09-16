import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { burnGrade, callCost, gradeThreads, workflowGrades } from '../src/lib/efficiency';
import type { Thread, UsageCall } from '../src/lib/types';
import { createUsageReader } from '../server/usage';
import { tokenLine } from './fixture';
import { usagePrompt } from '../server/assistant';

function thread(input: number, cached: number | null, model = 'gpt-5.5', output = 2_000): Thread {
  const call: UsageCall = { model, timestamp: 1_700_000_000_000, totalTokens: input + output, inputTokens: input, cachedInputTokens: cached, outputTokens: output, reasoningOutputTokens: 1_000 };
  return { id: 'test', title: 'Test', cwd: '/test', model, modelProvider: 'openai', updatedAt: 0, usageError: null,
    usage: { ...call, last: call, turns: 5, modelCalls: 5, modelContextWindow: 258400, recentRequests: [], byModel: {}, activeModel: model, recentCalls: Array.from({ length: 5 }, () => ({ ...call })) } };
}

// Every normal peer costs $0.10/call, with a distinct identity.
function peers(count = 5) { return Array.from({ length: count }, (_, i) => ({ ...thread(20_000, 0, 'gpt-5.5', 0), id: `peer-${i}`, updatedAt: i })); }
function grade(t: Thread, others = peers()) {
  const result = gradeThreads([t, ...others]).get(t.id)!;
  if (!result.available) throw new Error(result.reason);
  return result;
}

test('usage grade is the last-five-call cost divided by normal, with exact band boundaries', () => {
  for (const [ratio, expected] of [[1, 'A'], [1.0001, 'B'], [1.5, 'B'], [1.5001, 'C'], [2, 'C'], [2.0001, 'D'], [3, 'D'], [3.0001, 'F']] as const) expect(burnGrade(ratio)).toBe(expected);
  expect(grade(thread(20_000, 0, 'gpt-5.5', 0)).grade).toBe('A');
  const heavy = grade(thread(80_000, 0, 'gpt-5.5', 0));
  expect(heavy.grade).toBe('F');
  expect(heavy.normalCost).toBeCloseTo(.10);
  expect(heavy.costRatio).toBeCloseTo(4);
  expect(heavy.baselineThreads).toBe(5);
});

test('model pricing, caching and output contribute to the same burn multiplier', () => {
  const luna = grade(thread(80_000, 40_000, 'gpt-5.6-luna', 0));
  const astra = grade(thread(80_000, 40_000, 'gpt-6-astra', 0));
  expect(astra.costRatio).toBeCloseTo(luna.costRatio * 50);
  expect(luna.grade).toBe('A');
  expect(astra.grade).toBe('F');
  expect(grade(thread(80_000, 0)).costRatio).toBeGreaterThan(grade(thread(80_000, 70_000)).costRatio);
  expect(grade(thread(20_000, 0, 'gpt-5.5', 10_000)).costRatio).toBeGreaterThan(grade(thread(20_000, 0)).costRatio);
  expect(callCost('gpt-6-astra', 100_000, 95_000, 2_000)).toEqual({ low: .245, high: .2575 });
});

test('unknown or insufficient evidence remains ungraded', () => {
  const available = (t: Thread) => gradeThreads([t, ...peers()]).get(t.id)!.available;
  expect(available(thread(100_000, null))).toBe(false);
  expect(available(thread(100_000, 0, 'unknown'))).toBe(false);
  expect(available(thread(272_001, 0))).toBe(false);
  const short = thread(100_000, 0);
  short.usage!.recentCalls!.pop();
  expect(available(short)).toBe(false);
  delete short.usage!.recentCalls;
  expect(available(short)).toBe(false);
  expect(callCost('__proto__', 10, 0, 0)).toBeNull();
  const previouslyLong = thread(100_000, 95_000);
  previouslyLong.usage!.longContextModels = ['gpt-5.5'];
  expect(available(previouslyLong)).toBe(false);
  const t = thread(20_000, 0);
  expect(gradeThreads([t, ...peers(4)]).get(t.id)!.available).toBe(false);
  const zero = peers().map(p => ({ ...thread(0, 0, 'gpt-5.5', 0), id: p.id }));
  expect(gradeThreads([t, ...zero]).get(t.id)!.available).toBe(false);
});

test('grade uses recent behavior and never averages across model changes', () => {
  const t = thread(100_000, 95_000);
  const original = grade(t);
  t.usage!.inputTokens = 100_000_000;
  t.usage!.cachedInputTokens = 0;
  expect(grade(t)).toEqual(original);
  t.usage!.activeModel = 'gpt-6-astra';
  expect(gradeThreads([t, ...peers()]).get(t.id)!.available).toBe(false);
  t.usage!.recentCalls!.push({ ...t.usage!.recentCalls![0], model: 'gpt-6-astra' });
  expect(gradeThreads([t, ...peers()]).get(t.id)!.available).toBe(false);
});

test('baseline excludes the subject, weights each peer equally and resists an outlier', () => {
  const t = thread(80_000, 0, 'gpt-5.5', 0);
  const normal = peers();
  const outlier = { ...thread(200_000, 0), id: 'outlier' };
  outlier.usage!.modelCalls = 100_000;
  const result = grade(t, [...normal, outlier]);
  expect(result.normalCost).toBeCloseTo(.1);
  expect(result.costRatio).toBeCloseTo(4);
  // Duplicate copies cannot inflate the eligible peer count.
  expect(gradeThreads([t, ...Array(5).fill(normal[0])]).get(t.id)!.available).toBe(false);
  const uneven = peers().map((p, i) => ({ ...thread((i + 1) * 20_000, 0, 'gpt-5.5', 0), id: p.id }));
  expect(grade(t, uneven).normalCost).toBeCloseTo(.3);
  expect(grade(t, [...uneven, { ...thread(120_000, 0, 'gpt-5.5', 0), id: 'sixth' }]).normalCost).toBeCloseTo(.35);
});

test('baseline uses the newest 30 eligible peers and is independent of input order', () => {
  const t = thread(80_000, 0, 'gpt-5.5', 0);
  const recent = peers(30);
  const old = Array.from({ length: 40 }, (_, i) => ({ ...thread(200_000, 0), id: `old-${i}`, updatedAt: -1 }));
  const result = grade(t, [...old, ...recent]);
  expect(result.baselineThreads).toBe(30);
  expect(result.normalCost).toBeCloseTo(.1);
  expect(grade(t, [...recent, ...old].reverse())).toEqual(result);
});

test('only the last five calls affect the grade', () => {
  const t = thread(20_000, 0, 'gpt-5.5', 0);
  t.usage!.recentCalls!.unshift(...thread(200_000, 0).usage!.recentCalls!);
  expect(grade(t).costRatio).toBeCloseTo(1);
});

test('filtered workflow summaries use the complete snapshot baseline', () => {
  const t = thread(80_000, 0, 'gpt-5.5', 0);
  const results = gradeThreads([t, ...peers()]);
  expect(workflowGrades([t], results)).toEqual({ counts: { A: 0, B: 0, C: 0, D: 0, F: 1 }, available: 1, total: 1 });
  expect(results.get(t.id)).toEqual(grade(t));
});

test('parser preserves bounded call breakdowns, timestamps, deduplication and resets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-efficiency-'));
  const path = join(root, 'usage.jsonl');
  const context = (model: string) => JSON.stringify({ type: 'turn_context', payload: { model } });
  const record = (n: number) => {
    const value = JSON.parse(tokenLine(n * 10_000, n * 100, n * 8_000, 0, 10_000, 100));
    value.timestamp = '2026-09-16T12:00:00Z';
    return JSON.stringify(value);
  };
  const read = createUsageReader();
  try {
    const lines = [context('gpt-5.5'), ...Array.from({ length: 15 }, (_, i) => record(i + 1)), record(15)];
    await Bun.write(path, lines.join('\n'));
    let usage = (await read(path)).usage!;
    expect(usage.recentCalls).toHaveLength(12);
    expect(usage.recentCalls![0]).toMatchObject({ model: 'gpt-5.5', timestamp: Date.parse('2026-09-16T12:00:00Z'), inputTokens: 10_000, outputTokens: 100 });
    expect(usage.modelCalls).toBe(15);
    lines.push(context('gpt-6-astra'), record(16));
    await Bun.write(path, lines.join('\n'));
    usage = (await read(path)).usage!;
    expect(usage.activeModel).toBe('gpt-6-astra');
    expect(usage.recentCalls).toHaveLength(1);
    lines.push(JSON.stringify({ type: 'compacted', payload: {} }), record(17));
    await Bun.write(path, lines.join('\n'));
    expect((await read(path)).usage!.recentCalls).toHaveLength(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('coach receives the selected thread and its efficiency evidence', () => {
  const selected = thread(80_000, 0, 'gpt-5.5', 0);
  const prompt = usagePrompt('Review grade', { threads: [selected, ...peers()], updatedAt: 0, error: null, hasMore: false }, Date.now(), null, selected.id);
  expect(prompt).toContain('Selected thread:');
  expect(prompt).toContain('"grade":"F"');
  expect(prompt).toContain('"costRatio":4');
  expect(prompt).toContain('efficiency');
  expect(prompt).not.toContain('restartForecast');
});
