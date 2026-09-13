import { test, expect } from 'bun:test';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rpc } from '../server/rpc';
import { createDashboard, readGeneratedTitles } from '../server/dashboard';
import { createUsageReader, parseUsage } from '../server/usage';
import { sumThreadUsage, todayThreads } from '../src/lib/today';
import type { Thread } from '../src/lib/types';
import { makeFixture, tokenLine } from './fixture';

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

test('dashboard reads saved thread metadata and logs without any live or account methods', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-rpc-'));
  const rpc = new Rpc();
  try {
    const index = join(root, 'session_index.jsonl');
    await Bun.write(index, '{"id":"review","thread_name":"Generated release review"}\n{"id":"broken"');
    const dashboard = createDashboard(rpc, await makeFixture(root), index);
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
    expect(dashboard.state).not.toHaveProperty('limits');
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
