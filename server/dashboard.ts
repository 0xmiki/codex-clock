import type { Snapshot, Thread } from '../src/lib/types';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Rpc } from './rpc';
import { createUsageReader } from './usage';
import { readProductivity } from './productivity';
import { parseAccountLimits } from './limits';
import { mapConcurrent } from './concurrency';
import { snapshotCache } from './snapshot-cache';

export async function readGeneratedTitles(path = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'session_index.jsonl')) {
  const titles = new Map<string, string>();
  try {
    for (const line of (await readFile(path, 'utf8')).split('\n')) {
      if (!line) continue;
      try {
        const item = JSON.parse(line);
        if (typeof item.id === 'string' && typeof item.thread_name === 'string' && item.thread_name.trim()) titles.set(item.id, item.thread_name.trim());
      } catch { /* Ignore an incomplete final line. */ }
    }
  } catch { /* Older Codex versions may not have a session index. */ }
  return titles;
}

export async function readTranscript(path: string) {
  let tail = '';
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      const payload = record?.payload;
      const role = payload?.role || (payload?.type === 'user_message' ? 'user' : payload?.type === 'agent_message' ? 'assistant' : null);
      const text = typeof payload?.message === 'string' ? payload.message : Array.isArray(payload?.content) ? payload.content.map((part: any) => part?.text).filter((part: unknown) => typeof part === 'string').join('\n') : '';
      if (role && text.trim()) tail = `${tail}${tail ? '\n\n' : ''}${role}: ${text.trim()}`.slice(-20_000);
    }
  } finally { lines.close(); input.destroy(); }
  // ponytail: the tail gives enough evidence without spending the user's limit on an entire huge transcript.
  return tail;
}

export function createDashboard(rpc: Rpc, executable?: string, sessionIndexPath?: string, cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'codex-clock', 'usage-v1')) {
  const state: Snapshot = { error: null, updatedAt: null, threads: [], hasMore: true };
  const readUsage = createUsageReader({ cacheDir });
  const progress = { phase: 'idle', completed: 0, total: 0 };
  const paths = new Map<string, string>();
  const saved = snapshotCache(cacheDir, JSON.stringify([process.env.CODEX_HOME || join(homedir(), '.codex'), executable || 'codex', sessionIndexPath || '']));
  const ready = saved.read().then(value => {
    if (!value) return;
    Object.assign(state, value.snapshot, { stale: true, productivityPending: false });
    for (const [id, path] of value.paths) paths.set(id, path);
  });
  let refreshing: Promise<void> | undefined;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      progress.phase = 'listing'; progress.completed = 0; progress.total = 0;
      await ready;
      state.stale = Boolean(state.updatedAt);
      let allowance: Promise<void> | undefined;
      try {
        await rpc.connect({ executable });
        // Allowance is independent of saved history; do not hold up thread discovery.
        allowance = rpc.request('account/rateLimits/read').then(value => { state.limits = parseAccountLimits(value); }).catch(() => { state.limits = null; });
        type Listed = { id: string; name?: string | null; preview?: string | null; cwd: string; model?: string | null; modelProvider: string; updatedAt: number; parentThreadId?: string | null; path?: string | null };
        const listed = new Map<string, Listed>();
        const cursors = new Set<string>();
        const generatedTitles = await readGeneratedTitles(sessionIndexPath);
        const threads: Thread[] = [];
        const nextPaths = new Map<string, string>();
        const cold = !state.updatedAt;
        let cursor: string | null = null;
        do {
          progress.phase = 'listing';
          const page: { data: Listed[]; nextCursor: string | null } = await rpc.request('thread/list', { limit: 100, cursor, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'unknown'] });
          const batch = page.data.filter(thread => { if (listed.has(thread.id)) return false; listed.set(thread.id, thread); return true; });
          progress.total = listed.size;
          cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error('Codex returned a repeated history cursor. Refresh to retry.');
          if (cursor) cursors.add(cursor);
          progress.phase = 'indexing';
          threads.push(...await mapConcurrent(batch, 8, async t => {
            const stats = await readUsage(t.path, t.model || t.modelProvider);
            const promptTitle = t.preview?.trim().replace(/\s+/g, ' ');
            progress.completed++;
            if (t.path) nextPaths.set(t.id, t.path);
            return { id: t.id, title: t.name?.trim() || generatedTitles.get(t.id) || (promptTitle && `${promptTitle.slice(0, 48)}${promptTitle.length > 48 ? '…' : ''}`) || 'Untitled thread', cwd: t.cwd, model: t.model, modelProvider: t.modelProvider, updatedAt: t.updatedAt, parentThreadId: t.parentThreadId, ...stats };
          }));
          if (cold) {
            state.threads = [...threads]; state.hasMore = true;
            for (const [id, path] of nextPaths) paths.set(id, path);
          }
        } while (cursor);
        paths.clear();
        for (const [id, path] of nextPaths) paths.set(id, path);
        readUsage.prune(new Set(paths.values()));
        state.threads = threads; state.hasMore = false;
        state.error = null; state.updatedAt = Date.now(); state.stale = false;
        state.productivityPending = true;
        await saved.save(state, paths);
        progress.phase = 'productivity';
        const productivity = await readProductivity(threads);
        state.productivity = productivity;
        state.productivityPending = false;
      } catch (error) { state.error = error instanceof Error ? error.message : String(error); }
      finally {
        if (!state.error) progress.phase = 'allowance';
        await allowance;
        if (!state.error) await saved.save(state, paths);
        rpc.close(); progress.phase = 'idle';
      }
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  }
  return { state, ready, refresh, progress, indexStats: readUsage.stats, inspectThread: async (reference: string) => {
    await ready;
    const matches = [...paths.keys()].filter(id => id === reference || id.startsWith(reference));
    return matches.length === 1 ? readTranscript(paths.get(matches[0])!) : null;
  } };
}
