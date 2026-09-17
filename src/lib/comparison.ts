import type { Thread } from './types';

export function usageComparison(threads: Thread[], now: number, partial = false) {
  const incomplete = partial || threads.some(thread => thread.usageError || !thread.usage || !thread.usage.minuteTokens);
  if (incomplete) return { incomplete: true, average: null, percent: null, yesterday: null, lastWeek: null, previousWeek: null };
  const dayMs = 86_400_000;
  const start = Math.floor(now / dayMs) * dayMs;
  const clock = new Date(now).toISOString().slice(11, 16);
  const days = new Map<string, { total: number; elapsed: number }>();
  let earliest = Infinity;
  for (const thread of threads) {
    for (const [minute, tokens] of Object.entries(thread.usage?.minuteTokens ?? {})) {
      const time = Date.parse(`${minute}:00Z`);
      if (!Number.isFinite(time) || !Number.isFinite(tokens) || tokens < 0) continue;
      earliest = Math.min(earliest, time);
      const day = minute.slice(0, 10);
      const value = days.get(day) ?? { total: 0, elapsed: 0 };
      value.total += tokens;
      if (minute.slice(11, 16) <= clock) value.elapsed += tokens;
      days.set(day, value);
    }
  }
  const at = (offset: number) => days.get(new Date(start - offset * dayMs).toISOString().slice(0, 10)) ?? { total: 0, elapsed: 0 };
  const average = earliest < start - 7 * dayMs ? Array.from({ length: 7 }, (_, i) => at(i + 1).elapsed).reduce((a, b) => a + b, 0) / 7 : null;
  const today = at(0).elapsed;
  return {
    incomplete: false,
    average,
    percent: average !== null && average > 0 ? (today / average - 1) * 100 : null,
    yesterday: earliest < start - dayMs ? at(1).elapsed : null,
    lastWeek: earliest < start - 7 * dayMs ? Array.from({ length: 7 }, (_, i) => at(i + 1).total).reduce((a, b) => a + b, 0) : null,
    previousWeek: earliest < start - 14 * dayMs ? Array.from({ length: 7 }, (_, i) => at(i + 8).total).reduce((a, b) => a + b, 0) : null
  };
}
