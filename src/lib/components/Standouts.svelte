<script lang="ts">
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
  const maxProjectTokens = $derived(Math.max(1, ...topProjects.map(p => p.tokens)));
  const highPressureCount = $derived(today.filter(t => (threadPressure(t) ?? 0) >= 60).length);
</script>

<div class="standouts">
  <section class="card" aria-label="Top projects today">
    <h2>Where today went</h2>
    {#if topProjects.length}
      <ul>
        {#each topProjects as row (row.cwd)}
          <li>
            <button onclick={() => onSelectProject(row.cwd)} title="Show only {row.name} in the thread list">
              <span class="name">{row.name}</span>
              <span class="track" aria-hidden="true"><span class="fill" style:width="{Math.max(4, row.tokens / maxProjectTokens * 100)}%"></span></span>
              <span class="tokens" title="Across {row.threads} {row.threads === 1 ? 'thread' : 'threads'}">{fmt(row.tokens)}</span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint">Click a project to filter the thread list</p>
    {:else}
      <p class="empty">Nothing recorded yet today.</p>
    {/if}
  </section>

  <section class="card" aria-label="Heaviest sessions today">
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
                  <button class="why" disabled={false} onclick={() => void askCoach(`Why is “${thread.title}” above 60 pressure? Inspect its transcript and give me specific changes.`, thread.id)}>Ask why</button>
                {/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Nothing recorded yet today.</p>
    {/if}
  </section>

  <section class="card" aria-label="Efficiency signals today">
    <h2>Efficiency</h2>
    {#if cacheRate !== null || pressure !== null}
      <div class="gauges">
        <div class="gauge">
          <div class="ring-wrap"><Ring value={cacheRate ?? 0} color="var(--cached)" /><b>{cacheRate ?? '—'}%</b></div>
          <span class="label">Cache reuse</span>
          <span class="caption" title="Share of today's input tokens served from cache. Higher is cheaper.">of input served from cache</span>
        </div>
        <div class="gauge">
          <div class="ring-wrap">
            <Ring value={pressure ?? 0} color={pressure === null ? 'var(--bg3)' : pressure >= 60 ? 'var(--bad)' : pressure >= 40 ? 'var(--warn)' : 'var(--brand)'} />
            <b class={pressure !== null ? `tone-${pressureTone(pressure)}` : ''}>{pressure ?? '—'}</b>
          </div>
          <span class="label">Pressure</span>
          <span class="caption">{pressure === null ? 'no scored usage today' : `${pressureLabel(pressure)} · 60+ means waste risk`}{highPressureCount ? ` · ${highPressureCount} high` : ''}</span>
        </div>
      </div>
    {:else}
      <p class="empty">Nothing scored yet today.</p>
    {/if}
  </section>
</div>

<style>
  .standouts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .card {
    padding: 20px 22px; border: 1px solid var(--line); border-radius: var(--radius-card);
    background: var(--bg1); box-shadow: var(--lift); min-width: 0;
    display: flex; flex-direction: column;
  }
  h2 { margin: 0 0 14px; font: 600 13px/1.3 var(--font-ui); letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-dim); }
  ul { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  li { min-width: 0; }
  .hint, .caption { margin: 10px 0 0; color: var(--ink-faint); font-size: 11px; }
  .empty { margin: 4px 0; color: var(--ink-faint); font-size: 13px; }

  /* projects */
  li button {
    display: grid; grid-template-columns: minmax(60px, auto) 1fr auto; align-items: center; gap: 10px;
    width: 100%; padding: 7px 10px; margin: 0 -10px; width: calc(100% + 20px);
    border: 0; border-radius: 8px; background: transparent; text-align: left;
  }
  li button:hover { background: var(--bg2); }
  .name { color: var(--ink); font: 500 13px var(--font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { height: 6px; border-radius: 99px; background: var(--bg3); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, rgba(180, 245, 60, 0.35), var(--brand)); }
  .tokens { color: var(--ink-dim); font: 600 12px var(--font-data); font-variant-numeric: tabular-nums; }

  /* heaviest */
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .row.dim { margin-top: 2px; padding-bottom: 9px; color: var(--ink-faint); font-size: 11px; }
  li + li .row:first-child { padding-top: 6px; border-top: 1px solid var(--line-soft); }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 13px; }
  .tokens { color: var(--ink); font: 600 13px var(--font-data); }
  .actions { display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; }
  .actions b { font: 600 11px var(--font-data); }
  .tone-good { color: var(--good); }
  .tone-warn { color: var(--warn); }
  .tone-bad { color: var(--bad); }
  .why {
    min-height: 24px; padding: 2px 10px; border: 1px solid rgba(244, 118, 94, 0.4); border-radius: 99px;
    background: transparent; color: var(--bad); font-size: 11px;
  }
  .why:hover { background: var(--danger-bg); }

  /* efficiency */
  .gauges { display: flex; justify-content: space-around; gap: 12px; flex: 1; }
  .gauge { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .ring-wrap { position: relative; display: grid; place-items: center; }
  .ring-wrap b { position: absolute; font: 600 19px var(--font-display); letter-spacing: -0.5px; color: var(--ink); }
  .label { margin-top: 8px; color: var(--ink); font: 600 12px var(--font-ui); }
  .caption { max-width: 140px; }

  @media (max-width: 1280px) { .standouts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .standouts { grid-template-columns: 1fr; } }
</style>
