<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import type { WorkProject } from '$lib/types';
  import { workHistory } from '$lib/productivity';
  import { fmt, exact } from '$lib/format';
  let { projects, cwd = '', now, partial = false }: { projects: WorkProject[]; cwd?: string; now: number; partial?: boolean } = $props();
  const days = $derived(workHistory(projects, cwd));
  const today = $derived(days.find(d => d.day === new Date(now).toISOString().slice(0, 10)));
  const points = $derived((today?.work ?? 0) / 1_000_000);
  const maximum = $derived(Math.max(...days.map(d => d.work / 1_000_000), 1));
  const unavailable = $derived(projects.filter(p => (!cwd || p.cwd === cwd) && p.error).length);
</script>

<Card.Root class="min-w-0 rounded-xl gap-3 p-5" aria-label="Daily productivity">
  <div class="heading"><h2>Productivity</h2><span title="Days are measured in UTC">Today</span></div>
  <div class="headline"><div class="score">{days.length ? fmt(points) : '—'}</div><span class="unit">work units</span></div>
  {#if days.length}
    <div class="history" aria-label="Seven-day work history">
      {#each days as day (day.day)}
        {@const isToday = day.day === today?.day}
        {@const description = `${day.day}: ${fmt(day.work / 1_000_000)} work units`}
        <div class="day" class:current={isToday}>
          <button class="column" aria-label={description} title={description} style:--bar-height={`${day.work / 1_000_000 / maximum * 100}%`}><span class="bar" class:empty={day.work === 0}></span></button>
          <span>{isToday ? 'Today' : new Date(`${day.day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p>No dated work data yet.</p>
  {/if}
  <details class="method">
    <summary>How it’s measured {#if partial || unavailable}<span class="coverage">Partial data</span>{/if}</summary>
    <div class="explanation">
      <p>Tokens × net committed lines added + deleted, summed per repository. 1 work unit = 1 million token-lines.</p>
      {#if today}<p>Today: {fmt(today.tokens)} tokens · {exact(today.lines)} changed lines.</p>{/if}
      <p>Current branch, UTC commit dates. Excludes uncommitted edits, generated files and whitespace-only changes. Includes all authors’ commits.</p>
      {#if partial || unavailable}<p>{partial ? 'Newest saved threads only. ' : ''}{unavailable ? `${unavailable} project(s) have no readable Git history.` : ''}</p>{/if}
    </div>
  </details>
</Card.Root>

<style>
  .heading { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  h2 { font-size:14px; font-weight:600; }
  .heading span, p { font-size:11px; color:var(--muted-foreground); }
  p { line-height:1.5; margin:0; }
  .headline { display:flex; align-items:baseline; gap:10px; }
  .score { font:700 42px/1.1 var(--font-sans); letter-spacing:-1.5px; font-variant-numeric:tabular-nums; }
  .unit { font-size:12px; color:var(--muted-foreground); }
  summary { cursor:pointer; font-size:11px; color:var(--muted-foreground); }
  .history { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:9px; }
  .day { display:flex; flex-direction:column; gap:8px; text-align:center; font-size:10px; color:var(--muted-foreground); }
  .column { display:flex; align-items:flex-end; height:80px; width:100%; border:0; padding:0; background:transparent; cursor:default; }
  .bar { display:block; height:var(--bar-height); min-height:3px; width:100%; background:var(--muted-foreground); opacity:.4; border-radius:3px 3px 0 0; }
  .bar.empty { opacity:.18; }
  .current { color:var(--primary); font-weight:600; }
  .current .bar { background:var(--primary); opacity:1; }
  .column:hover .bar, .column:focus-visible .bar { opacity:1; }
  .column:focus-visible, summary:focus-visible { outline:2px solid var(--primary); outline-offset:3px; }
  .method { margin-top:4px; padding-top:12px; border-top:1px solid var(--border); }
  .coverage { float:right; font-size:10px; }
  .explanation { display:grid; gap:8px; margin-top:10px; }
</style>
