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
  const messages: string[] = [];
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      const payload = record?.payload;
      const role = payload?.role || (payload?.type === 'user_message' ? 'user' : payload?.type === 'agent_message' ? 'assistant' : null);
      const text = typeof payload?.message === 'string' ? payload.message : Array.isArray(payload?.content) ? payload.content.map((part: any) => part?.text).filter((part: unknown) => typeof part === 'string').join('\n') : '';
      if (role && text.trim()) messages.push(`${role}: ${text.trim()}`);
    }
  } finally { lines.close(); input.destroy(); }
  // ponytail: the tail gives enough evidence without spending the user's limit on an entire huge transcript.
  return messages.join('\n\n').slice(-20_000);
}

export function createDashboard(rpc: Rpc, executable?: string, sessionIndexPath?: string) {
  const state: Snapshot = { error: null, updatedAt: null, threads: [], hasMore: false };
  const readUsage = createUsageReader();
  const paths = new Map<string, string>();
  let refreshing: Promise<void> | undefined;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      state.limits = null;
      try {
        await rpc.connect({ executable });
        // Account lookup failure must not prevent saved thread statistics loading.
        try { state.limits = parseAccountLimits(await rpc.request('account/rateLimits/read')); }
        catch { state.limits = null; }
        // ponytail: newest 100 saved threads; paginate when users need deeper history.
        const listed = await rpc.request<{ data: Array<{ id: string; name?: string | null; preview?: string | null; cwd: string; model?: string | null; modelProvider: string; updatedAt: number; parentThreadId?: string | null; path?: string | null }>; nextCursor: string | null }>('thread/list', { limit: 100, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'unknown'] });
        const generatedTitles = await readGeneratedTitles(sessionIndexPath);
        const threads: Thread[] = [];
        paths.clear();
        for (const t of listed.data) {
          const stats = await readUsage(t.path, t.model || t.modelProvider);
          const promptTitle = t.preview?.trim().replace(/\s+/g, ' ');
          threads.push({ id: t.id, title: t.name?.trim() || generatedTitles.get(t.id) || (promptTitle && `${promptTitle.slice(0, 48)}${promptTitle.length > 48 ? '…' : ''}`) || 'Untitled thread', cwd: t.cwd, model: t.model, modelProvider: t.modelProvider, updatedAt: t.updatedAt, parentThreadId: t.parentThreadId, ...stats });
          if (t.path) paths.set(t.id, t.path);
        }
        state.threads = threads;
        state.productivity = await readProductivity(threads);
        state.hasMore = Boolean(listed.nextCursor);
        state.error = null; state.updatedAt = Date.now();
      } catch (error) { state.error = error instanceof Error ? error.message : String(error); }
      finally { rpc.close(); }
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  }
  return { state, refresh, inspectThread: async (reference: string) => {
    const matches = [...paths.keys()].filter(id => id === reference || id.startsWith(reference));
    return matches.length === 1 ? readTranscript(paths.get(matches[0])!) : null;
  } };
}
