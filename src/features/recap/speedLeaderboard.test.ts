import { describe, expect, it } from 'vitest';
import type { Course, Leg, Participant, Team } from '../../types/domain';
import { computeSpeedLeaderboard } from './speedLeaderboard';

function makeTeam(overrides: Partial<Team> & { id: string; name: string }): Team {
  return {
    eventId: 'evt-1',
    tagline: null,
    colorHex: '#163A59',
    emoji: null,
    isOpen: true,
    lookingNote: null,
    createdAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCourse(overrides: Partial<Course> & { id: string; name: string }): Course {
  return {
    eventId: 'evt-1',
    description: null,
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
    ...overrides,
  };
}

function makeParticipant(
  overrides: Partial<Participant> & { id: string; displayName: string },
): Participant {
  return {
    eventId: 'evt-1',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
    createdAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLeg(
  overrides: Partial<Leg> & { id: string; teamId: string; roundNumber: number },
): Leg {
  return {
    eventId: 'evt-1',
    runnerId: null,
    courseId: null,
    status: 'scheduled',
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    externalActivityUrl: null,
    clientUpdatedAt: '2027-01-09T13:00:00.000Z',
    lastMutationId: null,
    updatedByOrganizer: false,
    ...overrides,
  };
}

describe('computeSpeedLeaderboard', () => {
  it('excludes opted-out Runners, non-completed Legs, and timed-blank Legs so private times are never exposed', () => {
    const teamA = makeTeam({ id: 't-a', name: 'Frostbite Fighters', emoji: '❄️' });
    const course = makeCourse({ id: 'c-1', name: 'Boardwalk 5K', isPrimary: true });

    const optedOutFast = makeParticipant({
      id: 'p-private',
      displayName: 'Jordan Lee',
      teamId: teamA.id,
      showTimesOnLeaderboard: false,
    });
    const optedInUntimed = makeParticipant({
      id: 'p-untimed',
      displayName: 'Maya Chen',
      teamId: teamA.id,
      showTimesOnLeaderboard: true,
    });
    const optedInTimed = makeParticipant({
      id: 'p-public',
      displayName: 'Samir Patel',
      teamId: teamA.id,
      showTimesOnLeaderboard: true,
    });
    const supporter = makeParticipant({
      id: 'p-supporter',
      displayName: 'Riley Brooks',
      rsvpStatus: 'going_supporter',
      showTimesOnLeaderboard: true,
    });

    const legs: Leg[] = [
      // Opted-out Runner ran 19:30 -> MUST NOT appear
      makeLeg({
        id: 'l-1',
        teamId: teamA.id,
        roundNumber: 1,
        runnerId: optedOutFast.id,
        courseId: course.id,
        status: 'completed',
        durationSeconds: 1170,
      }),
      // Opted-in Runner with blank durationSeconds -> MUST NOT appear
      makeLeg({
        id: 'l-2',
        teamId: teamA.id,
        roundNumber: 2,
        runnerId: optedInUntimed.id,
        courseId: course.id,
        status: 'completed',
        durationSeconds: null,
      }),
      // Opted-in Runner who is still out_on_course -> MUST NOT appear
      makeLeg({
        id: 'l-3',
        teamId: teamA.id,
        roundNumber: 3,
        runnerId: optedInUntimed.id,
        courseId: course.id,
        status: 'out_on_course',
        durationSeconds: 1200,
      }),
      // Opted-in Runner with valid completed timed Leg (25:10 = 1510s) -> MUST appear
      makeLeg({
        id: 'l-4',
        teamId: teamA.id,
        roundNumber: 4,
        runnerId: optedInTimed.id,
        courseId: course.id,
        status: 'completed',
        durationSeconds: 1510,
      }),
    ];

    const entries = computeSpeedLeaderboard({
      participants: [optedOutFast, optedInUntimed, optedInTimed, supporter],
      legs,
      teams: [teamA],
      courses: [course],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      rank: 1,
      participantId: 'p-public',
      displayName: 'Samir Patel',
      teamId: 't-a',
      teamName: 'Frostbite Fighters',
      teamEmoji: '❄️',
      fastestLegSeconds: 1510,
      fastestLegRoundNumber: 4,
      fastestLegCourseName: 'Boardwalk 5K',
      averageSeconds: 1510,
      timedLegsCount: 1,
      totalCompletedLegsCount: 1,
    });
  });

  it('computes fastest single 5K Leg and average 5K time across timed completed Legs only, sorting by fastest or average with deterministic tie-breaks', () => {
    const teamA = makeTeam({ id: 't-a', name: 'Cold Brew Crew', emoji: '☕' });
    const teamB = makeTeam({ id: 't-b', name: 'Snow Patrol', emoji: '🎿' });
    const boardwalk = makeCourse({ id: 'c-1', name: 'Boardwalk 5K', isPrimary: true });
    const lakeLoop = makeCourse({ id: 'c-2', name: 'Lake Loop 5K' });

    // Alex: 22:00 (1320s) on R1 + 30:00 (1800s) on R3 + 1 untimed blank Leg on R5
    // -> fastest = 1320 (R1), average of timed = (1320+1800)/2 = 1560 (26:00), timedLegsCount = 2, totalCompleted = 3
    const alex = makeParticipant({
      id: 'p-alex',
      displayName: 'Alex Rivera',
      teamId: teamA.id,
      showTimesOnLeaderboard: true,
    });

    // Priya: 23:00 (1380s) on R2 + 23:20 (1400s) on R4
    // -> fastest = 1380 (R2), average = 1390 (23:10), timedLegsCount = 2
    const priya = makeParticipant({
      id: 'p-priya',
      displayName: 'Priya Nair',
      teamId: teamB.id,
      showTimesOnLeaderboard: true,
    });

    // Devon: tied with Priya for fastest at 23:00 (1380s), average = 1440 (24:00)
    const devon = makeParticipant({
      id: 'p-devon',
      displayName: 'Devon Brooks',
      teamId: teamB.id,
      showTimesOnLeaderboard: true,
    });

    const legs: Leg[] = [
      makeLeg({
        id: 'l-a1',
        teamId: teamA.id,
        roundNumber: 1,
        runnerId: alex.id,
        courseId: boardwalk.id,
        status: 'completed',
        durationSeconds: 1320,
      }),
      makeLeg({
        id: 'l-a3',
        teamId: teamA.id,
        roundNumber: 3,
        runnerId: alex.id,
        courseId: lakeLoop.id,
        status: 'completed',
        durationSeconds: 1800,
      }),
      makeLeg({
        id: 'l-a5',
        teamId: teamA.id,
        roundNumber: 5,
        runnerId: alex.id,
        courseId: boardwalk.id,
        status: 'completed',
        durationSeconds: null,
      }),
      makeLeg({
        id: 'l-p2',
        teamId: teamB.id,
        roundNumber: 2,
        runnerId: priya.id,
        courseId: lakeLoop.id,
        status: 'completed',
        durationSeconds: 1380,
      }),
      makeLeg({
        id: 'l-p4',
        teamId: teamB.id,
        roundNumber: 4,
        runnerId: priya.id,
        courseId: boardwalk.id,
        status: 'completed',
        durationSeconds: 1400,
      }),
      makeLeg({
        id: 'l-d1',
        teamId: teamB.id,
        roundNumber: 1,
        runnerId: devon.id,
        courseId: boardwalk.id,
        status: 'completed',
        durationSeconds: 1380,
      }),
      makeLeg({
        id: 'l-d6',
        teamId: teamB.id,
        roundNumber: 6,
        runnerId: devon.id,
        courseId: boardwalk.id,
        status: 'completed',
        durationSeconds: 1500,
      }),
    ];

    const byFastest = computeSpeedLeaderboard({
      participants: [devon, alex, priya],
      legs,
      teams: [teamA, teamB],
      courses: [boardwalk, lakeLoop],
      sortBy: 'fastest',
    });

    expect(byFastest.map((e) => [e.rank, e.displayName, e.fastestLegSeconds, e.averageSeconds])).toEqual([
      [1, 'Alex Rivera', 1320, 1560],
      [2, 'Priya Nair', 1380, 1390],
      [2, 'Devon Brooks', 1380, 1440],
    ]);
    expect(byFastest[0]?.timedLegsCount).toBe(2);
    expect(byFastest[0]?.totalCompletedLegsCount).toBe(3);
    expect(byFastest[0]?.fastestLegRoundNumber).toBe(1);
    expect(byFastest[0]?.fastestLegCourseName).toBe('Boardwalk 5K');

    const byAverage = computeSpeedLeaderboard({
      participants: [devon, alex, priya],
      legs,
      teams: [teamA, teamB],
      courses: [boardwalk, lakeLoop],
      sortBy: 'average',
    });

    expect(byAverage.map((e) => [e.rank, e.displayName, e.averageSeconds])).toEqual([
      [1, 'Priya Nair', 1390],
      [2, 'Devon Brooks', 1440],
      [3, 'Alex Rivera', 1560],
    ]);
  });
});
