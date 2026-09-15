<script lang="ts">
  import { AreaChart } from 'layerchart';
  import * as Chart from '$lib/components/ui/chart/index.js';
  import { fmt } from '$lib/format';
  let { values, width = 120, height = 30, color = 'var(--chart-1)' }: { values: number[]; width?: number; height?: number; color?: string } = $props();
  const data = $derived(values.map((tokens, index) => ({ request: index + 1, tokens })));
  const config = $derived({ tokens: { label: 'Tokens per request', color } } satisfies Chart.ChartConfig);
</script>

{#if values.length > 1}
  <Chart.Container {config} class="aspect-auto" style={`width: ${width}px; height: ${height}px; max-width: 100%`} role="img" aria-label={`Tokens per request, oldest to newest; latest ${fmt(values.at(-1))}`}>
    <AreaChart {data} x="request" y="tokens" yDomain={[0, Math.max(1, ...values)]}
      series={[{ key: 'tokens', color, label: config.tokens.label }]}
      axis={false} grid={false} rule={false} highlight={false} tooltipContext={false} motion="none"
      padding={{ top: 2, bottom: 2, left: 2, right: 2 }} />
  </Chart.Container>
{/if}
