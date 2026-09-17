import { expect, test } from 'bun:test';
import { parseAccountLimits } from '../server/limits';

test('account limits preserve both windows and convert reset seconds to milliseconds', () => {
  expect(parseAccountLimits({ rateLimits: { planType: 'pro', primary: { usedPercent: 68, windowDurationMins: 10080, resetsAt: 1789806430 }, secondary: { usedPercent: 105, windowDurationMins: 300 } } }, 123)).toEqual({ plan: 'pro', checkedAt: 123, windows: [{ remaining: 32, minutes: 10080, resetsAt: 1789806430000 }, { remaining: 0, minutes: 300, resetsAt: null }] });
});

test('missing or malformed quota never becomes full allowance', () => {
  for (const value of [null, {}, { rateLimits: {} }, { rateLimits: { primary: { usedPercent: '0' } } }, { rateLimits: { primary: { usedPercent: -1 } } }]) expect(parseAccountLimits(value)).toBeNull();
});
