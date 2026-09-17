import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, appendFile, readdir, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsageReader } from '../server/usage';
import { mapConcurrent } from '../server/concurrency';
import { createDashboard } from '../server/dashboard';
import { createViewReader } from '../server/view';
import { usageComparison } from '../src/lib/comparison';
import type { Rpc } from '../server/rpc';
import type { Thread } from '../src/lib/types';
import { tokenLine } from './fixture';

const dated = (input: number, day = '2026-09-17') => JSON.stringify({ ...JSON.parse(tokenLine(input, 20, 10)), timestamp: `${day}T10:00:00Z` });

test('persistent index reuses more than 100 logs and reads only appended bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-index-'));
  try {
    const paths = Array.from({ length: 125 }, (_, i) => join(root, `${i}.jsonl`));
    const cacheDir = join(root, 'cache');
    const reader = createUsageReader({ cacheDir });
    const privateLine = JSON.stringify({ type: 'response_item', payload: { content: 'PRIVATE PROMPT '.repeat(10000) } });
    await mapConcurrent(paths, 8, async path => { await writeFile(path, privateLine + '\n' + dated(100) + '\n'); return reader(path); });
    expect(reader.stats.fullReads).toBe(125);
    const bytes = reader.stats.bytesRead;
    await mapConcurrent(paths, 8, path => reader(path));
    expect(reader.stats.bytesRead).toBe(bytes);
    const restarted = createUsageReader({ cacheDir });
    await mapConcurrent(paths, 8, path => restarted(path));
    expect(restarted.stats.persistentHits).toBe(125);
    expect(restarted.stats.bytesRead).toBe(0);
    await appendFile(paths[0], dated(200) + '\n');
    expect((await restarted(paths[0])).usage?.totalTokens).toBe(220);
    expect(restarted.stats.incrementalReads).toBe(1);
    expect(restarted.stats.bytesRead).toBeLessThan(20000);
    for (const file of await readdir(cacheDir)) expect(await readFile(join(cacheDir, file), 'utf8')).not.toContain('PRIVATE PROMPT');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('incremental results equal full parsing through partial writes, reset, model and tier switches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-tail-'));
  try {
    const path = join(root, 'log.jsonl'), reader = createUsageReader({ cacheDir: join(root, 'cache') });
    await writeFile(path, dated(100));
    await reader(path);
    const next = dated(200);
    for (const chunk of ['\n' + next.slice(0, 60), next.slice(60), '\n', JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-sol', service_tier: 'priority' } }) + '\n', dated(5) + '\n', dated(90, '2026-09-18') + '\n']) {
      await appendFile(path, chunk);
      expect(await reader(path)).toEqual(await createUsageReader()(path));
    }
    const restarted = createUsageReader({ cacheDir: join(root, 'cache') });
    expect(await restarted(path)).toEqual(await createUsageReader()(path));
    expect(restarted.stats.bytesRead).toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('truncated, replaced and corrupt cached logs rebuild safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-rebuild-'));
  try {
    const path = join(root, 'log'), cacheDir = join(root, 'cache'), reader = createUsageReader({ cacheDir });
    await writeFile(path, dated(1000) + '\n'); await reader(path);
    await writeFile(path, dated(1) + '\n'); expect((await reader(path)).usage?.totalTokens).toBe(21);
    await writeFile(join(root, 'replacement'), dated(200) + '\n'); await rename(join(root, 'replacement'), path);
    expect((await reader(path)).usage?.totalTokens).toBe(220);
    for (const file of await readdir(cacheDir)) await writeFile(join(cacheDir, file), '{broken');
    const fresh = createUsageReader({ cacheDir });
    expect((await fresh(path)).usage?.totalTokens).toBe(220);
    expect(fresh.stats.fullReads).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dashboard walks all pages, deduplicates threads, and retains its snapshot on paging failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-pages-'));
  try {
    const path = join(root, 'log'); await writeFile(path, dated(100) + '\n');
    const listed = Array.from({ length: 251 }, (_, i) => ({ id: String(i), path, cwd: root, modelProvider: 'openai', updatedAt: i }));
    let repeated = false, requests = 0;
    const rpc = { connect: async () => {}, close() {}, async request(method: string, params: any) {
      if (method !== 'thread/list') return null;
      requests++;
      const start = Number(params.cursor ?? 0);
      return { data: [...(start ? [listed[0]] : []), ...listed.slice(start, start + 100)], nextCursor: repeated ? '100' : start < 200 ? String(start + 100) : null };
    } } as unknown as Rpc;
    const dashboard = createDashboard(rpc, undefined, join(root, 'titles'), join(root, 'cache'));
    await dashboard.refresh();
    expect(requests).toBe(3); expect(dashboard.state.threads).toHaveLength(251);
    expect(dashboard.state.hasMore).toBe(false); expect(dashboard.progress).toEqual({ phase: 'idle', completed: 251, total: 251 });
    const previous = dashboard.state.threads;
    repeated = true; await dashboard.refresh();
    expect(dashboard.state.error).toContain('repeated'); expect(dashboard.state.threads).toBe(previous);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('server pagination and sorting leave all-history summaries intact and strip historical maps', () => {
  const threads = Array.from({ length: 151 }, (_, i) => ({ id: String(i), title: String(i), cwd: i % 2 ? '/a' : '/b', modelProvider: 'openai', updatedAt: i, usageError: null, usage: { totalTokens: i, dailyTokens: { '2026-09-17': i }, minuteTokens: { '2026-09-17T10:00': i }, byModel: {} } })) as unknown as Thread[];
  const read = createViewReader(), snapshot = { threads, error: null, hasMore: false, updatedAt: 1 };
  const view = read(snapshot, new URLSearchParams('page=2&sort=tokens'), Date.parse('2026-09-17T12:00:00Z'));
  expect(view.pagination).toMatchObject({ total: 151, pages: 4, page: 2 });
  expect(view.threads).toHaveLength(50); expect(view.threads[0].id).toBe('100');
  expect(view.summary.daily).toBe(11325); expect(view.threads[0].usage).not.toHaveProperty('minuteTokens');
  const filtered = read(snapshot, new URLSearchParams('project=/a&page=999'), Date.parse('2026-09-17T12:00:00Z'));
  expect(filtered.pagination).toMatchObject({ page: 2, total: 75 });
  expect(filtered.summary.daily).toBe(5625);
});

test('empty readable logs do not invalidate comparisons, but undated usage does', () => {
  const threads = [{ usage: null, usageError: null }] as Thread[];
  expect(usageComparison(threads, Date.now()).incomplete).toBe(false);
  expect(usageComparison([{ usage: { minuteTokens: {}, undatedTokens: 1 }, usageError: null }] as Thread[], Date.now()).incomplete).toBe(true);
});

test('worker pool limits concurrent reads and preserves input order', async () => {
  let active = 0, peak = 0;
  const result = await mapConcurrent(Array.from({ length: 100 }, (_, i) => i), 8, async i => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, i % 3));
    active--; return i * 2;
  });
  expect(peak).toBe(8);
  expect(result).toEqual(Array.from({ length: 100 }, (_, i) => i * 2));
});

test('a split multibyte record is replayed once, and cache write failures are nonfatal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-unicode-'));
  try {
    const path = join(root, 'log'), cacheDir = join(root, 'not-a-directory');
    await writeFile(cacheDir, 'blocked');
    const reader = createUsageReader({ cacheDir });
    const line = Buffer.from(JSON.stringify({ ...JSON.parse(dated(100)), ignored: '😀' }) + '\n');
    const split = line.indexOf(Buffer.from('😀')) + 2;
    await writeFile(path, line.subarray(0, split));
    expect((await reader(path)).usage).toBeNull();
    await appendFile(path, line.subarray(split));
    expect((await reader(path)).usage?.totalTokens).toBe(120);
    expect((await reader(path)).usage?.modelCalls).toBe(1);
    expect(reader.stats.cacheWriteErrors).toBeGreaterThan(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
