import type { Thread, WorkProject } from '../src/lib/types';
import { spawn } from 'node:child_process';
import { mapConcurrent } from './concurrency';

export const excludedWorkFile = (path: string) => /(^|\/)(node_modules|vendor|dist|build|coverage|\.svelte-kit|generated)(\/|$)|(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$|\.(min\.(js|css)|map)$|(^|\/)[^/]*generated[^/]*$/i.test(path);

export function countDiffLines(diff: string): number {
  let path = '', added: string[] = [], removed: string[] = [], count = 0;
  const flush = () => {
    if (!excludedWorkFile(path)) {
      // Matching normalized lines cancel whitespace-only changes and moved lines.
      const balance = new Map<string, number>();
      for (const line of added) { const key = line.replace(/\s/g, ''); if (key) balance.set(key, (balance.get(key) ?? 0) + 1); }
      for (const line of removed) { const key = line.replace(/\s/g, ''); if (key) balance.set(key, (balance.get(key) ?? 0) - 1); }
      count += [...balance.values()].reduce((sum, n) => sum + Math.abs(n), 0);
    }
    added = []; removed = [];
  };
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) { flush(); path = line.slice(line.lastIndexOf(' b/') + 3); }
    else if (line.startsWith('+') && !line.startsWith('+++')) added.push(line.slice(1));
    else if (line.startsWith('-') && !line.startsWith('---')) removed.push(line.slice(1));
  }
  flush();
  return count;
}

async function git(cwd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' } });
    const timer = setTimeout(() => child.kill(), 10_000);
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('Git history unavailable'));
      else resolve(stdout.trimEnd());
    });
  });
}

export async function readProductivity(threads: Thread[], now = Date.now()): Promise<WorkProject[]> {
  const days = Array.from({ length: 7 }, (_, i) => new Date(now - (6 - i) * 86_400_000).toISOString().slice(0, 10));
  const roots = new Map<string, string | null>();
  const grouped = new Map<string, Thread[]>();
  for (const t of threads) { const group = grouped.get(t.cwd) ?? []; group.push(t); grouped.set(t.cwd, group); }
  await mapConcurrent([...grouped.keys()], 4, async cwd => {
    try { roots.set(cwd, await git(cwd, ['rev-parse', '--show-toplevel'])); }
    catch { roots.set(cwd, null); }
  });
  const histories = new Map<string, Map<string, number>>();
  await mapConcurrent([...new Set([...roots.values()].filter((r): r is string => r !== null))], 4, async root => {
    try {
      const log = await git(root, ['log', '--first-parent', '--format=%H %ct', `--since=${days[0]}T00:00:00Z`]);
      const commits = log.split('\n').filter(Boolean).map(line => { const [hash, seconds] = line.split(' '); return { hash, day: new Date(Number(seconds) * 1000).toISOString().slice(0, 10) }; });
      const history = new Map<string, number>();
      for (const day of days) {
        const onDay = commits.filter(c => c.day === day);
        if (!onDay.length) { history.set(day, 0); continue; }
        const oldest = onDay.at(-1)!.hash;
        const parents = (await git(root, ['rev-list', '--parents', '-n', '1', oldest])).split(' ');
        const args = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '-w', '--ignore-blank-lines', '--unified=0'];
        const baseline = parents[1] ?? await git(root, ['hash-object', '-t', 'tree', '--stdin']);
        const diff = await git(root, ['diff', ...args, baseline, onDay[0].hash, '--']);
        history.set(day, countDiffLines(diff));
      }
      histories.set(root, history);
    } catch { /* Missing repositories/history are unknown, not zero work. */ }
  });
  return [...roots].map(([cwd, root]) => {
    const history = root ? histories.get(root) : undefined;
    const selected = grouped.get(cwd)!;
    return { cwd, root, error: history ? null : 'No readable Git history for this project.', days: days.map(day => {
      const tokens = selected.reduce((sum, t) => sum + (t.usage?.dailyTokens?.[day] ?? 0), 0);
      const lines = history?.get(day) ?? 0;
      return { day, tokens, lines, work: tokens * lines };
    }) };
  });
}
