<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import type { Thread } from '$lib/types';
  import { projectRollup, sumCacheRate, threadApiCost } from '$lib/today';
  import { workflowGrades, type ThreadEfficiency } from '$lib/efficiency';
  import { fmt, money, project } from '$lib/format';
  import { askCoach } from '$lib/coach.svelte';
  import Ring from './Ring.svelte';

  let { today, onSelectProject, efficiencyGrades }: { today: Thread[]; onSelectProject: (cwd: string) => void; efficiencyGrades: ReadonlyMap<string, ThreadEfficiency> } = $props();

  const topProjects = $derived(projectRollup(today, 5));
  const heaviest = $derived(today.filter(t => t.usage).toSorted((a, b) => (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0)).slice(0, 3));
  const cacheRate = $derived(sumCacheRate(today));
  const grades = $derived(workflowGrades(today, efficiencyGrades));
  const maxProjectTokens = $derived(Math.max(1, ...topProjects.map(row => row.tokens)));
</script>

<div class="standouts">
  <Card.Root class="min-w-0 rounded-xl gap-3 p-5" aria-label="Top projects today">
    <h2>Where today went</h2>
    {#if topProjects.length}
      <ul aria-label="Filter by today's projects">
        {#each topProjects as row (row.cwd)}
          <li>
            <Button variant="ghost" class="grid h-auto w-full grid-cols-[minmax(60px,80px)_minmax(0,1fr)_auto] gap-2 px-0 py-2 text-left" onclick={() => onSelectProject(row.cwd)} title="Show only {row.name} in the thread list">
              <span class="project-name">{row.name}</span>
              <span class="project-track" aria-hidden="true"><span class="project-fill" style:width="{row.tokens > 0 ? Math.max(4, row.tokens / maxProjectTokens * 100) : 0}%"></span></span>
              <span class="tokens" title="Across {row.threads} {row.threads === 1 ? 'thread' : 'threads'}">{fmt(row.tokens)}</span>
            </Button>
          </li>
        {/each}
      </ul>
      <p class="hint">Click a project to filter the thread list</p>
    {:else}
      <p class="empty">Nothing recorded yet today.</p>
    {/if}
  </Card.Root>

  <Card.Root class="min-w-0 rounded-xl gap-3 p-5" aria-label="Heaviest sessions today">
    <h2>Heaviest sessions</h2>
    {#if heaviest.length}
      <ul>
        {#each heaviest as thread (thread.id)}
          {@const efficiency = efficiencyGrades.get(thread.id)}
          <li>
            <div class="row">
              <span class="title" title={thread.title}>{thread.title}</span>
              <span class="tokens" title="Cumulative tokens for this thread">{fmt(thread.usage?.totalTokens)}</span>
            </div>
            <div class="row dim">
              <span>{project(thread.cwd)}</span>
              <span class="actions">
                {#if threadApiCost(thread) !== null}<span>{money(threadApiCost(thread))}</span>{/if}
                {#if efficiency?.available}<b class="grade grade-{efficiency.grade.toLowerCase()}" title={efficiency.reason}>{efficiency.grade}</b>{/if}
                {#if efficiency?.available && ['D', 'F'].includes(efficiency.grade)}
                  <Button size="xs" variant="outline" onclick={() => void askCoach('Explain this thread’s cost per token versus the same model, separately from its usage per call across models. Suggest ways to reduce consumption.', thread.id)}>Review grade</Button>
                {/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Nothing recorded yet today.</p>
    {/if}
  </Card.Root>

  <Card.Root class="min-w-0 rounded-xl gap-3 p-5" aria-label="Efficiency grades today">
    <h2>Thread efficiency</h2>
    {#if cacheRate !== null || grades.available > 0}
      <div class="gauges">
        <div class="gauge">
          <div class="ring-wrap"><Ring label="Cache reuse" value={cacheRate ?? 0} color="var(--chart-1)" /><b>{cacheRate ?? '—'}%</b></div>
          <span class="label">Cache reuse</span>
          <span class="caption" title="Share of today's input tokens served from cache. Higher is cheaper.">of input served from cache</span>
        </div>
        <div class="gauge">
          <div class="grade-strip" aria-label="Efficiency grade distribution">
            {#each Object.entries(grades.counts) as [grade, count]}
              <span class="grade grade-{grade.toLowerCase()}" title={`${count} grade ${grade}`}>{grade}<small>{count}</small></span>
            {/each}
          </div>
          <span class="label">Thread grades</span>
          <span class="caption">Cost/token: A ≤ normal · F >3× normal</span>
        </div>
      </div>
      <p class="hint">{grades.available} of {grades.total} threads updated today are graded. Cost per token over the last 5 calls versus up to 30 other recent threads on the same model, across all projects.</p>
    {:else}
      <p class="empty">Learning your normal usage. Grades need 5 recent priced calls and at least 5 other eligible threads on the same model.</p>
    {/if}
  </Card.Root>
</div>

<style>
  .standouts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }

  h2 { margin: 0 0 14px; font: 600 13px/1.3 var(--font-sans); letter-spacing: 0.4px; text-transform: uppercase; color: var(--muted-foreground); }
  ul { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  li { min-width: 0; }
  .hint, .caption { margin: 10px 0 0; color: var(--muted-foreground); font-size: 11px; }
  .empty { margin: 4px 0; color: var(--muted-foreground); font-size: 13px; }

  /* projects */
  .project-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--foreground); font-size: 12px; }
  .project-track { height: 6px; border-radius: 99px; background: var(--muted); overflow: hidden; }
  .project-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--chart-4), var(--chart-1)); }

  .tokens { color: var(--muted-foreground); font: 600 12px var(--font-mono); font-variant-numeric: tabular-nums; }

  /* heaviest */
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .row.dim { flex-wrap: wrap; margin-top: 2px; padding-bottom: 9px; color: var(--muted-foreground); font-size: 11px; }
  li + li .row:first-child { padding-top: 6px; border-top: 1px solid var(--border); }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--foreground); font-size: 13px; }
  .tokens { color: var(--foreground); font: 600 13px var(--font-mono); }
  .actions { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 10px; white-space: nowrap; }


  /* efficiency */
  .gauges { display: flex; justify-content: space-around; gap: 12px; flex: 1; }
  .gauge { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .ring-wrap { position: relative; display: grid; place-items: center; }
  .ring-wrap b { position: absolute; font: 600 19px var(--font-sans); letter-spacing: -0.5px; color: var(--foreground); }
  .label { margin-top: 8px; color: var(--foreground); font: 600 12px var(--font-sans); }
  .caption { max-width: 140px; }
  .grade-strip { display: flex; align-items: flex-end; gap: 4px; min-height: 88px; }
  .grade { display: inline-flex; align-items: center; justify-content: center; gap: 2px; min-width: 24px; height: 28px; font: 700 13px var(--font-sans); line-height: 1; }
  .grade small { font-size: 8px; font-weight: 500; }
  .grade-a, .grade-b { color: var(--success); }
  .grade-c { color: var(--chart-3); }
  .grade-d, .grade-f { color: var(--destructive); }


</style>
