<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import type { AccountLimits } from '$lib/types';
  let { limits, now }: { limits?: AccountLimits | null; now: number } = $props();
  const label = (minutes: number | null) => minutes === 10080 ? 'Weekly' : minutes === 300 ? '5-hour' : minutes === null ? 'Usage window' : minutes % 1440 === 0 ? `${minutes / 1440}-day` : minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`;
  const reset = (time: number) => new Date(time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const stage = (remaining: number) => remaining > 75 ? 'healthy' : remaining > 50 ? 'comfortable' : remaining > 25 ? 'moderate' : remaining > 10 ? 'low' : 'critical';
</script>

<Card.Root class="gap-2 rounded-xl px-4 py-3" aria-label="Remaining Codex allowance">
  {#if limits?.windows.length}
    {#each limits.windows as window, i (i)}
      {@const expired = window.resetsAt !== null && window.resetsAt <= now}
      <div class="allowance" data-stage={!expired && window.minutes === 10080 ? stage(window.remaining) : undefined}>
      <div class="window" title={expired ? 'Reset time passed · refresh for current allowance' : `${window.resetsAt ? `Resets ${reset(window.resetsAt)}` : 'Reset time unavailable'} · Checked ${new Date(limits.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
        <div class="row"><span>{label(window.minutes)}</span><strong aria-label={expired ? 'Refresh needed' : `${Math.round(window.remaining)}% remaining`}>{expired ? 'Refresh needed' : `${Math.round(window.remaining)}%`}</strong></div>
        {#if !expired}<div class="track" role="progressbar" aria-label={`${label(window.minutes)} allowance remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={window.remaining}><div class="fill" class:low={window.minutes !== 10080 && window.remaining <= 20} style:width={`${window.remaining}%`}></div></div>{/if}
      </div>
      </div>
    {/each}
  {:else}
    <p>Allowance unavailable · try Refresh</p>
  {/if}
</Card.Root>

<style>
  .row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  p { font-size:10px; color:var(--muted-foreground); }
  .row { font-size:12px; }
  strong { font-variant-numeric:tabular-nums; }
  .track { height:4px; background:var(--muted); border-radius:99px; overflow:hidden; margin-top:6px; }
  .allowance { --allowance-color: var(--primary); }
  .allowance[data-stage='healthy'] { --allowance-color: #4ade80; }
  .allowance[data-stage='comfortable'] { --allowance-color: #a3e635; }
  .allowance[data-stage='moderate'] { --allowance-color: #fbbf24; }
  .allowance[data-stage='low'] { --allowance-color: #fb923c; }
  .allowance[data-stage='critical'] { --allowance-color: #f87171; }
  .allowance[data-stage] strong { color:var(--allowance-color); }
  .fill { height:100%; background:var(--allowance-color); border-radius:inherit; }
  .fill.low { background:var(--destructive); }
</style>
