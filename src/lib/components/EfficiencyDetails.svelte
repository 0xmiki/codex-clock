<script lang="ts">
  import type { ThreadEfficiency } from '$lib/efficiency';
  let { efficiency }: { efficiency: ThreadEfficiency } = $props();
</script>

<div class="efficiency-detail">
  <span>Usage Score:</span>
  {#if efficiency.available}
    <span class="grade grade-{efficiency.grade.toLowerCase()}">{efficiency.grade}</span>
  {:else}
    <span class="unavailable" aria-label="Usage score unavailable">—</span>
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
