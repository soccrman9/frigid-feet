import { describe, expect, it, vi } from 'vitest';
import type { Round } from '../../types/domain';
import {
  CHIME_LEAD_MS,
  CHIME_TRIGGER_WINDOW_MS,
  evaluateChimeTriggers,
  playDashboardChime,
  type AudioContextLike,
} from './dashboardChime';

function makeRounds(startIso = '2027-01-09T13:00:00.000Z'): Round[] {
  const baseMs = Date.parse(startIso);
  return Array.from({ length: 10 }, (_, i) => ({
    id: `round-${i + 1}`,
    eventId: 'evt-1',
    roundNumber: i + 1,
    scheduledStartAt: new Date(baseMs + i * 3_600_000).toISOString(),
    startedAt: null,
  }));
}

describe('dashboardChime — T-5 / T-0 round reminder scheduler & Web Audio chime', () => {
  it('fires T-5 min and T-0 triggers within window, skips already-started rounds, and deduplicates via firedKeys', () => {
    const rounds = makeRounds('2027-01-09T13:00:00.000Z');
    // Round 2 is scheduled at 14:00:00Z
    const r2StartMs = Date.parse('2027-01-09T14:00:00.000Z');
    const firedKeys = new Set<string>();

    // T-5m01s -> nothing yet
    expect(evaluateChimeTriggers(rounds, r2StartMs - CHIME_LEAD_MS - 1_000, firedKeys)).toEqual([]);

    // Exact T-5m00s -> fires 2:t-5
    const t5Triggers = evaluateChimeTriggers(rounds, r2StartMs - CHIME_LEAD_MS, firedKeys);
    expect(t5Triggers).toEqual([
      {
        key: '2:t-5',
        roundNumber: 2,
        kind: 't-5',
        scheduledStartAt: '2027-01-09T14:00:00.000Z',
      },
    ]);

    // Recording fired key prevents duplicate chimes on subsequent ticks / re-renders
    firedKeys.add(t5Triggers[0].key);
    expect(evaluateChimeTriggers(rounds, r2StartMs - CHIME_LEAD_MS + 1_000, firedKeys)).toEqual([]);
    expect(evaluateChimeTriggers(rounds, r2StartMs - CHIME_LEAD_MS + 15_000, firedKeys)).toEqual([]);

    // Past the 60s T-5 window without having fired -> does NOT fire stale chime
    expect(
      evaluateChimeTriggers(rounds, r2StartMs - CHIME_LEAD_MS + CHIME_TRIGGER_WINDOW_MS, new Set()),
    ).toEqual([]);

    // Exact T-0 -> fires 2:t-0
    const t0Triggers = evaluateChimeTriggers(rounds, r2StartMs, firedKeys);
    expect(t0Triggers).toEqual([
      {
        key: '2:t-0',
        roundNumber: 2,
        kind: 't-0',
        scheduledStartAt: '2027-01-09T14:00:00.000Z',
      },
    ]);

    firedKeys.add(t0Triggers[0].key);
    expect(evaluateChimeTriggers(rounds, r2StartMs + 5_000, firedKeys)).toEqual([]);

    // Already-started Round never fires T-5 or T-0
    rounds[1].startedAt = '2027-01-09T13:54:00.000Z';
    expect(evaluateChimeTriggers(rounds, r2StartMs - CHIME_LEAD_MS, new Set())).toEqual([]);
    expect(evaluateChimeTriggers(rounds, r2StartMs, new Set())).toEqual([]);
  });

  it('synthesizes gentle sine + triangle harmonic bell tones via AudioContext and safely no-ops when AudioContext is unavailable', () => {
    const oscillators: Array<{
      type: OscillatorType;
      frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const gains: Array<{
      gain: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        linearRampToValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      };
      connect: ReturnType<typeof vi.fn>;
    }> = [];

    const mockContext: AudioContextLike = {
      currentTime: 10,
      state: 'suspended',
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => {
        const osc = {
          type: 'sine' as OscillatorType,
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(osc);
        return osc;
      }),
      createGain: vi.fn(() => {
        const g = {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
        gains.push(g);
        return g;
      }),
    };

    const playedT5 = playDashboardChime('t-5', mockContext);
    expect(playedT5).toBe(true);
    expect(mockContext.resume).toHaveBeenCalledTimes(1);
    expect(oscillators.some((o) => o.type === 'sine')).toBe(true);
    expect(oscillators.some((o) => o.type === 'triangle')).toBe(true);
    expect(oscillators.every((o) => o.start.mock.calls.length === 1 && o.stop.mock.calls.length === 1)).toBe(true);

    const t5OscCount = oscillators.length;
    const playedT0 = playDashboardChime('t-0', mockContext);
    expect(playedT0).toBe(true);
    // T-0 uses a fuller 3-note rising bell cadence than T-5's 2-note chime
    expect(oscillators.length - t5OscCount).toBeGreaterThan(t5OscCount);

    // Safe graceful no-op in environments without Web Audio (null context + no global AudioContext)
    expect(playDashboardChime('t-5', null)).toBe(false);
  });
});
