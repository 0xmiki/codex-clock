<script lang="ts">
  import type { DayBucket } from '$lib/today';
  import { dayKey } from '$lib/today';
  import { fmt, exact, dayLabel } from '$lib/format';

  let { buckets }: { buckets: DayBucket[] } = $props();
  const peak = $derived(Math.max(1, ...buckets.map(b => b.tokens)));
  const todayKey = $derived(dayKey(Date.now()));
</script>

<section class="trend" aria-label="Token totals across recent active days">
  <header>
    <h2>Recent days</h2>
    <p>Cumulative thread totals, bucketed by last saved activity</p>
  </header>
  {#if buckets.length}
    <div class="bars" role="img" aria-label={buckets.map(b => `${b.day}: ${exact(b.tokens)} tokens across ${b.threads} threads`).join(', ')}>
      {#each buckets as bucket (bucket.day)}
        {@const heightPct = Math.max(3, bucket.tokens / peak * 100)}
        <div class="slot">
          <span class="value" title={exact(bucket.tokens)}>{fmt(bucket.tokens)}</span>
          <div class="bar-wrap">
            <div
              class="bar" class:today={bucket.isToday}
              style:height="{heightPct}%"
              title="{bucket.day} · {bucket.threads} {bucket.threads === 1 ? 'thread' : 'threads'} · {exact(bucket.tokens)} tokens · {bucket.calls} calls"
            ></div>
          </div>
          <span class="day" class:today-label={bucket.isToday}>{dayLabel(bucket.day, todayKey)}</span>
          <span class="count">{bucket.threads}</span>
        </div>
      {/each}
    </div>
    <p class="note">Newest {buckets.reduce((sum, b) => sum + b.threads, 0)} saved {buckets.reduce((sum, b) => sum + b.threads, 0) === 1 ? 'thread' : 'threads'} shown · threads still active today keep growing</p>
  {:else}
    <p class="none">No saved activity in view yet.</p>
  {/if}
</section>

<style>
  .trend {
    display: flex; flex-direction: column;
    padding: 26px 28px 20px;
    border: 1px solid var(--line); border-radius: var(--radius-card);
    background: var(--bg1);
    box-shadow: var(--lift);
    min-width: 0;
  }
  h2 { margin: 0; font: 600 15px/1.3 var(--font-display); letter-spacing: -0.2px; }
  header p { margin: 3px 0 0; color: var(--ink-faint); font-size: 12px; }
  .bars { display: flex; flex: 1; align-items: stretch; gap: 14px; margin-top: 20px; min-height: 150px; }
  .slot { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0; }
  .value { color: var(--ink-dim); font: 600 11px var(--font-data); font-variant-numeric: tabular-nums; }
  .bar-wrap { display: flex; align-items: flex-end; height: 110px; width: 100%; max-width: 64px; border-bottom: 1px solid var(--line); }
  .bar {
    width: 100%; border-radius: 6px 6px 2px 2px;
    background: linear-gradient(180deg, rgba(180, 245, 60, 0.75), rgba(180, 245, 60, 0.12));
    transition: height 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .bar.today { background: linear-gradient(180deg, var(--brand), rgba(180, 245, 60, 0.2)); box-shadow: 0 0 22px rgba(180, 245, 60, 0.2); }
  .day { color: var(--ink-faint); font: 500 11px var(--font-ui); }
  .day.today-label { color: var(--brand); font-weight: 600; }
  .count { color: var(--ink-faint); font: 400 10px var(--font-data); }
  .note { margin: 14px 0 0; color: var(--ink-faint); font-size: 11px; }
  .none { margin: auto 0; color: var(--ink-faint); }
</style>
