import { test, expect } from 'bun:test';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rpc } from '../server/rpc';
import { createDashboard, readGeneratedTitles, readTranscript } from '../server/dashboard';
import { createUsageReader, parseUsage } from '../server/usage';
import { activeProjects, cacheRate, dailyBuckets, projectRollup, sumCacheRate, sumThreadUsage, todayThreads } from '../src/lib/today';
import type { Snapshot, Thread, UsageMetrics } from '../src/lib/types';
import { makeFixture, tokenLine } from './fixture';
import { usagePrompt } from '../server/assistant';
import { tokensOnDay, dailyThreads } from '../src/lib/today';

test('saved stats use the latest cumulative counter, tolerate partial lines, refresh changed files, and keep unknown distinct from zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-usage-'));
  const path = join(root, 'thread.jsonl');
  const read = createUsageReader();
  try {
    await Bun.write(path, [tokenLine(80, 20, 40), tokenLine(800, 200, 600), tokenLine(800, 200, 600), 'null', '{"type":"event_msg","payload":{"type":"token_count"'].join('\n'));
    expect((await read(path)).usage?.totalTokens).toBe(1000);
    expect((await read(path)).usage?.cachedInputTokens).toBe(600);
    expect((await read(path)).usage?.modelContextWindow).toBe(258400);
    await appendFile(path, '\n' + tokenLine(900, 300, 600));
    expect((await read(path)).usage?.totalTokens).toBe(1200);
    await Bun.write(path, tokenLine(0, 0, 0));
    expect((await read(path)).usage?.totalTokens).toBe(0);
    expect((await read(null)).usage).toBeNull();
    expect((await read(join(root, 'missing'))).usageError).toBeTruthy();
    expect(parseUsage({ total_tokens: -1, input_tokens: 0, output_tokens: 0 })).toBeNull();
    expect(parseUsage({ total_tokens: 100, input_tokens: 80, output_tokens: 20, cached_input_tokens: 90 })?.cachedInputTokens).toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('usage deltas stay with the model that produced them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-models-'));
  const path = join(root, 'thread.jsonl');
  const context = (model: string) => JSON.stringify({ type: 'turn_context', payload: { model } });
  try {
    await Bun.write(path, [context('gpt-5.6-sol'), tokenLine(80, 20, 40), context('gpt-5.6-luna'), tokenLine(240, 60, 100)].join('\n'));
    const usage = (await createUsageReader()(path)).usage!;
    expect(usage.totalTokens).toBe(300);
    expect(usage.byModel['gpt-5.6-sol'].totalTokens).toBe(100);
    expect(usage.byModel['gpt-5.6-luna'].totalTokens).toBe(200);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dashboard reads saved threads even when account limits are unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-rpc-'));
  const rpc = new Rpc();
  try {
    const index = join(root, 'session_index.jsonl');
    await Bun.write(index, '{"id":"review","thread_name":"Generated release review"}\n{"id":"broken"');
    const dashboard = createDashboard(rpc, await makeFixture(root), index, join(root, 'cache'));
    await dashboard.refresh();
    expect(dashboard.state.error).toBeNull();
    expect(dashboard.state.threads.length).toBe(4);
    expect(dashboard.state.threads[0].usage?.totalTokens).toBe(264000);
    expect(dashboard.state.threads[0].usage?.last?.totalTokens).toBe(51400);
    expect(dashboard.state.threads[0].usage?.turns).toBe(1);
    expect(dashboard.state.threads[0].usage?.modelCalls).toBe(2);
    expect(dashboard.state.threads[0].usage?.recentRequests).toEqual([18560, 51400]);
    expect(dashboard.state.threads[1].title).toBe('Generated release review');
    expect(dashboard.state.threads[2].title).toBe('Investigate slow workspace indexing');
    expect(dashboard.state.threads[2].usage).toBeNull();
    expect(dashboard.state.threads[0]).not.toHaveProperty('path');
    expect(dashboard.state.threads[0]).not.toHaveProperty('status');
    expect(dashboard.state.limits).toBeNull();
    expect(await dashboard.inspectThread('build')).toBe('');
    expect(await dashboard.inspectThread('missing')).toBeNull();
    await dashboard.refresh();
    expect(dashboard.state.error).toBeNull();
    await expect(rpc.request('thread/list')).rejects.toThrow('not connected');
  } finally { rpc.close(); await rm(root, { recursive: true, force: true }); }
});

test('generated title index ignores invalid lines and empty names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-titles-'));
  const path = join(root, 'session_index.jsonl');
  try {
    await Bun.write(path, '{"id":"a","thread_name":"  Saved name  "}\n{"id":"b","thread_name":""}\n{');
    expect([...await readGeneratedTitles(path)]).toEqual([['a', 'Saved name']]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('thread transcript keeps user and assistant text only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-transcript-'));
  const path = join(root, 'thread.jsonl');
  try {
    await Bun.write(path, [JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Why is this slow?' } }), JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The context is large.' }] } }), tokenLine(10, 2, 4)].join('\n'));
    expect(await readTranscript(path)).toBe('user: Why is this slow?\n\nassistant: The context is large.');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Today selects saved updates by UTC date only', () => {
  const now = Date.parse('2026-09-13T00:01:00Z');
  const threads = [{ id: 'old', updatedAt: (now - 120000) / 1000 }, { id: 'today', updatedAt: (now - 60000) / 1000 }, { id: 'tomorrow', updatedAt: (now + 86400000) / 1000 }] as Thread[];
  expect(todayThreads(threads, now).map(t => t.id)).toEqual(['today']);
  expect(todayThreads(threads, now + 86400000).map(t => t.id)).toEqual(['tomorrow']);
});

test('daily summary adds recorded thread usage', () => {
  const usage = { totalTokens: 100, inputTokens: 80, cachedInputTokens: 60, outputTokens: 20, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 1, modelCalls: 2, recentRequests: [] };
  expect(sumThreadUsage([{ usage }, { usage: { ...usage, cachedInputTokens: null } }, { usage: null }] as Thread[])).toEqual({ total: 200, cached: 60, input: 100, output: 40, calls: 4 });
});

test('daily rankings and coach ignore lifetime size and last update date', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  const metrics = { totalTokens: 100, inputTokens: 80, cachedInputTokens: 60, outputTokens: 20, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 0, modelCalls: 1, recentRequests: [] };
  const old: Thread = { id: 'old', title: 'Old lifetime giant', cwd: '/old', modelProvider: 'openai', updatedAt: 0, usageError: null, usage: { ...metrics, totalTokens: 1_000_000, byModel: {}, dailyTokens: { '2026-09-17': 100 }, dailyUsage: { '2026-09-17': metrics } } };
  const fresh: Thread = { ...old, id: 'fresh', title: 'Daily leader', cwd: '/fresh', usage: { ...old.usage!, totalTokens: 200, dailyTokens: { '2026-09-17': 200 }, dailyUsage: { '2026-09-17': { ...metrics, totalTokens: 200 } } } };
  const daily = dailyThreads([old, fresh], now);
  expect(projectRollup(daily)[0].cwd).toBe('/fresh');
  expect(sumCacheRate(daily)).toBe(75);
  expect(old.usage!.totalTokens).toBe(1_000_000);
  const prompt = usagePrompt('Where did today go?', { threads: [old, fresh], updatedAt: now, error: null, hasMore: false }, now);
  expect(prompt.indexOf('Daily leader')).toBeLessThan(prompt.indexOf('Old lifetime giant'));
  expect(prompt).toContain('Recorded tokens today across all loaded threads: 300');
  expect(prompt).not.toContain('1000000');
});

test('projects follow latest thread activity and appear once', () => {
  const threads = [{ cwd: '/old', updatedAt: 1 }, { cwd: '/new', updatedAt: 3 }, { cwd: '/old', updatedAt: 2 }] as Thread[];
  expect(activeProjects(threads)).toEqual(['/new', '/old']);
});

test('assistant context keeps the costliest today threads first', () => {
  const now = Date.parse('2026-09-13T12:00:00Z');
  const metrics = { totalTokens: 100, inputTokens: 80, cachedInputTokens: 60, outputTokens: 20, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 1, modelCalls: 2, recentRequests: [] };
  const usage = { ...metrics, dailyTokens: { '2026-09-13': 100 }, byModel: { 'gpt-5.4': metrics } };
  const thread = { id: 'a', title: 'Small', cwd: '/a', modelProvider: 'openai', updatedAt: now / 1000, usageError: null, usage };
  const snapshot: Snapshot = { error: null, updatedAt: now, hasMore: false, threads: [thread, { ...thread, id: 'b', title: 'Large', cwd: '/b', usage: { ...usage, totalTokens: 500, dailyTokens: { '2026-09-13': 500 } } }] };
  expect(usagePrompt('What cost most?', snapshot, now).indexOf('Large')).toBeLessThan(usagePrompt('What cost most?', snapshot, now).indexOf('Small'));
});

test('daily buckets order days chronologically and flag today', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');
  const usage = { totalTokens: 500, inputTokens: 400, cachedInputTokens: 300, outputTokens: 100, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 2, modelCalls: 4, recentRequests: [] };
  const day = (offsetDays: number) => (now - offsetDays * 86400000) / 1000;
  const threads = [
    { updatedAt: day(0), usage: { ...usage, dailyTokens: { '2026-09-13': 400, '2026-09-15': 100 } } },
    { updatedAt: day(0), usage: { ...usage, dailyTokens: { '2026-09-15': 500 } } },
    { updatedAt: day(0), usage },
    { updatedAt: day(0), usage: null }
  ] as Thread[];
  const buckets = dailyBuckets(threads, now, 5);
  expect(buckets.map(bucket => [bucket.day, bucket.threads, bucket.tokens, bucket.isToday])).toEqual([
    ['2026-09-13', 1, 400, false],
    ['2026-09-15', 2, 600, true]
  ]);
  expect(dailyBuckets([], now)).toEqual([]);
  expect(dailyBuckets(threads, now, 1)).toHaveLength(1);
  expect(tokensOnDay(threads, now)).toBe(600);
  expect(tokensOnDay(threads.slice(0, 1), now)).toBe(100);
  threads[0].updatedAt = day(-1);
  expect(dailyBuckets(threads, now)).toEqual(buckets);
  expect(tokensOnDay(threads, now)).toBe(600);
});

test('project rollup aggregates tokens per cwd and ranks by weight', () => {
  const usage = { totalTokens: 100, inputTokens: 80, cachedInputTokens: 60, outputTokens: 20, reasoningOutputTokens: 0, last: null, modelContextWindow: null, turns: 1, modelCalls: 2, recentRequests: [] };
  const thread = (cwd: string, tokens: number): Thread => ({ id: cwd, title: cwd, modelProvider: 'openai', updatedAt: 0, usageError: null, cwd, usage: { ...usage, totalTokens: tokens, byModel: {} } });
  const rollup = projectRollup([thread('/x/a', 100), thread('/x/b', 900), thread('/x/a', 50), { cwd: '/x/c' } as Thread], 2);
  expect(rollup.map(row => [row.name, row.tokens, row.threads])).toEqual([['b', 900, 1], ['a', 150, 2]]);
});

test('cache rate stays unknown when counters are missing or zero', () => {
  const metrics = { inputTokens: 80, cachedInputTokens: 60 };
  expect(cacheRate({ ...metrics } as UsageMetrics)).toBe(75);
  expect(cacheRate({ ...metrics, inputTokens: 0 } as UsageMetrics)).toBeNull();
  expect(cacheRate({ ...metrics, cachedInputTokens: null } as UsageMetrics)).toBeNull();
  expect(cacheRate(null)).toBeNull();
  expect(sumCacheRate([{ usage: { ...metrics } }, { usage: { ...metrics, cachedInputTokens: null } }] as Thread[])).toBeNull();
  expect(sumCacheRate([{ usage: { ...metrics } }, { usage: { ...metrics, inputTokens: 20, cachedInputTokens: 20 } }] as Thread[])).toBe(80);
});
