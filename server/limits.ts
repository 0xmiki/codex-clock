import type { AccountLimits, LimitWindow } from '../src/lib/types';

export function parseAccountLimits(response: unknown, checkedAt = Date.now()): AccountLimits | null {
  const value = (response as any)?.rateLimits;
  if (!value || typeof value !== 'object') return null;
  const windows: LimitWindow[] = [];
  for (const window of [value.primary, value.secondary]) {
    if (!window || typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent) || window.usedPercent < 0) continue;
    windows.push({
      remaining: Math.max(0, 100 - window.usedPercent),
      minutes: Number.isFinite(window.windowDurationMins) && window.windowDurationMins > 0 ? window.windowDurationMins : null,
      resetsAt: Number.isSafeInteger(window.resetsAt) && window.resetsAt > 0 && window.resetsAt <= 8_640_000_000_000 ? window.resetsAt * 1000 : null
    });
  }
  return windows.length ? { windows, plan: typeof value.planType === 'string' ? value.planType : null, checkedAt } : null;
}
