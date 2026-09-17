<script lang="ts">
  import { base } from '$app/paths';
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="brand" class:compact>
  <img class="mark" src={`${base}/codex-watch.svg`} alt={compact ? 'Codex Watch' : ''} />
  {#if !compact}
    <span class="word">Codex <em>Watch</em></span>
  {/if}
</span>

<style>
  .brand { display: inline-flex; align-items: center; gap: 10px; }
  .mark { width: 30px; height: 30px; display: block; }
  .word { font: 600 19px/1 var(--font-sans); letter-spacing: -0.4px; color: var(--foreground); white-space: nowrap; }
  .word em { font-style: normal; color: var(--primary); }
  .compact .mark { width: 26px; height: 26px; }
</style>
