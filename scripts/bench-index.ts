// Run under Node: bun build scripts/bench-index.ts --target=node --outfile=/tmp/clock-bench.mjs && node /tmp/clock-bench.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUsageReader } from '../server/usage';
import { createViewReader } from '../server/view';
import { mapConcurrent } from '../server/concurrency';
import type { Thread } from '../src/lib/types';

const root = await mkdtemp(join(tmpdir(), 'clock-bench-'));
const count = 2000;
const context = JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-sol', service_tier: 'default' } }) + '\n';
const token = (n: number) => JSON.stringify({ type: 'event_msg', timestamp: new Date(Date.UTC(2026, 8, 1) + n * 60000).toISOString(), payload: { type: 'token_count', info: { total_token_usage: { total_tokens: n * 120, input_tokens: n * 100, output_tokens: n * 20, cached_input_tokens: n * 80 }, last_token_usage: { total_tokens: 120, input_tokens: 100, output_tokens: 20, cached_input_tokens: 80 } } } }) + '\n';
const response = JSON.stringify({ type: 'response_item', payload: { content: [{ text: 'x'.repeat(8192) }] } }) + '\n';
const log = context + Array.from({ length: 32 }, (_, i) => response + token(i + 1)).join('');
try {
  const paths = Array.from({ length: count }, (_, i) => join(root, `${i}.jsonl`));
  await mapConcurrent(paths, 8, path => writeFile(path, log));
  const big = join(root, 'large.jsonl');
  await writeFile(big, context);
  const block = response.repeat(128);
  for (let i = 0; i < 64; i++) await appendFile(big, block);
  await appendFile(big, token(32)); paths.push(big);
  console.log(JSON.stringify({ runtime: process.version, files: paths.length, logMB: (count * Buffer.byteLength(log) + 64 * Buffer.byteLength(block)) / 1e6 }));
  const options = { cacheDir: join(root, 'cache') };
  let reader = createUsageReader(options);
  async function scan(label: string) {
    const before = reader.stats.bytesRead, start = performance.now();
    const results = await mapConcurrent(paths, 8, path => reader(path));
    assert(results.every(r => !r.usageError));
    console.log(JSON.stringify({ label, ms: Math.round(performance.now() - start), logMBRead: (reader.stats.bytesRead - before) / 1e6 }));
    return results;
  }
  const results = await scan('first index');
  await scan('unchanged refresh');
  reader = createUsageReader(options);
  await scan('restart with persisted cache');
  await appendFile(big, token(33));
  const appended = await scan('one append');
  assert.equal(appended.at(-1)!.usage?.totalTokens, 3960);
  const threads: Thread[] = results.map((stats, i) => ({ id: String(i), title: `Thread ${i}`, cwd: `/project/${i % 20}`, modelProvider: 'openai', updatedAt: i, ...stats }));
  const start = performance.now();
  const view = createViewReader()({ threads, error: null, hasMore: false, updatedAt: Date.now() }, undefined, Date.UTC(2026, 8, 17));
  console.log(JSON.stringify({ label: 'summaries, grades and first page', ms: Math.round(performance.now() - start), payloadKB: Buffer.byteLength(JSON.stringify(view)) / 1000, rows: view.threads.length, total: view.pagination.total }));
  assert.equal(view.threads.length, 50); assert.equal(reader.stats.fullReads, 0);
} finally { await rm(root, { recursive: true, force: true }); }
