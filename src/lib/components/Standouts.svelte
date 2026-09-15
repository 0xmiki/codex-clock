<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import type { Thread } from '$lib/types';
  import { projectRollup, sumCacheRate, threadApiCost, threadPressure, workflowPressure } from '$lib/today';
  import { fmt, money, pressureLabel, pressureTone, project } from '$lib/format';
  import { askCoach } from '$lib/coach.svelte';
  import Ring from './Ring.svelte';

  let { today, onSelectProject }: { today: Thread[]; onSelectProject: (cwd: string) => void } = $props();

  const topProjects = $derived(projectRollup(today, 5));
  const heaviest = $derived(today.filter(t => t.usage).toSorted((a, b) => (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0)).slice(0, 3));
  const cacheRate = $derived(sumCacheRate(today));
  const pressure = $derived(workflowPressure(today));
  const maxProjectTokens = $derived(Math.max(1, ...topProjects.map(row => row.tokens)));
  const highPressureCount = $derived(today.filter(t => (threadPressure(t) ?? 0) >= 60).length);
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
          {@const tone = threadPressure(thread)}
          <li>
            <div class="row">
              <span class="title" title={thread.title}>{thread.title}</span>
              <span class="tokens" title="Cumulative tokens for this thread">{fmt(thread.usage?.totalTokens)}</span>
            </div>
            <div class="row dim">
              <span>{project(thread.cwd)}</span>
              <span class="actions">
                {#if threadPressure(thread) !== null}
                  <b class="tone-{pressureTone(threadPressure(thread)!)}">{threadPressure(thread)}/100 {pressureLabel(threadPressure(thread)!)}</b>
                {/if}
                {#if threadApiCost(thread) !== null}<span>{money(threadApiCost(thread))}</span>{/if}
                {#if (tone ?? 0) >= 60}
                  <Button size="xs" variant="destructive" onclick={() => void askCoach(`Why is “${thread.title}” above 60 pressure? Inspect its transcript and give me specific changes.`, thread.id)}>Ask why</Button>
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

  <Card.Root class="min-w-0 rounded-xl gap-3 p-5" aria-label="Efficiency signals today">
    <h2>Efficiency</h2>
    {#if cacheRate !== null || pressure !== null}
      <div class="gauges">
        <div class="gauge">
          <div class="ring-wrap"><Ring label="Cache reuse" value={cacheRate ?? 0} color="var(--chart-1)" /><b>{cacheRate ?? '—'}%</b></div>
          <span class="label">Cache reuse</span>
          <span class="caption" title="Share of today's input tokens served from cache. Higher is cheaper.">of input served from cache</span>
        </div>
        <div class="gauge">
          <div class="ring-wrap">
            <Ring label="Pressure" value={pressure ?? 0} color={pressure === null ? 'var(--muted)' : 'var(--chart-1)'} />
            <b class={pressure !== null ? `tone-${pressureTone(pressure)}` : ''}>{pressure ?? '—'}</b>
          </div>
          <span class="label">Pressure</span>
          <span class="caption">{pressure === null ? 'no scored usage today' : `${pressureLabel(pressure)} · 60+ means waste risk`}{highPressureCount ? ` · ${highPressureCount} high` : ''}</span>
        </div>
      </div>
    {:else}
      <p class="empty">Nothing scored yet today.</p>
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
  .actions b { font: 600 11px var(--font-mono); }
  .tone-good { color: var(--chart-2); }
  .tone-warn { color: var(--chart-3); }
  .tone-bad { color: var(--destructive); }


  /* efficiency */
  .gauges { display: flex; justify-content: space-around; gap: 12px; flex: 1; }
  .gauge { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .ring-wrap { position: relative; display: grid; place-items: center; }
  .ring-wrap b { position: absolute; font: 600 19px var(--font-sans); letter-spacing: -0.5px; color: var(--foreground); }
  .label { margin-top: 8px; color: var(--foreground); font: 600 12px var(--font-sans); }
  .caption { max-width: 140px; }


</style>
