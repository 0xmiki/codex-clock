import type { Snapshot, Thread } from '../src/lib/types';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Rpc } from './rpc';
import { createUsageReader } from './usage';

export async function readGeneratedTitles(path = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'session_index.jsonl')) {
  const titles = new Map<string, string>();
  try {
    for (const line of (await Bun.file(path).text()).split('\n')) {
      if (!line) continue;
      try {
        const item = JSON.parse(line);
        if (typeof item.id === 'string' && typeof item.thread_name === 'string' && item.thread_name.trim()) titles.set(item.id, item.thread_name.trim());
      } catch { /* Ignore an incomplete final line. */ }
    }
  } catch { /* Older Codex versions may not have a session index. */ }
  return titles;
}

export function createDashboard(rpc: Rpc, executable?: string, sessionIndexPath?: string) {
  const state: Snapshot = { error: null, updatedAt: null, threads: [], hasMore: false };
  const readUsage = createUsageReader();
  let refreshing: Promise<void> | undefined;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        await rpc.connect({ executable });
        // ponytail: newest 100 saved threads; paginate when users need deeper history.
        const listed = await rpc.request<{ data: Array<{ id: string; name?: string | null; preview?: string | null; cwd: string; model?: string | null; modelProvider: string; updatedAt: number; parentThreadId?: string | null; path?: string | null }>; nextCursor: string | null }>('thread/list', { limit: 100, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'unknown'] });
        const generatedTitles = await readGeneratedTitles(sessionIndexPath);
        const threads: Thread[] = [];
        for (const t of listed.data) {
          const stats = await readUsage(t.path);
          const promptTitle = t.preview?.trim().replace(/\s+/g, ' ');
          threads.push({ id: t.id, title: t.name?.trim() || generatedTitles.get(t.id) || (promptTitle && `${promptTitle.slice(0, 48)}${promptTitle.length > 48 ? '…' : ''}`) || 'Untitled thread', cwd: t.cwd, model: t.model, modelProvider: t.modelProvider, updatedAt: t.updatedAt, parentThreadId: t.parentThreadId, ...stats });
        }
        state.threads = threads;
        state.hasMore = Boolean(listed.nextCursor);
        state.error = null; state.updatedAt = Date.now();
      } catch (error) { state.error = error instanceof Error ? error.message : String(error); }
      finally { rpc.close(); }
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  }
  return { state, refresh };
}
