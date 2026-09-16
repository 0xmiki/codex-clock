<script lang="ts">
  import type { ThreadEfficiency } from '$lib/efficiency';
  import { costRange, exact, fullTime, money } from '$lib/format';
  let { efficiency }: { efficiency: ThreadEfficiency } = $props();
</script>

<div class="efficiency-detail">
  <h3>Usage grade</h3>
  {#if efficiency.available}
    <div class="headline"><span class="grade grade-{efficiency.grade.toLowerCase()}">{efficiency.grade}</span><span>{efficiency.reason}</span></div>
    <p>{efficiency.model} · last {efficiency.samples} calls{efficiency.lastSampleAt ? ` · latest ${fullTime(efficiency.lastSampleAt / 1000)}` : ''}</p>
    <dl>
      <div><dt>Average input</dt><dd>{exact(Math.round(efficiency.averageInput))} tokens</dd></div>
      <div><dt>Average cache reuse</dt><dd>{efficiency.cachePercent.toFixed(0)}%</dd></div>
      <div><dt>Average output</dt><dd>{exact(Math.round(efficiency.averageOutput))} tokens</dd></div>
      <div><dt>Recent API-equivalent cost / call</dt><dd>{costRange(efficiency.recentCost)}</dd></div>
      <div><dt>Your normal cost / call</dt><dd>{money(efficiency.normalCost)}</dd></div>
      <div><dt>Usage versus normal</dt><dd>{efficiency.costRatio.toFixed(2)}×</dd></div>
    </dl>
    <p>Normal is the median recent cost per call of {efficiency.baselineThreads} other threads across all projects and models. Each contributes its last 5 calls, so one long thread cannot dominate. This thread is excluded.</p>
    <p>A ≤1× normal · B ≤1.5× · C ≤2× · D ≤3× · F >3×.</p>
    <p>The multiplier uses the midpoint of estimated API costs, including cache discounts. It estimates consumption per model call, not per minute or exact subscription usage. An F means unusually heavy consumption; the work may still justify it.</p>
  {:else}<p>{efficiency.reason}</p>{/if}
</div>

<style>
  .efficiency-detail { margin-top: 16px; }
  h3 { margin-bottom: 8px; font-size: 12px; font-weight: 600; }
  p { margin: 8px 0; font-size: 11px; color: var(--muted-foreground); }
  .headline { display: flex; align-items: center; gap: 10px; font-size: 11px; }
  .grade { display: inline-grid; width: 30px; height: 30px; place-items: center; font: 700 18px var(--font-sans); line-height: 1; }
  .grade-a, .grade-b { color: var(--success); }
  .grade-c { color: var(--chart-3); }
  .grade-d, .grade-f { color: var(--destructive); }
  dl { display: grid; gap: 7px; font-size: 11px; }
  dl div { display: flex; justify-content: space-between; gap: 12px; }
  dt { color: var(--muted-foreground); }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
</style>
