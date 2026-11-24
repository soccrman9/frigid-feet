import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { SupabaseEventApi } from '../../lib/supabaseEventApi';
import { EventAccessError } from '../../types/domain';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function createStartRoundFixture() {
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
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

  const course = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const participantApi = new InMemoryEventApi(store);
  await participantApi.ensureSession();
  await participantApi.unlockEvent('2027', 'FROST-2027');

  const dashboardApi = new InMemoryEventApi(store);
  await dashboardApi.ensureSession();
  await dashboardApi.unlockDashboard('dash-token-2027');

  const ungrantedApi = new InMemoryEventApi(store);
  await ungrantedApi.ensureSession();

  // Create 4 Teams to cover every Leg state in Round 2:
  // - Team A: assigned 'scheduled' (will be mass-started)
  // - Team B: assigned 'scheduled' (will be excluded as late starter)
  // - Team C: assigned 'out_on_course' (already started early -> untouched)
  // - Team D: assigned 'completed' (already completed -> untouched)
  // - Team E: unassigned placeholder (runnerId = null -> untouched)
  const teamA = await participantApi.createTeam(eventId, {
    name: 'Cold Brew Crew',
    tagline: null,
    colorHex: '#C86D09',
    emoji: '☕',
    isOpen: true,
    lookingNote: null,
  });
  const teamB = await participantApi.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });
  const teamC = await participantApi.createTeam(eventId, {
    name: 'Glacier Gliders',
    tagline: null,
    colorHex: '#157A4B',
    emoji: '🧊',
    isOpen: true,
    lookingNote: null,
  });
  const teamD = await participantApi.createTeam(eventId, {
    name: 'Polar Pacers',
    tagline: null,
    colorHex: '#0C1E30',
    emoji: '🧭',
    isOpen: true,
    lookingNote: null,
  });
  const teamE = await participantApi.createTeam(eventId, {
    name: 'Snow Patrol',
    tagline: null,
    colorHex: '#3B556E',
    emoji: '🎿',
    isOpen: true,
    lookingNote: null,
  });

  const createRunner = (displayName: string, teamId: string) =>
    participantApi.createParticipant(eventId, {
      displayName,
      rsvpStatus: 'going_runner',
      teamId,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 30,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

  const runnerA = await createRunner('Maya Chen', teamA.id);
  const runnerB = await createRunner('Samir Patel', teamB.id);
  const runnerC = await createRunner('Jordan Lee', teamC.id);
  const runnerD = await createRunner('Alex Rivera', teamD.id);

  const initialSnap = await participantApi.getEventSnapshot(eventId);
  const legFor = (teamId: string, roundNumber: number) =>
    initialSnap.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  // Round 2 setup
  const r2LegA = await participantApi.updateLeg(eventId, legFor(teamA.id, 2).id, {
    runnerId: runnerA.id,
    courseId: course.id,
  });
  const r2LegB = await participantApi.updateLeg(eventId, legFor(teamB.id, 2).id, {
    runnerId: runnerB.id,
    courseId: course.id,
  });
  const earlyStartIso = '2027-01-09T13:55:00.000Z';
  const r2LegC = await participantApi.updateLeg(eventId, legFor(teamC.id, 2).id, {
    runnerId: runnerC.id,
    courseId: course.id,
    status: 'out_on_course',
    startedAt: earlyStartIso,
    clientUpdatedAt: earlyStartIso,
  });
  const completedStartIso = '2027-01-09T13:30:00.000Z';
  const completedEndIso = '2027-01-09T13:56:00.000Z';
  const r2LegD = await participantApi.updateLeg(eventId, legFor(teamD.id, 2).id, {
    runnerId: runnerD.id,
    courseId: course.id,
    status: 'completed',
    startedAt: completedStartIso,
    finishedAt: completedEndIso,
    durationSeconds: 1560,
    clientUpdatedAt: completedEndIso,
  });
  const r2LegE = legFor(teamE.id, 2); // Unassigned placeholder (runnerId = null)

  // Round 3 scheduled Leg (must stay untouched when Round 2 starts)
  const r3LegA = await participantApi.updateLeg(eventId, legFor(teamA.id, 3).id, {
    runnerId: runnerA.id,
    courseId: course.id,
  });

  return {
    store,
    eventId,
    course,
    organizerApi,
    participantApi,
    dashboardApi,
    ungrantedApi,
    r2LegA,
    r2LegB,
    r2LegC,
    r2LegD,
    r2LegE,
    r3LegA,
    earlyStartIso,
    completedStartIso,
    completedEndIso,
  };
}

describe('start_round RPC atomicity, exclusions, LWW synchronization & security', () => {
  it('atomically sets rounds.started_at and transitions non-excluded assigned scheduled Legs while leaving excluded, unassigned, already started, completed, and other-Round Legs untouched', async () => {
    const {
      eventId,
      organizerApi,
      r2LegA,
      r2LegB,
      r2LegC,
      r2LegD,
      r2LegE,
      r3LegA,
      earlyStartIso,
      completedStartIso,
      completedEndIso,
    } = await createStartRoundFixture();

    const massStartIso = '2027-01-09T14:00:00.000Z';
    const startedCount = await organizerApi.startRound(eventId, 2, [r2LegB.id], massStartIso);

    expect(startedCount).toBe(1);

    const snap = await organizerApi.getEventSnapshot(eventId);
    const round2 = snap.rounds.find((r) => r.roundNumber === 2)!;
    const round3 = snap.rounds.find((r) => r.roundNumber === 3)!;
    expect(round2.startedAt).toBe(massStartIso);
    expect(round3.startedAt).toBeNull();

    const byId = (id: string) => snap.legs.find((l) => l.id === id)!;

    // Non-excluded assigned scheduled Leg transitioned cleanly
    const updatedA = byId(r2LegA.id);
    expect(updatedA.status).toBe('out_on_course');
    expect(updatedA.startedAt).toBe(massStartIso);
    expect(updatedA.clientUpdatedAt).toBe(massStartIso);
    expect(updatedA.updatedByOrganizer).toBe(true);

    // Excluded late-starter Leg stayed scheduled
    const untouchedB = byId(r2LegB.id);
    expect(untouchedB.status).toBe('scheduled');
    expect(untouchedB.startedAt).toBeNull();
    expect(untouchedB.updatedByOrganizer).toBe(false);

    // Already out_on_course Leg kept its original early start timestamp
    const untouchedC = byId(r2LegC.id);
    expect(untouchedC.status).toBe('out_on_course');
    expect(untouchedC.startedAt).toBe(earlyStartIso);
    expect(untouchedC.updatedByOrganizer).toBe(false);

    // Already completed Leg stayed completed with original timing
    const untouchedD = byId(r2LegD.id);
    expect(untouchedD.status).toBe('completed');
    expect(untouchedD.startedAt).toBe(completedStartIso);
    expect(untouchedD.finishedAt).toBe(completedEndIso);
    expect(untouchedD.durationSeconds).toBe(1560);

    // Unassigned placeholder Leg stayed scheduled with null runnerId
    const untouchedE = byId(r2LegE.id);
    expect(untouchedE.runnerId).toBeNull();
    expect(untouchedE.status).toBe('scheduled');
    expect(untouchedE.startedAt).toBeNull();

    // Other Round's scheduled Leg stayed scheduled
    const untouchedR3 = byId(r3LegA.id);
    expect(untouchedR3.status).toBe('scheduled');
    expect(untouchedR3.startedAt).toBeNull();
  });

  it('synchronizes client_updated_at and updated_by_organizer for LWW compatibility with apply_leg_mutation', async () => {
    const { eventId, course, organizerApi, participantApi, r2LegA } =
      await createStartRoundFixture();

    const massStartIso = '2027-01-09T14:00:00.000Z';
    await organizerApi.startRound(eventId, 2, [], massStartIso);

    // Stale or exact-tie non-Organizer write is rejected by Organizer precedence
    const staleReject = await participantApi.applyLegMutation({
      eventId,
      legId: r2LegA.id,
      mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      status: 'scheduled',
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      courseId: course.id,
      externalActivityUrl: null,
      isExplicitRevert: true,
      clientUpdatedAt: massStartIso, // exact tie with mass-start
    });
    expect(staleReject.applied).toBe(false);
    expect(staleReject.reason).toBe('stale_or_overridden');
    expect(staleReject.leg.status).toBe('out_on_course');
    expect(staleReject.leg.updatedByOrganizer).toBe(true);

    // Strictly newer non-Organizer finish (28 minutes later) succeeds normally
    const finishIso = '2027-01-09T14:28:00.000Z';
    const finishOk = await participantApi.applyLegMutation({
      eventId,
      legId: r2LegA.id,
      mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      status: 'completed',
      startedAt: massStartIso,
      finishedAt: finishIso,
      durationSeconds: 1680,
      courseId: course.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: finishIso,
    });
    expect(finishOk.applied).toBe(true);
    expect(finishOk.reason).toBe('applied');
    expect(finishOk.leg.status).toBe('completed');
    expect(finishOk.leg.durationSeconds).toBe(1680);
    expect(finishOk.leg.updatedByOrganizer).toBe(false);

    // Organizer can still individually revert or override even at an earlier/tie timestamp
    const organizerRevert = await organizerApi.applyLegMutation({
      eventId,
      legId: r2LegA.id,
      mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      status: 'scheduled',
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      courseId: course.id,
      externalActivityUrl: null,
      isExplicitRevert: true,
      clientUpdatedAt: finishIso, // tie timestamp -> Organizer wins
    });
    expect(organizerRevert.applied).toBe(true);
    expect(organizerRevert.leg.status).toBe('scheduled');
    expect(organizerRevert.leg.updatedByOrganizer).toBe(true);
  });

  it('rejects non-Organizer callers (Participant, Dashboard, ungranted) and invalid Round numbers', async () => {
    const { eventId, organizerApi, participantApi, dashboardApi, ungrantedApi } =
      await createStartRoundFixture();

    await expect(
      participantApi.startRound(eventId, 2, [], '2027-01-09T14:00:00.000Z'),
    ).rejects.toThrow(EventAccessError);
    await expect(
      participantApi.startRound(eventId, 2, [], '2027-01-09T14:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      dashboardApi.startRound(eventId, 2, [], '2027-01-09T14:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      ungrantedApi.startRound(eventId, 2, [], '2027-01-09T14:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Invalid Round numbers rejected cleanly
    await expect(
      organizerApi.startRound(eventId, 0, [], '2027-01-09T14:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      organizerApi.startRound(eventId, 11, [], '2027-01-09T14:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('maps SupabaseEventApi.startRound directly to the start_round SECURITY DEFINER RPC with canonical parameter names', async () => {
    const supabaseApi = new SupabaseEventApi('https://example.supabase.co', 'anon-key');
    const rpcSpy = vi.spyOn(supabaseApi.client, 'rpc').mockResolvedValue({
      data: 3,
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
      success: true,
    } as Awaited<ReturnType<typeof supabaseApi.client.rpc>>);

    const count = await supabaseApi.startRound(
      'event-123',
      4,
      ['leg-late-1'],
      '2027-01-09T16:00:00.000Z',
    );

    expect(count).toBe(3);
    expect(rpcSpy).toHaveBeenCalledWith('start_round', {
      p_event_id: 'event-123',
      p_round_number: 4,
      p_exclude_leg_ids: ['leg-late-1'],
      p_started_at: '2027-01-09T16:00:00.000Z',
    });
  });

  it('Postgres start_round RPC enforces Organizer grant, validates Round range, updates rounds & assigned scheduled Legs atomically, and sets LWW columns', () => {
    const sql = readFileSync(
      resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'),
      'utf8',
    );
    const rpcSection = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.start_round('),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_leg_mutation('),
    );

    expect(rpcSection).toContain('SECURITY DEFINER');
    expect(rpcSection).toContain("public.has_grant(p_event_id, ARRAY['organizer'])");
    expect(rpcSection).toContain('p_round_number < 1 OR p_round_number > 10');
    expect(rpcSection).toContain('COALESCE(p_started_at, now())');
    expect(rpcSection).toContain('UPDATE public.rounds');
    expect(rpcSection).toContain('UPDATE public.legs');
    expect(rpcSection).toContain("status = 'out_on_course'");
    expect(rpcSection).toContain('client_updated_at = v_started_at');
    expect(rpcSection).toContain('updated_by_organizer = true');
    expect(rpcSection).toContain("status = 'scheduled'");
    expect(rpcSection).toContain('runner_id IS NOT NULL');
    expect(rpcSection).toContain('NOT (id = ANY(COALESCE(p_exclude_leg_ids, ARRAY[]::uuid[])))');
    expect(rpcSection).toContain(
      'GRANT EXECUTE ON FUNCTION public.start_round(uuid, int, uuid[], timestamptz) TO authenticated;',
    );
  });
});
