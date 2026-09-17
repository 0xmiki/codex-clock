import type { Snapshot, Thread } from '../src/lib/types';
import { activeProjects, cacheRate, dailyBuckets, dailyThreads, projectRollup, sumCacheRate, threadApiCost, tokensOnDay } from '../src/lib/today';
import { gradeThreads, workflowGrades } from '../src/lib/efficiency';
import { usageComparison } from '../src/lib/comparison';
import { project } from '../src/lib/format';

export type SortKey = 'when' | 'tokens' | 'cache' | 'cost' | 'efficiency' | 'project';
const keys: SortKey[] = ['when', 'tokens', 'cache', 'cost', 'efficiency', 'project'];
// Historical maps stay on the server; expanded rows only need lifetime/model counters.
function compact(thread: Thread): Thread {
  if (!thread.usage) return thread;
  const { dailyTokens, dailyUsage, minuteTokens, ...usage } = thread.usage;
  return { ...thread, usage };
}

export function createViewReader() {
  let source: Thread[] | undefined;
  let grades = gradeThreads([]);
  let projects: string[] = [];
  let summaries = new Map<string, ReturnType<typeof summarize>>();
  function summarize(threads: Thread[], now: number, partial: boolean) {
    const today = dailyThreads(threads, now);
    return {
      daily: tokensOnDay(threads, now), buckets: dailyBuckets(threads, now), comparison: usageComparison(threads, now, partial),
      standouts: { topProjects: projectRollup(today), heaviest: today.toSorted((a, b) => (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0)).slice(0, 3).map(compact), cacheRate: sumCacheRate(today), grades: workflowGrades(today, grades) }
    };
  }
  return (snapshot: Snapshot, params = new URLSearchParams(), now = Date.now()) => {
    if (source !== snapshot.threads) { source = snapshot.threads; grades = gradeThreads(source); projects = activeProjects(source); summaries.clear(); }
    const cwd = params.get('project') ?? '';
    const selected = source.filter(t => !cwd || t.cwd === cwd);
    const key = JSON.stringify([cwd, Math.floor(now / 60_000), snapshot.hasMore]);
    let summary = summaries.get(key);
    if (!summary) {
      summary = summarize(selected, now, snapshot.hasMore);
      if (summaries.size >= 32) summaries.clear();
      summaries.set(key, summary);
    }
    const sort = keys.includes(params.get('sort') as SortKey) ? params.get('sort') as SortKey : 'when';
    const desc = params.get('desc') !== 'false', dir = desc ? -1 : 1;
    const score = (t: Thread) => { const grade = grades.get(t.id); return grade?.available ? grade.costRatio : null; };
    const value = (t: Thread) => sort === 'tokens' ? t.usage?.totalTokens ?? -1 : sort === 'cache' ? cacheRate(t.usage) ?? -1 : sort === 'cost' ? threadApiCost(t) ?? -1 : sort === 'efficiency' ? score(t) : t.updatedAt;
    const sorted = selected.map(t => ({ t, value: value(t) })).sort((a, b) => {
      if (sort === 'efficiency' && (a.value === null || b.value === null)) return a.value === b.value ? a.t.id.localeCompare(b.t.id) : a.value === null ? 1 : -1;
      return (sort === 'project' ? project(a.t.cwd).localeCompare(project(b.t.cwd)) : (a.value! - b.value!)) * dir || a.t.id.localeCompare(b.t.id);
    });
    const pageSize = 50, pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const requested = Number(params.get('page') ?? 1);
    const page = Number.isFinite(requested) ? Math.max(1, Math.min(pages, Math.floor(requested))) : 1;
    const threads = sorted.slice((page - 1) * pageSize, page * pageSize).map(row => compact(row.t));
    const ids = new Set([...threads, ...summary.standouts.heaviest].map(t => t.id));
    return { ...snapshot, threads, projects, summary, grades: [...ids].map(id => [id, grades.get(id)!] as const), pagination: { page, pages, pageSize, total: selected.length }, sort, desc };
  };
}
export type DashboardView = ReturnType<ReturnType<typeof createViewReader>>;
