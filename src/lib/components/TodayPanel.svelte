<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import MixBar from './MixBar.svelte';
  import { fmt, exact, money } from '$lib/format';

  let {
    total, cached, fresh, output, calls, turns, sessions, cost, projectName = 'All projects'
  }: { total: number; cached: number; fresh: number; output: number; calls: number; turns: number; sessions: number; cost: number | null; projectName?: string } = $props();
  const headline = $derived(total > 0 ? fmt(total) : '0');
</script>

<Card.Root class="today min-w-0 rounded-xl gap-5 p-5" aria-label={`Today’s saved usage · ${projectName}`}>
  <div class="lead">
    <div class="kicker"><span class="dot" aria-hidden="true"></span>Today · {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    <p class="project" title={projectName}>{projectName}</p>
    <p class="headline">
      <span class="number" title={exact(total)}>{headline}</span>
      <span class="unit">tokens so far</span>
    </p>
    <p class="sub">{sessions} {sessions === 1 ? 'session' : 'sessions'} · {calls} model {calls === 1 ? 'call' : 'calls'} · {turns} {turns === 1 ? 'turn' : 'turns'} {#if cost !== null}<span class="cost" title="API-equivalent estimate from OpenAI token prices; this is not your Codex subscription charge">· {money(cost)} API-equivalent</span>{/if}</p>
  </div>
  <div class="mix-block">
    <MixBar {cached} {fresh} {output} height={12} />
    <div class="legend">
      <span title={exact(cached)}><i class="cached"></i>Cached <b>{fmt(cached)}</b></span>
      <span title={exact(fresh)}><i class="fresh"></i>Fresh input <b>{fmt(fresh)}</b></span>
      <span title={exact(output)}><i class="output"></i>Output <b>{fmt(output)}</b></span>
    </div>
  </div>
</Card.Root>

<style>

  .kicker { display: flex; align-items: center; gap: 8px; color: var(--muted-foreground); font: 600 11px/1.5 var(--font-mono); letter-spacing: 1.2px; text-transform: uppercase; }
  .dot { flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 8px var(--primary); }
  .project { margin: 12px 0 0; color: var(--primary); font: 600 13px var(--font-sans); overflow-wrap: anywhere; }
  .headline { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; margin: 10px 0 0; }
  .number { font: 700 44px/1 var(--font-sans); letter-spacing: -2px; color: var(--foreground); font-variant-numeric: tabular-nums; }
  .unit { color: var(--muted-foreground); font: 500 14px var(--font-sans); }
  .sub { margin: 8px 0 0; color: var(--muted-foreground); font: 400 13px/1.6 var(--font-sans); }
  .cost { color: var(--muted-foreground); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; color: var(--muted-foreground); font-size: 12px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend b { color: var(--foreground); font: 600 12px var(--font-mono); }
  .legend i { width: 8px; height: 8px; border-radius: 3px; }
  .legend .cached { background: var(--chart-1); }
  .legend .fresh { background: var(--chart-4); }
  .legend .output { background: var(--chart-2); }
  @media (max-width: 560px) {
    .number { font-size: 44px; }
  }
</style>
