<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import type { DayBucket } from '$lib/today';
  import { dayKey } from '$lib/today';
  import { fmt, exact, dayLabel } from '$lib/format';

  let { buckets }: { buckets: DayBucket[] } = $props();
  const peak = $derived(Math.max(1, ...buckets.map(bucket => bucket.tokens)));
  const todayKey = $derived(dayKey(Date.now()));
</script>

<Card.Root class="trend min-w-0 rounded-xl gap-4 p-5">
  <Card.Header class="gap-1 p-0">
    <Card.Title>Recent days</Card.Title>
    <Card.Description>Tokens recorded each day · UTC</Card.Description>
  </Card.Header>
  {#if buckets.length}
    <div class="bars" role="img" aria-label={buckets.map(b => `${b.day}: ${exact(b.tokens)} tokens across ${b.threads} threads`).join(', ')}>
      {#each buckets as bucket (bucket.day)}
        <div class="slot">
          <span class="value" title={exact(bucket.tokens)}>{fmt(bucket.tokens)}</span>
          <div class="bar-wrap">
            <div class="bar" class:today={bucket.isToday}
              style:height="{bucket.tokens > 0 ? Math.max(3, bucket.tokens / peak * 100) : 0}%"
              title="{bucket.day} · {bucket.threads} threads · {exact(bucket.tokens)} tokens"></div>
          </div>
          <span class="day" class:today-label={bucket.isToday}>{dayLabel(bucket.day, todayKey)}</span>
          <span class="count">{bucket.threads}</span>
        </div>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">Recorded usage from loaded threads</p>
  {:else}
    <p class="text-sm text-muted-foreground">No saved activity in view yet.</p>
  {/if}
</Card.Root>

<style>
  .bars { display: flex; align-items: stretch; gap: 8px; margin-top: 4px; }
  .slot { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0; }
  .value { color: var(--muted-foreground); font: 600 10px var(--font-mono); font-variant-numeric: tabular-nums; }
  .bar-wrap { display: flex; align-items: flex-end; height: 110px; width: 100%; max-width: 64px; border-bottom: 1px solid var(--border); }
  .bar { width: 100%; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, var(--chart-1), color-mix(in oklch, var(--chart-1) 12%, transparent)); transition: height 0.3s ease; }
  .bar.today { background: linear-gradient(180deg, var(--foreground), color-mix(in oklch, var(--chart-1) 20%, transparent)); }
  .day { color: var(--muted-foreground); font-size: 11px; }
  .day.today-label { color: var(--foreground); font-weight: 600; }
  .count { color: var(--muted-foreground); font: 400 10px var(--font-mono); }
</style>
