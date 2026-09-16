<script lang="ts">
  import { fmt } from '$lib/format';
  let { values, width = 120, height = 30, color = 'var(--chart-1)' }: { values: number[]; width?: number; height?: number; color?: string } = $props();
  const points = $derived.by(() => {
    const peak = Math.max(1, ...values);
    const innerHeight = Math.max(0, height - 4);
    return values.map((tokens, index) => {
      const x = 2 + index * Math.max(0, width - 4) / Math.max(1, values.length - 1);
      const y = 2 + innerHeight * (1 - tokens / peak);
      return `${x},${y}`;
    }).join(' ');
  });
  const area = $derived(`2,${height - 2} ${points} ${width - 2},${height - 2}`);
</script>

{#if values.length > 1}
  <svg {width} {height} viewBox={`0 0 ${width} ${height}`} style="max-width: 100%; overflow: visible" role="img" aria-label={`Tokens per request, oldest to newest; latest ${fmt(values.at(-1))}`}>
    <polygon points={area} fill={color} opacity="0.16" />
    <polyline points={points} fill="none" stroke={color} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
{/if}
