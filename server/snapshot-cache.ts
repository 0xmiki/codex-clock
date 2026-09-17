import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Snapshot } from '../src/lib/types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function snapshotCache(directory: string, identity: string) {
  const path = join(directory, `dashboard-${hash(identity)}.json`);
  return {
    async read(): Promise<{ snapshot: Snapshot; paths: [string, string][] } | null> {
      try {
        const envelope = JSON.parse(await readFile(path, 'utf8'));
        const value = envelope.value;
        if (value?.version !== 1 || hash(JSON.stringify(value)) !== envelope.checksum || !Array.isArray(value.snapshot?.threads) || !Array.isArray(value.paths) || !Number.isFinite(value.snapshot.updatedAt) || value.snapshot.hasMore) return null;
        return value;
      } catch { return null; }
    },
    async save(snapshot: Snapshot, paths: Map<string, string>) {
      if (!snapshot.updatedAt || snapshot.hasMore) return;
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        const value = { version: 1, snapshot: { ...snapshot, error: null }, paths: [...paths] };
        const json = JSON.stringify({ value, checksum: hash(JSON.stringify(value)) });
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, json, { mode: 0o600 });
        await rename(temporary, path);
      } catch { await unlink(temporary).catch(() => {}); }
    }
  };
}
