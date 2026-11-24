import { describe, expect, it } from 'vitest';
import {
  centsToDollarInput,
  computeChipInProgress,
  formatChipInTimestamp,
  formatUsd,
  parsePositiveDollarInputToCents,
} from './chipInFormatting';

describe('chipInFormatting helpers', () => {
  it('formats whole-dollar and cent amounts cleanly with optional exact cents', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(1500)).toBe('$15');
    expect(formatUsd(30000)).toBe('$300');
    expect(formatUsd(125000)).toBe('$1,250');
    expect(formatUsd(1550)).toBe('$15.50');
    expect(formatUsd(5)).toBe('$0.05');
    expect(formatUsd(123456)).toBe('$1,234.56');

    expect(formatUsd(1500, { alwaysShowCents: true })).toBe('$15.00');
    expect(formatUsd(0, { alwaysShowCents: true })).toBe('$0.00');
    expect(formatUsd(-500)).toBe('$0');
    expect(formatUsd(Number.NaN)).toBe('$0');
  });

  it('parses valid positive dollar/cent inputs and rejects zero, negative, and malformed strings', () => {
    expect(parsePositiveDollarInputToCents('25')).toEqual({ ok: true, cents: 2500 });
    expect(parsePositiveDollarInputToCents('$25')).toEqual({ ok: true, cents: 2500 });
    expect(parsePositiveDollarInputToCents(' 15.5 ')).toEqual({ ok: true, cents: 1550 });
    expect(parsePositiveDollarInputToCents('15.50')).toEqual({ ok: true, cents: 1550 });
    expect(parsePositiveDollarInputToCents('0.75')).toEqual({ ok: true, cents: 75 });
    expect(parsePositiveDollarInputToCents('.50')).toEqual({ ok: true, cents: 50 });

    for (const invalid of ['', '   ', '0', '0.00', '$0', '-10', '12.345', 'abc', '25..00']) {
      const result = parsePositiveDollarInputToCents(invalid);
      expect(result.ok).toBe(false);
    }
  });

  it('converts integer cents to editable dollar input strings', () => {
    expect(centsToDollarInput(2500)).toBe('25.00');
    expect(centsToDollarInput(1550)).toBe('15.50');
    expect(centsToDollarInput(5)).toBe('0.05');
  });

  it('computes progress percentage, clamps bar width at 100%, and handles $0 target safely', () => {
    expect(computeChipInProgress(15000, 30000)).toEqual({
      hasTarget: true,
      percentage: 50,
      clampedPercentage: 50,
      isCovered: false,
      remainingCents: 15000,
    });

    expect(computeChipInProgress(45000, 30000)).toEqual({
      hasTarget: true,
      percentage: 150,
      clampedPercentage: 100,
      isCovered: true,
      remainingCents: 0,
    });

    // $0 target must never produce NaN or Infinity
    expect(computeChipInProgress(0, 0)).toEqual({
      hasTarget: false,
      percentage: 0,
      clampedPercentage: 0,
      isCovered: false,
      remainingCents: 0,
    });

    expect(computeChipInProgress(5000, 0)).toEqual({
      hasTarget: false,
      percentage: 0,
      clampedPercentage: 0,
      isCovered: false,
      remainingCents: 0,
    });
  });

  it('formats chip-in timestamps in the Event timezone with safe fallback', () => {
    const formatted = formatChipInTimestamp('2027-01-09T15:30:00.000Z', 'America/New_York');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('9');
    expect(formatted).toContain('10:30');

    expect(formatChipInTimestamp('2027-01-09T15:30:00.000Z', 'Invalid/Timezone')).toBeTruthy();
    expect(formatChipInTimestamp('not-a-date', 'America/New_York')).toBe('');
  });
});
