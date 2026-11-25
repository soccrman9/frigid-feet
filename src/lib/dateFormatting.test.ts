import { describe, expect, it } from 'vitest';
import { formatEventClock } from './dateFormatting';

describe('formatEventClock', () => {
  it('formats Date, ISO string, and epoch ms in the requested Event timezone', () => {
    const iso = '2027-01-09T13:05:00.000Z';
    expect(formatEventClock(iso, 'America/New_York')).toBe('8:05 AM');
    expect(formatEventClock(new Date(iso), 'America/Chicago')).toBe('7:05 AM');
    expect(formatEventClock(Date.parse(iso), 'UTC')).toBe('1:05 PM');
  });

  it('returns empty string for invalid or missing inputs and falls back on invalid timezone', () => {
    expect(formatEventClock(null, 'America/New_York')).toBe('');
    expect(formatEventClock(undefined, 'America/New_York')).toBe('');
    expect(formatEventClock('not-a-date', 'America/New_York')).toBe('');
    expect(formatEventClock('2027-01-09T13:05:00.000Z', 'Not/A_Timezone')).toMatch(
      /^\d{1,2}:\d{2}\s[AP]M$/,
    );
  });
});
