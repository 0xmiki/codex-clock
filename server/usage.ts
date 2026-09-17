import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, mkdir, rename, writeFile, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { consumeLine, newParser, parserUsage, type ParserState } from './usage-parser';
import type { Usage } from '../src/lib/types';
export { parseUsage } from './usage-parser';

const SCHEMA = 1;
type Entry = { schema: number; model: string; size: number; mtime: number; ctime: number; ino: number; dev: number; birth: number; offset: number; guard: string; state: ParserState; tailState?: ParserState };
type Result = { usage: Usage | null; usageError: string | null };
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function createUsageReader(options: { cacheDir?: string | null } = {}) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<Result>>();
  const stats = { bytesRead: 0, fullReads: 0, incrementalReads: 0, cacheHits: 0, persistentHits: 0, cacheWriteErrors: 0 };
  // Detect truncation, replacement, and changes at append boundaries before reusing counters.
  async function guard(file: FileHandle, offset: number) {
    const hash = createHash('sha256');
    for (const [position, length] of [[0, Math.min(4096, offset)], [Math.max(0, offset - 4096), Math.min(4096, offset)]]) {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, position);
      stats.bytesRead += bytesRead;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  }
  async function load(path: string): Promise<Entry | undefined> {
    if (!options.cacheDir) return;
    try {
      const envelope = JSON.parse(await readFile(join(options.cacheDir, digest(path) + '.json'), 'utf8'));
      const e = envelope.entry as Entry;
      if (e.schema !== SCHEMA || !e.state?.total || !e.state?.minuteTokens || !Array.isArray(e.state.recentCalls) || !Number.isSafeInteger(e.offset) || e.offset < 0 || e.offset > e.size || digest(JSON.stringify(e)) !== envelope.checksum) return;
      stats.persistentHits++;
      return e;
    } catch { return; }
  }
  async function save(path: string, entry: Entry) {
    if (!options.cacheDir) return;
    const target = join(options.cacheDir, digest(path) + '.json'), temporary = target + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(options.cacheDir, { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify({ entry, checksum: digest(JSON.stringify(entry)) }), { mode: 0o600 });
      await rename(temporary, target);
    } catch { stats.cacheWriteErrors++; await unlink(temporary).catch(() => {}); }
  }
  async function read(path: string, model: string): Promise<Result> {
    let file: FileHandle | undefined;
    try {
      file = await open(path, 'r');
      const info = await file.stat();
      if (!info.isFile()) throw new Error('Not a file');
      const saved = cache.get(path) ?? await load(path);
      const identity = saved && saved.model === model && saved.ino === info.ino && saved.dev === info.dev && saved.birth === info.birthtimeMs;
      if (identity && saved.size === info.size && saved.mtime === info.mtimeMs && saved.ctime === info.ctimeMs) {
        stats.cacheHits++; cache.set(path, saved);
        return { usage: parserUsage(saved.tailState ?? saved.state), usageError: null };
      }
      const append = identity && info.size > saved.size && await guard(file, saved.offset) === saved.guard;
      const state = append ? structuredClone(saved.state) : newParser(model);
      let offset = append ? saved.offset : 0;
      if (append) stats.incrementalReads++; else stats.fullReads++;
      let position = offset;
      let chunks: Buffer[] = [], length = 0;
      // Snapshot the file size. Concurrent appends are picked up on the next refresh.
      while (position < info.size) {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, info.size - position));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        if (!bytesRead) throw new Error('File changed while reading');
        stats.bytesRead += bytesRead;
        let start = 0, newline: number;
        while ((newline = buffer.indexOf(10, start)) >= 0 && newline < bytesRead) {
          const part = buffer.subarray(start, newline);
          const line = chunks.length ? Buffer.concat([...chunks, part], length + part.length) : part;
          consumeLine(state, line.toString('utf8'));
          chunks = []; length = 0; start = newline + 1;
          offset = position + start;
        }
        if (start < bytesRead) { const part = buffer.subarray(start, bytesRead); chunks.push(part); length += part.length; }
        position += bytesRead;
      }
      // A valid last line without a newline is visible, but not committed to the
      // append position. Replay it next time, so partial writes never double count.
      let tailState: ParserState | undefined;
      if (length) { tailState = structuredClone(state); consumeLine(tailState, Buffer.concat(chunks, length).toString('utf8')); }
      const after = await file.stat();
      if (after.size < info.size || (after.size === info.size && after.mtimeMs !== info.mtimeMs)) throw new Error('File changed while reading');
      const entry: Entry = { schema: SCHEMA, model, size: info.size, mtime: info.mtimeMs, ctime: info.ctimeMs, ino: info.ino, dev: info.dev, birth: info.birthtimeMs, offset, guard: await guard(file, offset), state, ...(tailState ? { tailState } : {}) };
      cache.set(path, entry);
      await save(path, entry);
      return { usage: parserUsage(tailState ?? state), usageError: null };
    } catch {
      cache.delete(path);
      return { usage: null, usageError: 'Saved usage could not be read. Check local file permissions and refresh.' };
    } finally { await file?.close(); }
  }
  const reader = (path: string | null | undefined, model = 'unknown'): Promise<Result> => {
    if (!path) return Promise.resolve({ usage: null, usageError: 'No saved usage file available.' });
    const key = `${path}\0${model}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const work = read(path, model).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
  return Object.assign(reader, { stats, prune(paths: Set<string>) { for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path); } });
}
