/**
 * Formats a Date, ISO string, or epoch millisecond timestamp as a 12-hour Event clock
 * (e.g. "8:00 AM") in the given IANA timezone, falling back cleanly if the timezone is invalid.
 */
export function formatEventClock(
  input: Date | string | number | null | undefined,
  timezone?: string | null,
): string {
  if (input === null || input === undefined) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...baseOptions,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', baseOptions).format(date);
  }
}
