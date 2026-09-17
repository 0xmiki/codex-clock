<script lang="ts">
  import type { ThreadEfficiency } from '$lib/efficiency';
  let { efficiency }: { efficiency: ThreadEfficiency } = $props();
</script>

<div class="efficiency-detail">
  <span>Usage Score:</span>
  {#if efficiency.available}
    <span class="grade grade-{efficiency.grade.toLowerCase()}" title={efficiency.reason}>{efficiency.grade}</span>
    {#if efficiency.fastCalls > 0}<span>Fast mode: {efficiency.fastCalls}/{efficiency.samples} recent calls · {efficiency.tierCostRatio.toFixed(2)}× standard cost</span>{/if}
  {:else}
    <span class="unavailable" aria-label="Usage score unavailable" title={efficiency.reason}>—</span>
  {/if}
</div>

<style>
  .efficiency-detail { margin-top: 16px; display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .grade { display: inline-grid; width: 24px; height: 24px; place-items: center; font: 700 16px var(--font-sans); line-height: 1; }
  .grade-a, .grade-b { color: var(--success); }
  .grade-c { color: var(--chart-3); }
  .grade-d, .grade-f { color: var(--destructive); }
  .unavailable { color: var(--muted-foreground); }
</style>
