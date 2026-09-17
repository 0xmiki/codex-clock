<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { fmt, exact } from '$lib/format';
  import type { usageComparison } from '$lib/comparison';
  let { total, comparison, partial = false, projectName = 'All projects' }: { total: number; comparison: ReturnType<typeof usageComparison>; partial?: boolean; projectName?: string } = $props();
</script>

<Card.Root class="min-w-0 rounded-xl gap-2 p-4" aria-label={`Today’s saved usage · ${projectName}`}>
  <div class="heading">
    <span title="Tokens recorded today (UTC), including resent context">Today</span>
    {#if projectName !== 'All projects'}<span class="project" title={projectName}>{projectName}</span>{/if}
  </div>
  <p class="headline"><span class="number" title={exact(total)}>{fmt(total)}</span><span class="unit">tokens</span></p>
  <details>
    <summary>{comparison.incomplete ? 'Comparison unavailable · partial history' : comparison.percent === null ? comparison.average === 0 ? 'No usual usage yet' : 'Building your baseline' : Math.round(Math.abs(comparison.percent)) === 0 ? 'On par with usual' : `${comparison.percent > 0 ? '↑' : '↓'} ${Math.round(Math.abs(comparison.percent))}% vs usual`}</summary>
    <div class="comparisons">
      <div><span>Usual by now</span><b>{comparison.average === null ? '—' : fmt(comparison.average)}</b></div>
      <div><span>Yesterday by now</span><b>{comparison.yesterday === null ? '—' : fmt(comparison.yesterday)}</b></div>
      <div><span>Last 7 full days</span><b>{comparison.lastWeek === null ? '—' : fmt(comparison.lastWeek)}</b></div>
      <div><span>Previous 7 days</span><b>{comparison.previousWeek === null ? '—' : fmt(comparison.previousWeek)}</b></div>
      <p>Tokens · UTC, to the current minute. Usual averages the previous 7 days, including days with no recorded usage. {partial || comparison.incomplete ? 'Some saved usage is missing, unreadable, or has no timestamp.' : 'Based on indexed, non-archived thread history.'}</p>
    </div>
  </details>
</Card.Root>

<style>
  .heading { display:flex; justify-content:space-between; gap:12px; color:var(--muted-foreground); font-size:12px; }
  .project { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%; }
  .headline { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; }
  .number { font:700 36px/1.1 var(--font-sans); letter-spacing:-1.5px; font-variant-numeric:tabular-nums; }
  .unit { color:var(--muted-foreground); font-size:12px; }
  summary { font-size:11px; color:var(--muted-foreground); cursor:pointer; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  summary:hover { color:var(--foreground); }
  summary:focus-visible { outline:2px solid var(--ring); outline-offset:3px; }
  .comparisons { display:grid; gap:8px; margin-top:12px; font-size:11px; }
  .comparisons div { display:flex; justify-content:space-between; gap:12px; }
  .comparisons p { color:var(--muted-foreground); font-size:10px; line-height:1.5; }
</style>
