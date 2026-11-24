import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function createTeamApiFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

  const participantApi = new InMemoryEventApi(store);
  await participantApi.ensureSession();
  await participantApi.unlockEvent('2027', 'FROST-2027');

  return { store, eventId, organizerApi, participantApi };
}

describe('Team 10-Leg auto-seeding and leave_team atomic invariants', () => {
  it('pre-seeds 10 scheduled placeholder Legs defaulted to the Event primary Course (even when primary is not first by sortOrder)', async () => {
    const { eventId, organizerApi, participantApi } = await createTeamApiFixture();

    await organizerApi.upsertCourse(eventId, {
      name: 'Hilltop Loop',
      description: 'Hilly alternate',
      distanceKm: 5,
      isPrimary: false,
      gpxXml: null,
      externalRouteUrl: null,
      sortOrder: 0,
    });
    const primaryCourse = await organizerApi.upsertCourse(eventId, {
      name: 'Boardwalk 5K',
      description: 'Flat waterfront primary',
      distanceKm: 5,
      isPrimary: true,
      gpxXml: null,
      externalRouteUrl: null,
      sortOrder: 2,
    });

    const team = await participantApi.createTeam(eventId, {
      name: 'Glacier Gliders',
      tagline: 'Steady pace',
      colorHex: '#157A4B',
      emoji: '🧊',
      isOpen: true,
      lookingNote: 'Looking for afternoon Runners',
    });

    const snap = await participantApi.getEventSnapshot(eventId);
    const legs = snap.legs
      .filter((l) => l.teamId === team.id)
      .sort((a, b) => a.roundNumber - b.roundNumber);

    expect(legs).toHaveLength(10);
    expect(legs.map((l) => l.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const leg of legs) {
      expect(leg.status).toBe('scheduled');
      expect(leg.runnerId).toBeNull();
      expect(leg.courseId).toBe(primaryCourse.id);
    }
  });

  it('pre-seeds 10 placeholder Legs with null courseId when the Event has no Courses yet', async () => {
    const { eventId, participantApi } = await createTeamApiFixture();

    const team = await participantApi.createTeam(eventId, {
      name: 'Early Birds',
      tagline: null,
      colorHex: null,
      emoji: null,
      isOpen: true,
      lookingNote: null,
    });

    const snap = await participantApi.getEventSnapshot(eventId);
    const legs = snap.legs.filter((l) => l.teamId === team.id);
    expect(legs).toHaveLength(10);
    expect(legs.every((l) => l.courseId === null && l.status === 'scheduled' && l.runnerId === null)).toBe(
      true,
    );
  });

  it('leave_team clears teamId, unassigns scheduled Legs, preserves completed and out_on_course Legs, and preserves teammates', async () => {
    const { eventId, participantApi } = await createTeamApiFixture();

    const team = await participantApi.createTeam(eventId, {
      name: 'Snowshoe Express',
      tagline: null,
      colorHex: null,
      emoji: null,
      isOpen: true,
      lookingNote: null,
    });

    const maya = await participantApi.createParticipant(eventId, {
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 28,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    const alex = await participantApi.createParticipant(eventId, {
      displayName: 'Alex Rivera',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 30,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    let snap = await participantApi.getEventSnapshot(eventId);
    const legByRound = (round: number) =>
      snap.legs.find((l) => l.teamId === team.id && l.roundNumber === round)!;

    // Maya: Round 1 completed, Round 2 out_on_course, Round 3 scheduled
    await participantApi.updateLeg(eventId, legByRound(1).id, {
      runnerId: maya.id,
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:28:00.000Z',
      durationSeconds: 1680,
    });
    await participantApi.updateLeg(eventId, legByRound(2).id, {
      runnerId: maya.id,
      status: 'out_on_course',
      startedAt: '2027-01-09T14:00:00.000Z',
    });
    await participantApi.updateLeg(eventId, legByRound(3).id, {
      runnerId: maya.id,
      status: 'scheduled',
    });
    // Alex: Round 4 scheduled
    await participantApi.updateLeg(eventId, legByRound(4).id, {
      runnerId: alex.id,
      status: 'scheduled',
    });

    await participantApi.leaveTeam(maya.id);

    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.participants.find((p) => p.id === maya.id)?.teamId).toBeNull();
    expect(snap.participants.find((p) => p.id === alex.id)?.teamId).toBe(team.id);
    expect(snap.teams.find((t) => t.id === team.id)).toBeDefined();

    // Completed & out_on_course Legs untouched; scheduled Leg unassigned; teammate's Leg untouched
    expect(legByRound(1)).toMatchObject({ runnerId: maya.id, status: 'completed' });
    expect(legByRound(2)).toMatchObject({ runnerId: maya.id, status: 'out_on_course' });
    expect(legByRound(3)).toMatchObject({ runnerId: null, status: 'scheduled' });
    expect(legByRound(4)).toMatchObject({ runnerId: alex.id, status: 'scheduled' });
  });

  it('leave_team keeps the Team when the last Runner leaves if at least 1 Leg is completed, and preserves out_on_course Legs', async () => {
    const { eventId, participantApi } = await createTeamApiFixture();

    const team = await participantApi.createTeam(eventId, {
      name: 'Solo Finishers',
      tagline: null,
      colorHex: null,
      emoji: null,
      isOpen: false,
      lookingNote: null,
    });

    const runner = await participantApi.createParticipant(eventId, {
      displayName: 'Jordan Lee',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    let snap = await participantApi.getEventSnapshot(eventId);
    const r1 = snap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
    const r2 = snap.legs.find((l) => l.teamId === team.id && l.roundNumber === 2)!;
    const r3 = snap.legs.find((l) => l.teamId === team.id && l.roundNumber === 3)!;

    await participantApi.updateLeg(eventId, r1.id, {
      runnerId: runner.id,
      status: 'completed',
      finishedAt: '2027-01-09T13:30:00.000Z',
    });
    await participantApi.updateLeg(eventId, r2.id, {
      runnerId: runner.id,
      status: 'out_on_course',
      startedAt: '2027-01-09T14:00:00.000Z',
    });
    await participantApi.updateLeg(eventId, r3.id, {
      runnerId: runner.id,
      status: 'scheduled',
    });

    await participantApi.leaveTeam(runner.id);

    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.teams.find((t) => t.id === team.id)).toBeDefined();
    expect(snap.participants.find((p) => p.id === runner.id)?.teamId).toBeNull();
    expect(snap.legs.find((l) => l.id === r1.id)).toMatchObject({
      runnerId: runner.id,
      status: 'completed',
    });
    expect(snap.legs.find((l) => l.id === r2.id)).toMatchObject({
      runnerId: runner.id,
      status: 'out_on_course',
    });
    expect(snap.legs.find((l) => l.id === r3.id)).toMatchObject({
      runnerId: null,
      status: 'scheduled',
    });
  });

  it('leave_team deletes the Team and its placeholder Legs only when 0 Participants and 0 completed Legs remain', async () => {
    const { eventId, participantApi } = await createTeamApiFixture();

    const team = await participantApi.createTeam(eventId, {
      name: 'Ephemeral Team',
      tagline: null,
      colorHex: null,
      emoji: null,
      isOpen: true,
      lookingNote: null,
    });

    const runner = await participantApi.createParticipant(eventId, {
      displayName: 'Samir Patel',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: true,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    // Safe no-op when leaving without a Team after first leave
    await participantApi.leaveTeam(runner.id);
    await expect(participantApi.leaveTeam(runner.id)).resolves.toBeUndefined();

    const snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.teams.find((t) => t.id === team.id)).toBeUndefined();
    expect(snap.legs.filter((l) => l.teamId === team.id)).toHaveLength(0);
    expect(snap.participants.find((p) => p.id === runner.id)?.teamId).toBeNull();
  });

  it('foundation SQL defines atomic AFTER INSERT 10-leg seeding trigger and leave_team cleanup semantics', () => {
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'), 'utf8');

    // Trigger pre-seeds 10 scheduled legs defaulted to primary course
    expect(sql).toMatch(/AFTER INSERT ON public\.teams/);
    expect(sql).toMatch(/ORDER BY is_primary DESC/);
    expect(sql).toMatch(/generate_series\(1, 10\)/);
    expect(sql).toMatch(/'scheduled'/);

    // leave_team clears team_id, resets only scheduled legs, and deletes team iff 0 participants & 0 completed legs
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.leave_team\(p_participant_id uuid\)/);
    expect(sql).toMatch(/SET runner_id = NULL[\s\S]*?AND status = 'scheduled'/);
    expect(sql).toMatch(/IF v_remaining_participants = 0 AND v_completed_legs = 0 THEN[\s\S]*?DELETE FROM public\.teams/);
  });
});
