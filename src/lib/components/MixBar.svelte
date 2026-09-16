<script lang="ts">
  import { exact } from '$lib/format';
  let { cached = 0, fresh = 0, output = 0, height = 8 }: { cached?: number; fresh?: number; output?: number; height?: number } = $props();
  const total = $derived(cached + fresh + output);
</script>

<div class="mix flex min-w-10 overflow-hidden rounded-full bg-muted" style={`height: ${height}px`} role="img" aria-label={total ? `${exact(cached)} cached input, ${exact(fresh)} fresh input, ${exact(output)} output tokens` : 'No tokens recorded'}>
  {#if total > 0}
    <span class="h-full bg-[var(--chart-1)]" style:flex-grow={cached}></span>
    <span class="h-full bg-[var(--chart-4)]" style:flex-grow={fresh}></span>
    <span class="h-full bg-[var(--chart-2)]" style:flex-grow={output}></span>
  {/if}
</div>
