<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="brand" class:compact>
  <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="brand-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--muted)" />
        <stop offset="1" stop-color="var(--background)" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8.5" fill="url(#brand-tile)" />
    <rect width="31" height="31" x="0.5" y="0.5" rx="8" fill="none" stroke="var(--border)" />
    <path d="M 8.6 23.4 A 10.5 10.5 0 1 1 23.4 23.4" fill="none" stroke="var(--secondary)" stroke-width="3.2" stroke-linecap="round" />
    <path d="M 8.6 23.4 A 10.5 10.5 0 1 1 24.5 9.9" fill="none" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round" />
    <circle cx="24.5" cy="9.9" r="2.5" fill="var(--primary)" />
  </svg>
  {#if !compact}
    <span class="word">My<em>Limits</em></span>
  {/if}
</span>

<style>
  .brand { display: inline-flex; align-items: center; gap: 10px; }
  .mark { width: 30px; height: 30px; display: block; }
  .word { font: 600 19px/1 var(--font-sans); letter-spacing: -0.4px; color: var(--foreground); white-space: nowrap; }
  .word em { font-style: normal; color: var(--primary); }
  .compact .mark { width: 26px; height: 26px; }
</style>
