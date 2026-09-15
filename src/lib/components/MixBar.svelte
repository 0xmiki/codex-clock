<script lang="ts">
  import { exact } from '$lib/format';
  let {
    cached = 0, fresh = 0, output = 0, height = 8, radius = 99, gap = true
  }: { cached?: number; fresh?: number; output?: number; height?: number; radius?: number; gap?: boolean } = $props();
  const total = $derived(cached + fresh + output);
</script>

<div
  class="mix"
  class:gap
  style:height="{height}px"
  style:border-radius="{radius}px"
  role="img"
  aria-label={total ? `${exact(cached)} cached input, ${exact(fresh)} fresh input, ${exact(output)} output tokens` : 'No tokens recorded'}
>
  {#if total === 0}
    <span class="empty" style:height="100%"></span>
  {:else}
    {#if cached > 0}<span class="cached" style:flex={cached}></span>{/if}
    {#if fresh > 0}<span class="fresh" style:flex={fresh}></span>{/if}
    {#if output > 0}<span class="output" style:flex={output}></span>{/if}
  {/if}
</div>

<style>
  .mix { display: flex; overflow: hidden; background: var(--bg3); min-width: 40px; }
  .mix.gap { gap: 2px; }
  .mix span { display: block; min-width: 2px; }
  .cached { background: var(--cached); }
  .fresh { background: var(--fresh); }
  .output { background: var(--output); }
  .empty { background: transparent; flex: 1; }
</style>
