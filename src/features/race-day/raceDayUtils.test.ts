import { describe, expect, it } from 'vitest';
import type { Course, Leg, Participant, Round } from '../../types/domain';
import {
  buildMilestoneToastMessage,
  canActOnLeg,
  canViewLegDuration,
  computeLegEta,
  formatCountdown,
  formatElapsedSeconds,
  getActiveRoundNumber,
  getPrimaryCourse,
  getRoundPillState,
  getThumbDockState,
  parseDurationInput,
} from './raceDayUtils';

const BASE_START_MS = Date.parse('2027-01-09T13:00:00.000Z'); // 8:00 AM EST

function makeRounds(): Round[] {
  return Array.from({ length: 10 }, (_, idx) => ({
    id: `round-${idx + 1}`,
    eventId: 'evt-1',
    roundNumber: idx + 1,
    scheduledStartAt: new Date(BASE_START_MS + idx * 3_600_000).toISOString(),
    startedAt: null,
  }));
}

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course-1',
    eventId: 'evt-1',
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p-1',
    eventId: 'evt-1',
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: 'team-1',
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
    createdAt: '2026-12-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    id: 'leg-1',
    eventId: 'evt-1',
    teamId: 'team-1',
    roundNumber: 1,
    runnerId: 'p-1',
    courseId: 'course-1',
    status: 'scheduled',
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    externalActivityUrl: null,
    clientUpdatedAt: '2026-12-01T00:00:00.000Z',
    lastMutationId: null,
    updatedByOrganizer: false,
    ...overrides,
  };
}

describe('raceDayUtils — active Round, timers, ETA, privacy, role permissions, Thumb Dock & milestones', () => {
  it('determines the active Round across pre-race, mid-race, early-start, and post-race states', () => {
    const rounds = makeRounds();
    const preRaceNow = BASE_START_MS - 30 * 60_000;
    expect(getActiveRoundNumber(rounds, [], preRaceNow)).toBe(1);

    // Mid-race: 11:24 AM EST -> Round 4 (3h 24m after 8:00 AM start)
    const round4Now = BASE_START_MS + 3 * 3_600_000 + 24 * 60_000;
    expect(getActiveRoundNumber(rounds, [], round4Now)).toBe(4);

    // Early start in Round 5 before 12:00 PM -> active Round advances to 5
    const earlyR5Leg = makeLeg({
      roundNumber: 5,
      status: 'out_on_course',
      startedAt: new Date(round4Now).toISOString(),
    });
    expect(getActiveRoundNumber(rounds, [earlyR5Leg], round4Now)).toBe(5);

    // Post-race (after Round 10) -> clamps to 10
    const postRaceNow = BASE_START_MS + 14 * 3_600_000;
    expect(getActiveRoundNumber(rounds, [], postRaceNow)).toBe(10);
  });

  it('classifies 10-Round pill states (active, completed, upcoming)', () => {
    const rounds = makeRounds();
    const legs = [
      makeLeg({ id: 'l1', roundNumber: 1, status: 'completed' }),
      makeLeg({ id: 'l2a', roundNumber: 2, status: 'completed' }),
      makeLeg({ id: 'l2b', roundNumber: 2, teamId: 'team-2', runnerId: 'p-2', status: 'out_on_course' }),
      makeLeg({ id: 'l4', roundNumber: 4, status: 'out_on_course' }),
      makeLeg({ id: 'l5', roundNumber: 5, status: 'scheduled' }),
    ];

    expect(getRoundPillState(1, 4, rounds, legs)).toBe('completed');
    expect(getRoundPillState(2, 4, rounds, legs)).toBe('upcoming'); // still has Runner out on course
    expect(getRoundPillState(4, 4, rounds, legs)).toBe('active');
    expect(getRoundPillState(5, 4, rounds, legs)).toBe('upcoming');
  });

  it('formats elapsed timers, countdowns, and parses optional watch duration input', () => {
    expect(formatElapsedSeconds(0)).toBe('00:00');
    expect(formatElapsedSeconds(1458)).toBe('24:18');
    expect(formatElapsedSeconds(3912)).toBe('1:05:12');
    expect(formatElapsedSeconds(-5)).toBe('00:00');

    expect(formatCountdown(0)).toBe('READY NOW');
    expect(formatCountdown(1122)).toBe('IN 18:42');
    expect(formatCountdown(5400)).toBe('IN 1h 30m');

    expect(parseDurationInput('')).toEqual({ valid: true, seconds: null });
    expect(parseDurationInput('   ')).toEqual({ valid: true, seconds: null });
    expect(parseDurationInput('27:30')).toEqual({ valid: true, seconds: 1650 });
    expect(parseDurationInput('1:04:15')).toEqual({ valid: true, seconds: 3855 });
    expect(parseDurationInput('28')).toEqual({ valid: true, seconds: 1680 });
    expect(parseDurationInput('0:00')).toEqual({ valid: false, seconds: null });
    expect(parseDurationInput('25:75')).toEqual({ valid: false, seconds: null });
    expect(parseDurationInput('abc')).toEqual({ valid: false, seconds: null });
  });

  it('computes proportional ETA progress and detects >60-minute runs without clamping elapsed seconds', () => {
    const startedMs = BASE_START_MS;
    const runner = makeParticipant({ rough5kMinutes: 30 });
    const leg = makeLeg({
      status: 'out_on_course',
      startedAt: new Date(startedMs).toISOString(),
    });

    const at15m = computeLegEta(leg, runner, startedMs + 15 * 60_000);
    expect(at15m).toEqual({
      elapsedSeconds: 900,
      etaMs: startedMs + 30 * 60_000,
      progressPercent: 50,
      isOver60Min: false,
    });

    const at65m = computeLegEta(leg, runner, startedMs + 65 * 60_000);
    expect(at65m).toEqual({
      elapsedSeconds: 3900,
      etaMs: startedMs + 30 * 60_000,
      progressPercent: 100,
      isOver60Min: true,
    });

    // Runner without rough5kMinutes still gets calm elapsed & progress without fabricated clock ETA
    const noPaceRunner = makeParticipant({ rough5kMinutes: null });
    const at20mNoPace = computeLegEta(leg, noPaceRunner, startedMs + 20 * 60_000);
    expect(at20mNoPace?.etaMs).toBeNull();
    expect(at20mNoPace?.elapsedSeconds).toBe(1200);
    expect(at20mNoPace?.isOver60Min).toBe(false);
  });

  it('enforces individual duration_seconds privacy unless opted in or viewing own Leg', () => {
    const privateRunner = makeParticipant({ id: 'p-1', showTimesOnLeaderboard: false });
    const publicRunner = makeParticipant({ id: 'p-2', showTimesOnLeaderboard: true });
    const privateLeg = makeLeg({ runnerId: 'p-1', status: 'completed', durationSeconds: 1620 });
    const publicLeg = makeLeg({ runnerId: 'p-2', status: 'completed', durationSeconds: 1500 });
    const blankTimeLeg = makeLeg({ runnerId: 'p-2', status: 'completed', durationSeconds: null });

    // Private Runner sees their own Leg duration
    expect(canViewLegDuration(privateLeg, privateRunner, 'p-1')).toBe(true);
    // Another Participant CANNOT see private Runner's duration
    expect(canViewLegDuration(privateLeg, privateRunner, 'p-2')).toBe(false);
    expect(canViewLegDuration(privateLeg, privateRunner, null)).toBe(false);
    // Opted-in Runner's duration is visible to other Participants
    expect(canViewLegDuration(publicLeg, publicRunner, 'p-1')).toBe(true);
    // Blank duration returns false
    expect(canViewLegDuration(blankTimeLeg, publicRunner, 'p-2')).toBe(false);
  });

  it('scopes Leg actions strictly to Runner, teammates, and Organizers (never Supporters or other Teams)', () => {
    const leg = makeLeg({ teamId: 'team-1', runnerId: 'p-1' });
    const self = makeParticipant({ id: 'p-1', teamId: 'team-1', rsvpStatus: 'going_runner' });
    const teammate = makeParticipant({ id: 'p-2', teamId: 'team-1', rsvpStatus: 'going_runner' });
    const otherTeam = makeParticipant({ id: 'p-3', teamId: 'team-2', rsvpStatus: 'going_runner' });
    const supporter = makeParticipant({ id: 'p-4', teamId: null, rsvpStatus: 'going_supporter' });

    expect(canActOnLeg(leg, self, false)).toBe(true);
    expect(canActOnLeg(leg, teammate, false)).toBe(true);
    expect(canActOnLeg(leg, otherTeam, false)).toBe(false);
    expect(canActOnLeg(leg, supporter, false)).toBe(false);
    expect(canActOnLeg(leg, supporter, true)).toBe(true); // Organizer override
    expect(canActOnLeg(leg, otherTeam, true)).toBe(true);
  });

  it('selects Thumb Action Dock states across upcoming, out_on_course, all_done, and hidden for Supporters', () => {
    const rounds = makeRounds();
    const courses = [makeCourse()];
    const runner = makeParticipant({ id: 'p-1', rsvpStatus: 'going_runner' });
    const supporter = makeParticipant({ id: 'p-sup', rsvpStatus: 'going_supporter', teamId: null });

    // Supporter -> always hidden
    expect(
      getThumbDockState({
        activeParticipant: supporter,
        legs: [makeLeg({ runnerId: 'p-1' })],
        rounds,
        courses,
        nowMs: BASE_START_MS - 10 * 60_000,
      }),
    ).toEqual({ kind: 'hidden' });

    // Upcoming next Leg -> countdown + Start Early
    const leg1Scheduled = makeLeg({ id: 'l1', roundNumber: 1, runnerId: 'p-1', status: 'scheduled' });
    const upcoming = getThumbDockState({
      activeParticipant: runner,
      legs: [leg1Scheduled],
      rounds,
      courses,
      nowMs: BASE_START_MS - 15 * 60_000,
    });
    expect(upcoming).toMatchObject({
      kind: 'upcoming',
      leg: leg1Scheduled,
      countdownSeconds: 900,
    });

    // Out on course takes priority over later scheduled Legs
    const leg1Out = makeLeg({
      id: 'l1',
      roundNumber: 1,
      runnerId: 'p-1',
      status: 'out_on_course',
      startedAt: new Date(BASE_START_MS).toISOString(),
    });
    const leg4Scheduled = makeLeg({ id: 'l4', roundNumber: 4, runnerId: 'p-1', status: 'scheduled' });
    const outState = getThumbDockState({
      activeParticipant: runner,
      legs: [leg1Out, leg4Scheduled],
      rounds,
      courses,
      nowMs: BASE_START_MS + 12 * 60_000,
    });
    expect(outState).toMatchObject({
      kind: 'out_on_course',
      leg: leg1Out,
      elapsedSeconds: 720,
    });

    // All assigned Legs completed -> all_done
    const leg1Done = makeLeg({ id: 'l1', roundNumber: 1, runnerId: 'p-1', status: 'completed' });
    const leg4Done = makeLeg({ id: 'l4', roundNumber: 4, runnerId: 'p-1', status: 'completed' });
    const doneState = getThumbDockState({
      activeParticipant: runner,
      legs: [leg1Done, leg4Done],
      rounds,
      courses,
      nowMs: BASE_START_MS + 4 * 3_600_000,
    });
    expect(doneState).toEqual({
      kind: 'all_done',
      completedCount: 2,
      totalKm: 10,
    });
  });

  it('builds encouraging collective distance milestone messages on Leg completion and selects primary Course', () => {
    expect(buildMilestoneToastMessage(18, 19, 'Maya Chen', 'Arctic Pace', 4)).toContain('95 km');
    expect(buildMilestoneToastMessage(19, 20, 'Maya Chen', 'Arctic Pace', 5)).toContain('100 km');
    expect(buildMilestoneToastMessage(20, 21, 'Maya Chen', 'Arctic Pace', 10)).toContain(
      'Arctic Pace reached 50K',
    );
    expect(buildMilestoneToastMessage(5, 5, 'Maya Chen', 'Arctic Pace', 5)).toBeNull();

    const secondary = makeCourse({ id: 'c2', name: 'Lake Loop', isPrimary: false, sortOrder: 0 });
    const primary = makeCourse({ id: 'c1', name: 'Boardwalk 5K', isPrimary: true, sortOrder: 1 });
    expect(getPrimaryCourse([secondary, primary])?.id).toBe('c1');
  });
});
