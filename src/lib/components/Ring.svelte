<script lang="ts">
  let { value, size = 92, stroke = 9, color = 'var(--brand)', track = 'var(--bg3)' }: { value: number; size?: number; stroke?: number; color?: string; track?: string } = $props();
  const radius = $derived(50 - stroke);
  const circumference = $derived(2 * Math.PI * radius);
</script>

<svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${Math.round(value)} percent`}>
  <circle cx="50" cy="50" r={radius} fill="none" stroke={track} stroke-width={stroke} />
  <circle
    cx="50" cy="50" r={radius} fill="none"
    stroke={color} stroke-width={stroke} stroke-linecap="round"
    stroke-dasharray={circumference}
    stroke-dashoffset={circumference * (1 - Math.min(1, Math.max(0, value / 100)))}
    transform="rotate(-90 50 50)"
  />
</svg>
