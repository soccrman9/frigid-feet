export interface FormatUsdOptions {
  alwaysShowCents?: boolean;
}

export function formatUsd(cents: number, options?: FormatUsdOptions): string {
  const safeCents = Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0;
  const dollars = safeCents / 100;
  const hasRemainder = safeCents % 100 !== 0;
  const showCents = Boolean(options?.alwaysShowCents) || hasRemainder;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(dollars);
}

export function centsToDollarInput(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return '';
  return (Math.round(cents) / 100).toFixed(2);
}

export type ParseDollarResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

const MAX_CHIP_IN_CENTS = 100_000_000; // $1,000,000 safety ceiling

export function parsePositiveDollarInputToCents(raw: string): ParseDollarResult {
  const cleaned = raw.trim().replace(/^\$/, '').trim();
  if (!cleaned) {
    return { ok: false, error: 'Enter a chip-in amount greater than $0.' };
  }
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(cleaned)) {
    return {
      ok: false,
      error: 'Enter a valid dollar amount with up to two decimal places (for example 15 or 15.50).',
    };
  }
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return { ok: false, error: 'Chip-in amount must be greater than $0.00.' };
  }
  if (cents > MAX_CHIP_IN_CENTS) {
    return { ok: false, error: 'Chip-in amount exceeds the maximum allowed entry.' };
  }
  return { ok: true, cents };
}

export interface ChipInProgressMetrics {
  hasTarget: boolean;
  percentage: number;
  clampedPercentage: number;
  isCovered: boolean;
  remainingCents: number;
}

export function computeChipInProgress(
  totalCents: number,
  targetCents: number,
): ChipInProgressMetrics {
  const safeTotal = Number.isFinite(totalCents) && totalCents > 0 ? Math.round(totalCents) : 0;
  const safeTarget = Number.isFinite(targetCents) && targetCents > 0 ? Math.round(targetCents) : 0;

  if (safeTarget <= 0) {
    return {
      hasTarget: false,
      percentage: 0,
      clampedPercentage: 0,
      isCovered: false,
      remainingCents: 0,
    };
  }

  const percentage = Math.round((safeTotal / safeTarget) * 100);
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  return {
    hasTarget: true,
    percentage,
    clampedPercentage,
    isCovered: safeTotal >= safeTarget,
    remainingCents: Math.max(0, safeTarget - safeTotal),
  };
}

export function formatChipInTimestamp(isoString: string, timezone?: string | null): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}
