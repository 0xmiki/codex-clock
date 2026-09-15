<script lang="ts">
  import MixBar from './MixBar.svelte';
  import { fmt, exact, money } from '$lib/format';

  let {
    total, cached, fresh, output, calls, turns, sessions, cost
  }: { total: number; cached: number; fresh: number; output: number; calls: number; turns: number; sessions: number; cost: number | null } = $props();
  const headline = $derived(total > 0 ? fmt(total) : '0');
</script>

<section class="today" aria-label="Today's saved usage">
  <div class="lead">
    <div class="kicker"><span class="dot" aria-hidden="true"></span>Today · {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
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
</section>

<style>
  .today {
    display: flex; flex-direction: column; gap: 22px;
    padding: 26px 28px 24px;
    border: 1px solid var(--line); border-radius: var(--radius-card);
    background: linear-gradient(160deg, var(--bg2), var(--bg1) 55%);
    box-shadow: var(--lift);
  }
  .kicker { display: flex; align-items: center; gap: 8px; color: var(--ink-dim); font: 600 11px/1 var(--font-data); letter-spacing: 1.2px; text-transform: uppercase; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 8px var(--brand); }
  .headline { display: flex; align-items: baseline; gap: 12px; margin: 10px 0 0; }
  .number { font: 700 58px/1 var(--font-display); letter-spacing: -2px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .unit { color: var(--ink-faint); font: 500 14px var(--font-ui); }
  .sub { margin: 8px 0 0; color: var(--ink-dim); font: 400 13px/1.6 var(--font-ui); }
  .cost { color: var(--ink-faint); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; color: var(--ink-dim); font-size: 12px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend b { color: var(--ink); font: 600 12px var(--font-data); }
  .legend i { width: 8px; height: 8px; border-radius: 3px; }
  .legend .cached { background: var(--cached); }
  .legend .fresh { background: var(--fresh); }
  .legend .output { background: var(--output); }
  @media (max-width: 560px) {
    .number { font-size: 44px; }
    .today { padding: 20px; }
  }
</style>
