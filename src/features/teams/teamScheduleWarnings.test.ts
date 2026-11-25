import { describe, expect, it } from 'vitest';
import type { Leg, Participant, Team } from '../../types/domain';
import {
  getFreeAgents,
  getLegScheduleWarnings,
  getTeamCoverage,
  sortTeamsAlphabetically,
  TEAM_EMOJI_PRESETS,
} from './teamScheduleWarnings';

function makeParticipant(overrides: Partial<Participant> & { id: string; displayName: string }): Participant {
  return {
    eventId: 'evt-1',
    rsvpStatus: 'going_runner',
    teamId: 'team-1',
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
    createdAt: '2026-12-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTeamLegs(teamId: string, assignments: Record<number, { runnerId: string | null; status?: Leg['status'] }>): Leg[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const roundNumber = idx + 1;
    const entry = assignments[roundNumber];
    return {
      id: `leg-${teamId}-${roundNumber}`,
      eventId: 'evt-1',
      teamId,
      roundNumber,
      runnerId: entry?.runnerId ?? null,
      courseId: 'course-1',
      status: entry?.status ?? 'scheduled',
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      externalActivityUrl: null,
      clientUpdatedAt: '2026-12-01T00:00:00.000Z',
      lastMutationId: null,
      updatedByOrganizer: false,
    };
  });
}

describe('teamScheduleWarnings — calm non-blocking warnings, coverage, sorting, and Free Agents', () => {
  it('warns calmly when a Runner is assigned outside their RSVP Round availability window', () => {
    const maya = makeParticipant({
      id: 'p-maya',
      displayName: 'Maya Chen',
      availableFromRound: 3,
      availableToRound: 7,
    });
    const byId = new Map([[maya.id, maya]]);
    const legs = makeTeamLegs('team-1', {
      2: { runnerId: maya.id },
      3: { runnerId: maya.id },
      7: { runnerId: maya.id },
      8: { runnerId: maya.id },
    });

    // Round 2 is before availableFromRound (3) -> outside_availability (and back-to-back with 3)
    const r2Warnings = getLegScheduleWarnings(legs[1], legs, byId);
    expect(r2Warnings.some((w) => w.kind === 'outside_availability')).toBe(true);
    expect(r2Warnings.find((w) => w.kind === 'outside_availability')?.message).toContain('Rounds 3–7');

    // Boundary Round 3 is inside [3, 7] -> no outside_availability warning
    const r3Warnings = getLegScheduleWarnings(legs[2], legs, byId);
    expect(r3Warnings.some((w) => w.kind === 'outside_availability')).toBe(false);

    // Boundary Round 7 is inside [3, 7] -> no outside_availability warning
    const r7Warnings = getLegScheduleWarnings(legs[6], legs, byId);
    expect(r7Warnings.some((w) => w.kind === 'outside_availability')).toBe(false);

    // Round 8 is after availableToRound (7) -> outside_availability
    const r8Warnings = getLegScheduleWarnings(legs[7], legs, byId);
    expect(r8Warnings.some((w) => w.kind === 'outside_availability')).toBe(true);
  });

  it('warns calmly when a Runner is assigned to back-to-back Rounds and allows non-adjacent multi-Leg schedules without warning', () => {
    const alex = makeParticipant({
      id: 'p-alex',
      displayName: 'Alex Rivera',
      availableFromRound: 1,
      availableToRound: 10,
    });
    const byId = new Map([[alex.id, alex]]);
    const legs = makeTeamLegs('team-1', {
      1: { runnerId: alex.id },
      4: { runnerId: alex.id },
      5: { runnerId: alex.id },
      6: { runnerId: alex.id },
      9: { runnerId: alex.id },
    });

    // Non-adjacent Rounds 1 & 9 have zero warnings
    expect(getLegScheduleWarnings(legs[0], legs, byId)).toEqual([]);
    expect(getLegScheduleWarnings(legs[8], legs, byId)).toEqual([]);

    // Unassigned Round 2 has zero warnings
    expect(getLegScheduleWarnings(legs[1], legs, byId)).toEqual([]);

    // Round 4 is back-to-back with Round 5
    const r4 = getLegScheduleWarnings(legs[3], legs, byId);
    expect(r4).toHaveLength(1);
    expect(r4[0].kind).toBe('back_to_back');
    expect(r4[0].message).toContain('Round 5');

    // Round 5 is back-to-back with Rounds 4 & 6
    const r5 = getLegScheduleWarnings(legs[4], legs, byId);
    expect(r5).toHaveLength(1);
    expect(r5[0].kind).toBe('back_to_back');
    expect(r5[0].message).toContain('Rounds 4 & 6');

    // Round 6 is back-to-back with Round 5
    const r6 = getLegScheduleWarnings(legs[5], legs, byId);
    expect(r6).toHaveLength(1);
    expect(r6[0].kind).toBe('back_to_back');
    expect(r6[0].message).toContain('Round 5');
  });

  it('summarizes Team Round coverage and explicit uncovered Round labels accurately', () => {
    const legsTwoOpen = makeTeamLegs('team-1', {
      1: { runnerId: 'p1', status: 'completed' },
      2: { runnerId: 'p1', status: 'out_on_course' },
      3: { runnerId: 'p2' },
      5: { runnerId: 'p2' },
      6: { runnerId: 'p1' },
      8: { runnerId: 'p2' },
      9: { runnerId: 'p1' },
      10: { runnerId: 'p2' },
    });

    const summary = getTeamCoverage('team-1', legsTwoOpen);
    expect(summary.coveredCount).toBe(8);
    expect(summary.completedCount).toBe(1);
    expect(summary.outOnCourseCount).toBe(1);
    expect(summary.uncoveredRounds).toEqual([4, 7]);
    expect(summary.uncoveredSummary).toBe('Rounds 4 & 7 open');

    // Single open Round
    const legsOneOpen = makeTeamLegs('team-2', {
      1: { runnerId: 'p1' },
      2: { runnerId: 'p1' },
      3: { runnerId: 'p1' },
      5: { runnerId: 'p1' },
      6: { runnerId: 'p1' },
      7: { runnerId: 'p1' },
      8: { runnerId: 'p1' },
      9: { runnerId: 'p1' },
      10: { runnerId: 'p1' },
    });
    expect(getTeamCoverage('team-2', legsOneOpen).uncoveredSummary).toBe('Round 4 open');

    // Three open Rounds
    const legsThreeOpen = makeTeamLegs('team-3', {
      1: { runnerId: 'p1' },
      3: { runnerId: 'p1' },
      5: { runnerId: 'p1' },
      6: { runnerId: 'p1' },
      8: { runnerId: 'p1' },
      9: { runnerId: 'p1' },
      10: { runnerId: 'p1' },
    });
    expect(getTeamCoverage('team-3', legsThreeOpen).uncoveredSummary).toBe('Rounds 2, 4 & 7 open');

    // All 10 open
    expect(getTeamCoverage('team-4', makeTeamLegs('team-4', {})).uncoveredSummary).toBe(
      'Rounds 1–10 open',
    );

    // All 10 covered
    const allCovered = makeTeamLegs(
      'team-5',
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { runnerId: 'p1' }])),
    );
    expect(getTeamCoverage('team-5', allCovered)).toMatchObject({
      coveredCount: 10,
      uncoveredRounds: [],
      uncoveredSummary: 'All 10 Rounds covered',
    });
  });

  it('sorts Teams alphabetically case-insensitively and lists only Going (Runner) Participants without a Team as Free Agents', () => {
    const teams: Team[] = [
      {
        id: 't3',
        eventId: 'evt-1',
        name: 'Zephyr Striders',
        tagline: null,
        colorHex: null,
        emoji: null,
        isOpen: true,
        lookingNote: null,
        createdAt: '2026-12-01T00:00:00.000Z',
      },
      {
        id: 't1',
        eventId: 'evt-1',
        name: 'arctic foxes',
        tagline: null,
        colorHex: null,
        emoji: null,
        isOpen: true,
        lookingNote: null,
        createdAt: '2026-12-01T00:00:00.000Z',
      },
      {
        id: 't2',
        eventId: 'evt-1',
        name: 'Frostbite Fighters',
        tagline: null,
        colorHex: null,
        emoji: null,
        isOpen: false,
        lookingNote: null,
        createdAt: '2026-12-01T00:00:00.000Z',
      },
    ];

    expect(sortTeamsAlphabetically(teams).map((t) => t.name)).toEqual([
      'arctic foxes',
      'Frostbite Fighters',
      'Zephyr Striders',
    ]);

    const participants: Participant[] = [
      makeParticipant({ id: 'p1', displayName: 'Zoe Park', rsvpStatus: 'going_runner', teamId: null }),
      makeParticipant({ id: 'p2', displayName: 'Alex Rivera', rsvpStatus: 'going_runner', teamId: 't1' }),
      makeParticipant({ id: 'p3', displayName: 'Samir Patel', rsvpStatus: 'going_supporter', teamId: null }),
      makeParticipant({ id: 'p4', displayName: 'Elena Cruz', rsvpStatus: 'maybe', teamId: null }),
      makeParticipant({ id: 'p5', displayName: 'Ben Kim', rsvpStatus: 'going_runner', teamId: null }),
      makeParticipant({ id: 'p6', displayName: 'Dana Wu', rsvpStatus: 'cant_make_it', teamId: null }),
    ];

    expect(getFreeAgents(participants).map((p) => p.displayName)).toEqual(['Ben Kim', 'Zoe Park']);
    expect(TEAM_EMOJI_PRESETS).not.toContain('❄️');
  });
});
