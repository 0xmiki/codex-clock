<script lang="ts">
  import { ArcChart } from 'layerchart';
  import * as Chart from '$lib/components/ui/chart/index.js';
  let { value, size = 92, stroke = 9, color = 'var(--chart-2)', track = 'var(--muted)', label = 'Usage' }: { value: number; size?: number; stroke?: number; color?: string; track?: string; label?: string } = $props();
  const config = $derived({ value: { label, color } } satisfies Chart.ChartConfig);
  const data = $derived([{ key: 'value', label, value: Math.min(100, Math.max(0, value)) }]);
</script>

<Chart.Container {config} class="aspect-square" style={`width: ${size}px; height: ${size}px`} role="img" aria-label={`${label}: ${Math.round(value)} out of 100`}>
  <ArcChart {data} maxValue={100} innerRadius={size / 2 - stroke - 3} outerRadius={size / 2 - 3}
    series={[{ key: 'value', label, color }]} motion="none" tooltipContext={false}
    props={{ arc: { track: { fill: track, fillOpacity: 1 } } }} />
</Chart.Container>
