<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="brand" class:compact>
  <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="brand-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1c2534" />
        <stop offset="1" stop-color="#0c1017" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8.5" fill="url(#brand-tile)" />
    <rect width="31" height="31" x="0.5" y="0.5" rx="8" fill="none" stroke="rgba(255,255,255,0.09)" />
    <path d="M 8.6 23.4 A 10.5 10.5 0 1 1 23.4 23.4" fill="none" stroke="rgba(154,178,216,0.25)" stroke-width="3.2" stroke-linecap="round" />
    <path d="M 8.6 23.4 A 10.5 10.5 0 1 1 24.5 9.9" fill="none" stroke="#b4f53c" stroke-width="3.2" stroke-linecap="round" />
    <circle cx="24.5" cy="9.9" r="2.5" fill="#b4f53c" />
  </svg>
  {#if !compact}
    <span class="word">My<em>Limits</em></span>
  {/if}
</span>

<style>
  .brand { display: inline-flex; align-items: center; gap: 10px; }
  .mark { width: 30px; height: 30px; display: block; filter: drop-shadow(0 0 10px rgba(180, 245, 60, 0.18)); }
  .word { font: 600 19px/1 var(--font-display); letter-spacing: -0.4px; color: var(--ink); white-space: nowrap; }
  .word em { font-style: normal; color: var(--brand); }
  .compact .mark { width: 26px; height: 26px; }
</style>
