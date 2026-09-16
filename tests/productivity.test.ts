import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countDiffLines, readProductivity } from '../server/productivity';
import { createUsageReader } from '../server/usage';
import { workHistory } from '../src/lib/productivity';
import type { Thread } from '../src/lib/types';
import { tokenLine } from './fixture';

test('diff counts additions and deletions but excludes whitespace, generated and lock files', () => {
  const diff = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,3 @@', '-const x = 1;', '+const x=1;', '-removed();', '+added();', '+another();', 'diff --git a/package-lock.json b/package-lock.json', '+ignore', 'diff --git a/dist/app.js b/dist/app.js', '+ignore', 'diff --git a/src/assets.generated.ts b/src/assets.generated.ts', '+ignore'].join('\n');
  expect(countDiffLines(diff)).toBe(3);
  expect(countDiffLines('')).toBe(0);
});

test('daily tokens use timestamped deltas and ignore duplicate counters across midnight', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-work-'));
  try {
    const record = (input: number, timestamp: string) => ({ ...JSON.parse(tokenLine(input, 0, 0)), timestamp });
    const a = record(100, '2026-09-15T23:59:00Z'), b = record(250, '2026-09-16T00:01:00Z');
    const path = join(root, 'usage.jsonl');
    await Bun.write(path, [a, a, b, b].map(r => JSON.stringify(r)).join('\n'));
    const result = await createUsageReader()(path);
    expect(result.usage?.dailyTokens).toEqual({ '2026-09-15': 100, '2026-09-16': 150 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('work sums project products, not global tokens times global diffs, and deduplicates shared repo lines', () => {
  const project = (cwd: string, root: string, tokens: number, lines: number) => ({ cwd, root, error: null, days: [{ day: '2026-09-16', tokens, lines, work: tokens * lines }] });
  const projects = [project('/a', '/a', 100, 3), project('/a/sub', '/a', 200, 3), project('/b', '/b', 400, 10)];
  expect(workHistory(projects)[0]).toEqual({ day: '2026-09-16', tokens: 700, lines: 13, work: 4900 });
  expect(workHistory(projects, '/a/sub')[0].work).toBe(600);
  expect(workHistory([{ ...projects[0], error: 'unavailable' }])).toEqual([]);
});

test('Git history uses daily net committed displacement, excludes uncommitted edits and supports initial commits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mylimits-work-git-'));
  async function git(args: string[], date = '2026-09-15T10:00:00Z') {
    const p = Bun.spawn(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_EMAIL: 'test@example.test' } });
    await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    expect(await p.exited).toBe(0);
  }
  try {
    await git(['init']);
    await Bun.write(join(root, 'app.ts'), 'one();\n');
    await git(['add', '.']); await git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'initial']);
    await Bun.write(join(root, 'app.ts'), 'two();\n');
    await git(['add', '.']); await git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'same day']);
    await Bun.write(join(root, 'app.ts'), 'three();\n');
    await git(['add', '.']); await git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'next day'], '2026-09-16T10:00:00Z');
    await Bun.write(join(root, 'app.ts'), 'uncommitted();\nextra();\n');
    const threads = [{ cwd: root, usage: { dailyTokens: { '2026-09-15': 100, '2026-09-16': 200 } } }] as unknown as Thread[];
    const result = await readProductivity(threads, Date.parse('2026-09-16T12:00:00Z'));
    expect(result[0].error).toBeNull();
    expect(result[0].days.at(-2)).toEqual({ day: '2026-09-15', tokens: 100, lines: 1, work: 100 });
    expect(result[0].days.at(-1)).toEqual({ day: '2026-09-16', tokens: 200, lines: 2, work: 400 });
    expect(result[0].days).toHaveLength(7);
    const missing = await readProductivity([{ cwd: join(root, 'missing') }] as Thread[]);
    expect(missing[0].error).not.toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});
