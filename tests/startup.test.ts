import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDashboard } from '../server/dashboard';
import { snapshotCache } from '../server/snapshot-cache';
import { createViewReader } from '../server/view';
import type { Rpc } from '../server/rpc';
import { tokenLine } from './fixture';

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; };

test('cold startup publishes a partial page before later pages and allowance finish', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-startup-'));
  const second = deferred<void>(), allowance = deferred<null>(), reachedSecond = deferred<void>();
  try {
    const path = join(root, 'log'); await writeFile(path, tokenLine(100, 20, 10));
    const thread = (id: string) => ({ id, path, cwd: root, modelProvider: 'openai', updatedAt: 1 });
    const rpc = { connect: async () => {}, close() {}, async request(method: string, params: any) {
      if (method === 'account/rateLimits/read') return allowance.promise;
      if (!params.cursor) return { data: [thread('first')], nextCursor: 'second' };
      reachedSecond.resolve(); await second.promise;
      return { data: [thread('second')], nextCursor: null };
    } } as unknown as Rpc;
    const dashboard = createDashboard(rpc, undefined, join(root, 'titles'), join(root, 'cache'));
    const refreshing = dashboard.refresh();
    await reachedSecond.promise;
    expect(dashboard.state.threads).toHaveLength(1);
    expect(dashboard.state.hasMore).toBe(true);
    expect(dashboard.state.updatedAt).toBeNull();
    expect(createViewReader()(dashboard.state).summary.comparison.incomplete).toBe(true);
    second.resolve();
    // History completes independently of a slow quota request.
    for (let i = 0; i < 100 && dashboard.state.hasMore; i++) await new Promise(r => setTimeout(r,5));
    expect(dashboard.state.hasMore).toBe(false);
    expect(dashboard.state.threads).toHaveLength(2);
    expect(dashboard.progress.phase).not.toBe('idle');
    allowance.resolve(null); await refreshing;
    expect(dashboard.state.error).toBeNull();
  } finally { second.resolve(); allowance.resolve(null); await rm(root, { recursive: true, force: true }); }
});

test('restart restores a complete snapshot without RPC and retains it if refresh fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-restart-'));
  try {
    const path = join(root, 'log'); await writeFile(path, tokenLine(100,20,10));
    const rpc = { connect: async () => {}, close() {}, async request(method: string) {
      return method === 'thread/list' ? { data: [{ id: 'one', path, cwd: root, modelProvider: 'openai', updatedAt: 1 }], nextCursor: null } : null;
    } } as unknown as Rpc;
    const cacheDir = join(root, 'cache'), titles = join(root, 'titles');
    const first = createDashboard(rpc, undefined, titles, cacheDir);
    await first.refresh();
    let calls = 0;
    const offline = { connect: async () => { calls++; throw new Error('offline'); }, close() {} } as unknown as Rpc;
    const restarted = createDashboard(offline, undefined, titles, cacheDir);
    await restarted.ready;
    expect(calls).toBe(0);
    expect(restarted.state.threads).toEqual(first.state.threads);
    expect(restarted.state.stale).toBe(true);
    expect(restarted.state.hasMore).toBe(false);
    expect(await restarted.inspectThread('one')).toBe('');
    await restarted.refresh();
    expect(restarted.state.error).toBe('offline');
    expect(restarted.state.threads).toHaveLength(1);
    expect(restarted.state.stale).toBe(true);
    const different = createDashboard(offline, 'another-codex', titles, cacheDir);
    await different.ready;
    expect(different.state.threads).toHaveLength(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('snapshot cache ignores corrupt data and never saves incomplete history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-snapshot-'));
  try {
    const cache = snapshotCache(root, 'test');
    const snapshot = { error: null, updatedAt: 1, threads: [], hasMore: true };
    await cache.save(snapshot, new Map());
    expect(await cache.read()).toBeNull();
    snapshot.hasMore = false;
    await cache.save(snapshot, new Map());
    expect((await cache.read())?.snapshot.updatedAt).toBe(1);
    const files = await readdir(root);
    await writeFile(join(root, files[0]), '{bad json');
    expect(await cache.read()).toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});
