<script lang="ts">
  import { fmt } from '$lib/format';
  let { values, width = 120, height = 30, color = 'var(--brand)' }: { values: number[]; width?: number; height?: number; color?: string } = $props();
  const pad = 3;
  const points = $derived.by(() => {
    if (values.length < 2) return '';
    const peak = Math.max(...values, 1);
    return values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - 2 * pad);
      const y = height - pad - (v / peak) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  });
  const area = $derived(points ? `${pad},${height - pad} ${points} ${width - pad},${height - pad}` : '');
  const last = $derived(values.length ? values[values.length - 1] : null);
</script>

{#if values.length > 1}
  <svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" role="img" aria-label="Tokens per request, oldest to newest; latest {fmt(last)}">
    <polygon points={area} fill={color} opacity="0.09" />
    <polyline {points} fill="none" stroke={color} stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx={width - pad} cy={height - pad - (last! / Math.max(...values, 1)) * (height - 2 * pad)} r="2.4" fill={color} />
  </svg>
{/if}
