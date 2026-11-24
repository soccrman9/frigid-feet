import { describe, expect, it } from 'vitest';
import type { EventSnapshot, Leg, Participant, Round, Team } from '../../types/domain';
import {
  formatDashboardCountdown,
  selectActiveRoundNumber,
  selectCollectiveKm,
  selectDashboardTeams,
  selectLiveBadgeTickerItems,
  selectOnDeckSummary,
  selectOutOnCourseRunners,
} from './dashboardData';

function makeRounds(startIso = '2027-01-09T13:00:00.000Z'): Round[] {
  const baseMs = Date.parse(startIso);
  return Array.from({ length: 10 }, (_, i) => ({
    id: `r-${i + 1}`,
    eventId: 'evt-1',
    roundNumber: i + 1,
    scheduledStartAt: new Date(baseMs + i * 3_600_000).toISOString(),
    startedAt: i < 2 ? new Date(baseMs + i * 3_600_000).toISOString() : null,
  }));
}

function makeLegsForTeam(
  teamId: string,
  completedRounds: number[],
  outRounds: Array<{ round: number; runnerId: string; startedAt: string; courseId?: string }> = [],
  scheduledRunners: Record<number, string> = {},
): Leg[] {
  const completedSet = new Set(completedRounds);
  const outMap = new Map(outRounds.map((o) => [o.round, o]));
  return Array.from({ length: 10 }, (_, i) => {
    const roundNumber = i + 1;
    const out = outMap.get(roundNumber);
    if (out) {
      return {
        id: `${teamId}-r${roundNumber}`,
        eventId: 'evt-1',
        teamId,
        roundNumber,
        runnerId: out.runnerId,
        courseId: out.courseId ?? 'course-1',
        status: 'out_on_course' as const,
        startedAt: out.startedAt,
        finishedAt: null,
        durationSeconds: null,
        externalActivityUrl: null,
        clientUpdatedAt: out.startedAt,
        lastMutationId: null,
        updatedByOrganizer: false,
      };
    }
    if (completedSet.has(roundNumber)) {
      return {
        id: `${teamId}-r${roundNumber}`,
        eventId: 'evt-1',
        teamId,
        roundNumber,
        runnerId: scheduledRunners[roundNumber] ?? 'p-1',
        courseId: 'course-1',
        status: 'completed' as const,
        startedAt: '2027-01-09T13:00:00.000Z',
        finishedAt: '2027-01-09T13:28:00.000Z',
        durationSeconds: 1680,
        externalActivityUrl: null,
        clientUpdatedAt: '2027-01-09T13:28:00.000Z',
        lastMutationId: null,
        updatedByOrganizer: false,
      };
    }
    return {
      id: `${teamId}-r${roundNumber}`,
      eventId: 'evt-1',
      teamId,
      roundNumber,
      runnerId: scheduledRunners[roundNumber] ?? null,
      courseId: 'course-1',
      status: 'scheduled' as const,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      externalActivityUrl: null,
      clientUpdatedAt: '2027-01-09T12:00:00.000Z',
      lastMutationId: null,
      updatedByOrganizer: false,
    };
  });
}

function makeSnapshot(): EventSnapshot {
  const teams: Team[] = [
    {
      id: 't-z',
      eventId: 'evt-1',
      name: 'Zesty Snowshoes',
      tagline: null,
      colorHex: '#157A4B',
      emoji: '❄️',
      isOpen: true,
      lookingNote: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
    {
      id: 't-a',
      eventId: 'evt-1',
      name: 'Arctic Anchors',
      tagline: null,
      colorHex: '#163A59',
      emoji: '⚓',
      isOpen: true,
      lookingNote: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
    {
      id: 't-m',
      eventId: 'evt-1',
      name: 'Mitten Striders',
      tagline: null,
      colorHex: '#C86D09',
      emoji: '🧤',
      isOpen: true,
      lookingNote: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
  ];

  const participants: Participant[] = [
    {
      id: 'p-1',
      eventId: 'evt-1',
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: 't-a',
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 30,
      isFirst5k: true,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
    {
      id: 'p-2',
      eventId: 'evt-1',
      displayName: 'Sam Patel',
      rsvpStatus: 'going_runner',
      teamId: 't-m',
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 35,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
    {
      id: 'p-3',
      eventId: 'evt-1',
      displayName: 'Jordan Lee',
      rsvpStatus: 'going_runner',
      teamId: 't-z',
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
  ];

  const legs: Leg[] = [
    // Arctic Anchors: 10/10 completed (50K Finisher)
    ...makeLegsForTeam('t-a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [], { 1: 'p-1' }),
    // Mitten Striders: 5 completed (Halfway) + 1 out > 60 min + scheduled for R3
    ...makeLegsForTeam(
      't-m',
      [1, 4, 5, 6, 7],
      [{ round: 2, runnerId: 'p-2', startedAt: '2027-01-09T13:30:00.000Z', courseId: 'course-2' }],
      { 3: 'p-2' },
    ),
    // Zesty Snowshoes: 1 completed + 1 out normal + scheduled for R3
    ...makeLegsForTeam(
      't-z',
      [1],
      [{ round: 2, runnerId: 'p-3', startedAt: '2027-01-09T14:25:00.000Z', courseId: 'course-1' }],
      { 3: 'p-3' },
    ),
  ];

  return {
    event: {
      id: 'evt-1',
      slug: '2027',
      name: 'Winter Grind 50K 2027',
      eventDate: '2027-01-09',
      startTime: '2027-01-09T13:00:00.000Z',
      timezone: 'America/New_York',
      isActive: true,
      basecampName: 'Lakeside Pavilion',
      basecampAddress: null,
      basecampMapsUrl: null,
      parkingAmenitiesNotes: null,
      coldWeatherTips: null,
      safetyFirstAidNotes: null,
      stravaClubUrl: null,
      recapNote: null,
      chipInTargetCents: 0,
      chipInSuggestedCents: null,
      chipInBreakdown: [],
      venmoHandle: null,
      zelleHandle: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
    courses: [
      {
        id: 'course-1',
        eventId: 'evt-1',
        name: 'Boardwalk 5K',
        description: null,
        distanceKm: 5,
        isPrimary: true,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 0,
      },
      {
        id: 'course-2',
        eventId: 'evt-1',
        name: 'Pine Ridge 5K',
        description: null,
        distanceKm: 5,
        isPrimary: false,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 1,
      },
    ],
    announcements: [],
    rounds: makeRounds('2027-01-09T13:00:00.000Z'),
    teams,
    participants,
    legs,
    supplyItems: [],
    supplyClaims: [],
    badgeDefinitions: [
      {
        id: 'bd-1',
        eventId: 'evt-1',
        name: 'Best Cold-Weather Outfit',
        emoji: '🧣',
        description: 'Iconic winter kit.',
        isPreset: true,
      },
    ],
    badgeAwards: [
      {
        id: 'ba-1',
        eventId: 'evt-1',
        badgeDefinitionId: 'bd-1',
        participantId: 'p-1',
        teamId: null,
        note: 'Neon balaclava!',
        awardedAt: '2027-01-09T14:35:00.000Z',
      },
    ],
    chipInTotalCents: 0,
    chipIns: [],
  };
}

describe('dashboardData — pure Basecamp Dashboard selectors', () => {
  it('computes Event-wide collective km and Out on Course cards with calm >60 min ETA handling', () => {
    const snap = makeSnapshot();
    // 10 + 5 + 1 = 16 completed Legs -> 80 km
    expect(selectCollectiveKm(snap)).toBe(80);

    // nowMs = 14:38:00Z -> Rounds 1 & 2 started, Round 3 scheduled at 15:00Z -> active Round is 2
    const nowMs = Date.parse('2027-01-09T14:38:00.000Z');
    expect(selectActiveRoundNumber(snap, nowMs)).toBe(2);
    const outCards = selectOutOnCourseRunners(snap, nowMs);
    expect(outCards).toHaveLength(2);

    // Longest out first: Sam Patel (68 min) then Jordan Lee (13 min)
    expect(outCards[0]).toMatchObject({
      runnerName: 'Sam Patel',
      teamName: 'Mitten Striders',
      courseName: 'Pine Ridge 5K',
      elapsedLabel: '1:08:00',
      isOver60Min: true,
    });
    // Calm non-alarming ETA copy for >60 min Runner
    expect(outCards[0].etaLabel.toLowerCase()).not.toMatch(/overdue|late|alert|danger|warning/);

    expect(outCards[1]).toMatchObject({
      runnerName: 'Jordan Lee',
      teamName: 'Zesty Snowshoes',
      courseName: 'Boardwalk 5K',
      elapsedLabel: '13:00',
      isOver60Min: false,
    });
  });

  it('selects On Deck next-Round countdown and scheduled Runners, returning null when all 10 Rounds started', () => {
    const snap = makeSnapshot();
    // Round 3 scheduled at 15:00:00Z; nowMs = 14:55:20Z -> 4m 40s left
    const nowMs = Date.parse('2027-01-09T14:55:20.000Z');
    const onDeck = selectOnDeckSummary(snap, nowMs);

    expect(onDeck).not.toBeNull();
    expect(onDeck?.roundNumber).toBe(3);
    expect(onDeck?.countdownSeconds).toBe(280);
    expect(onDeck?.countdownLabel).toBe('04:40');
    expect(onDeck?.runners.map((r) => `${r.runnerName} (${r.teamName})`)).toEqual([
      'Sam Patel (Mitten Striders)',
      'Jordan Lee (Zesty Snowshoes)',
    ]);

    // Countdown formatting helper edge cases
    expect(formatDashboardCountdown(0)).toBe('00:00');
    expect(formatDashboardCountdown(3725)).toBe('1h 02m');

    // All 10 Rounds started -> returns null
    const allStartedSnap: EventSnapshot = {
      ...snap,
      rounds: snap.rounds.map((r) => ({ ...r, startedAt: r.scheduledStartAt })),
    };
    expect(selectOnDeckSummary(allStartedSnap, nowMs)).toBeNull();
  });

  it('orders Teams alphabetically with 10-segment 50K progress and Halfway / 50K Finisher milestone callouts', () => {
    const snap = makeSnapshot();
    const teams = selectDashboardTeams(snap);

    expect(teams.map((t) => t.team.name)).toEqual([
      'Arctic Anchors',
      'Mitten Striders',
      'Zesty Snowshoes',
    ]);

    // Arctic Anchors: 10/10 -> 50K Finisher
    expect(teams[0].completedLegsCount).toBe(10);
    expect(teams[0].completedKm).toBe(50);
    expect(teams[0].segments).toHaveLength(10);
    expect(teams[0].segments.every((s) => s.status === 'completed')).toBe(true);
    expect(teams[0].milestone?.kind).toBe('50k_finisher');
    expect(teams[0].milestone?.label).toMatch(/50K Finisher/i);

    // Mitten Striders: 5/10 -> Halfway milestone + 1 out_on_course segment
    expect(teams[1].completedLegsCount).toBe(5);
    expect(teams[1].completedKm).toBe(25);
    expect(teams[1].outOnCourseCount).toBe(1);
    expect(teams[1].milestone?.kind).toBe('halfway');
    expect(teams[1].milestone?.label).toMatch(/Halfway/i);

    // Zesty Snowshoes: 1/10 -> no milestone yet
    expect(teams[2].completedLegsCount).toBe(1);
    expect(teams[2].completedKm).toBe(5);
    expect(teams[2].milestone).toBeNull();
  });

  it('combines Organizer-awarded superlatives and auto-calculated Badges for the Live Badges ticker', () => {
    const snap = makeSnapshot();
    const items = selectLiveBadgeTickerItems(snap);

    // Organizer superlative appears first
    expect(items[0]).toMatchObject({
      source: 'organizer',
      title: 'Best Cold-Weather Outfit',
      recipientName: 'Maya Chen',
      note: 'Neon balaclava!',
    });

    // Auto-calculated Team and Participant badges are also present
    const titles = items.map((item) => `${item.title}::${item.recipientName}`);
    expect(titles).toContain('50K Finisher::Arctic Anchors');
    expect(titles).toContain('Halfway There::Mitten Striders');
    expect(titles).toContain('First 5K Club::Maya Chen');
  });
});
