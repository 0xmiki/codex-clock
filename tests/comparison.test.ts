import { expect, test } from 'bun:test';
import { usageComparison } from '../src/lib/comparison';
import type { Thread } from '../src/lib/types';

test('usual compares the same UTC minute, includes inactive days and ignores later usage', () => {
  const threads = [{ usage: { minuteTokens: {
    '2026-09-01T10:00': 1,
    '2026-09-16T10:00': 700,
    '2026-09-16T18:00': 900,
    '2026-09-17T10:00': 200
  } } }] as unknown as Thread[];
  const result = usageComparison(threads, Date.parse('2026-09-17T12:00:00Z'));
  expect(result.average).toBe(100);
  expect(result.percent).toBe(100);
  expect(result.yesterday).toBe(700);
  expect(result.lastWeek).toBe(1600);
  expect(result.previousWeek).toBe(0);
});

test('insufficient and zero history cannot produce a misleading percentage', () => {
  expect(usageComparison([], Date.now()).percent).toBeNull();
  const threads = [{ usage: { minuteTokens: { '2026-09-16T10:00': 100 } } }] as unknown as Thread[];
  expect(usageComparison(threads, Date.parse('2026-09-17T12:00:00Z')).average).toBeNull();
});
