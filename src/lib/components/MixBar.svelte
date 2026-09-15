<script lang="ts">
  import { BarChart } from 'layerchart';
  import * as Chart from '$lib/components/ui/chart/index.js';
  import { exact } from '$lib/format';
  let { cached = 0, fresh = 0, output = 0, height = 8 }: { cached?: number; fresh?: number; output?: number; height?: number } = $props();
  const total = $derived(cached + fresh + output);
  const data = $derived([{ group: 'Tokens', cached, fresh, output }]);
  const config = {
    cached: { label: 'Cached input', color: 'var(--chart-1)' },
    fresh: { label: 'Fresh input', color: 'var(--chart-4)' },
    output: { label: 'Output', color: 'var(--chart-2)' }
  } satisfies Chart.ChartConfig;
  const series = Object.entries(config).map(([key, item]) => ({ key, ...item }));
</script>

<div class="mix min-w-10 overflow-hidden rounded-full bg-muted" style={`height: ${height}px`} role="img" aria-label={total ? `${exact(cached)} cached input, ${exact(fresh)} fresh input, ${exact(output)} output tokens` : 'No tokens recorded'}>
  {#if total > 0}
    <Chart.Container {config} class="h-full w-full aspect-auto">
      <BarChart {data} {series} orientation="horizontal" y="group" seriesLayout="stack"
        xDomain={[0, total]} xNice={false} bandPadding={0} axis={false} grid={false} rule={false} highlight={false}
        tooltipContext={false} motion="none" padding={{ top: 0, bottom: 0, left: 0, right: 0 }} props={{ bars: { radius: 0 } }} />
    </Chart.Container>
  {/if}
</div>
