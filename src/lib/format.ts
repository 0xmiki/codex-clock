const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const exactFormatter = new Intl.NumberFormat('en');

export const fmt = (n: number | null | undefined) => (n == null ? '—' : compact.format(n));
export const exact = (n: number | null | undefined) => (n == null ? 'Not recorded' : exactFormatter.format(n));

export const money = (n: number | null | undefined) =>
  n == null ? '—' : `≈ $${n.toFixed(n < 1 ? 3 : n < 100 ? 2 : 0)}`;

export const percent = (n: number | null | undefined, digits = 0) => (n == null ? '—' : `${n.toFixed(digits)}%`);

export const project = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd;

export const relativeTime = (seconds: number, now: number) => {
  const delta = Math.max(0, now - seconds * 1000);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

export const fullTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const dayLabel = (key: string, todayKey?: string) => {
  const date = new Date(key + 'T00:00:00Z');
  const label = date.toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
  if (todayKey && key === todayKey) return 'Today';
  return label;
};

export const costRange = (range: { low: number; high: number }) => {
  const dollar = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(Math.abs(n) < 1 ? 3 : 2)}`;
  return Math.abs(range.high - range.low) < .0005 ? `≈ ${dollar(range.low)}` : `≈ ${dollar(range.low)} to ${dollar(range.high)}`;
};
