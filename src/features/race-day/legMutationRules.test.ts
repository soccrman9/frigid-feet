import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventAccessError } from '../../types/domain';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function createMutationFixture() {
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

  const course1 = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const course2 = await organizerApi.upsertCourse(eventId, {
    name: 'Pine Ridge 5K',
    description: null,
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });

  const participantApi = new InMemoryEventApi(store);
  await participantApi.ensureSession();
  await participantApi.unlockEvent('2027', 'FROST-2027');

  const dashboardApi = new InMemoryEventApi(store);
  await dashboardApi.ensureSession();
  await dashboardApi.unlockDashboard('dash-token-2027');

  const ungrantedApi = new InMemoryEventApi(store);
  await ungrantedApi.ensureSession();

  const team = await participantApi.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const runner = await participantApi.createParticipant(eventId, {
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

  const snap = await participantApi.getEventSnapshot(eventId);
  const leg = snap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
  await participantApi.updateLeg(eventId, leg.id, { runnerId: runner.id });

  return {
    store,
    eventId,
    course1,
    course2,
    legId: leg.id,
    organizerApi,
    participantApi,
    dashboardApi,
    ungrantedApi,
  };
}

describe('apply_leg_mutation conflict resolution, idempotency, and scope enforcement', () => {
  it('enforces participant or organizer session grant scope and rejects dashboard or ungranted callers', async () => {
    const { eventId, legId, course1, dashboardApi, ungrantedApi } = await createMutationFixture();

    const basePayload = {
      eventId,
      legId,
      mutationId: '11111111-1111-4111-8111-111111111111',
      status: 'out_on_course' as const,
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:00:00.000Z',
    };

    await expect(dashboardApi.applyLegMutation(basePayload)).rejects.toThrow(EventAccessError);
    await expect(dashboardApi.applyLegMutation(basePayload)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(ungrantedApi.applyLegMutation(basePayload)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('Rule 1 (Idempotency): returns { applied: true, reason: "duplicate", leg } on replayed mutation_id', async () => {
    const { eventId, legId, course1, participantApi } = await createMutationFixture();

    const first = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '22222222-2222-4222-8222-222222222222',
      status: 'out_on_course',
      startedAt: '2027-01-09T13:01:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:01:00.000Z',
    });
    expect(first.applied).toBe(true);
    expect(first.reason).toBe('applied');
    expect(first.leg.status).toBe('out_on_course');

    // Replay same mutationId even with altered fields -> returns duplicate without mutating
    const replay = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '22222222-2222-4222-8222-222222222222',
      status: 'completed',
      startedAt: '2027-01-09T13:01:00.000Z',
      finishedAt: '2027-01-09T13:30:00.000Z',
      durationSeconds: 1740,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:30:00.000Z',
    });
    expect(replay.applied).toBe(true);
    expect(replay.reason).toBe('duplicate');
    expect(replay.leg.status).toBe('out_on_course');
    expect(replay.leg.finishedAt).toBeNull();
  });

  it('Rule 2 (Organizer precedence): Organizer wins over Participant including timestamp ties, while strictly newer Participant writes succeed', async () => {
    const { eventId, legId, course1, course2, participantApi, organizerApi } =
      await createMutationFixture();

    // Participant starts at 13:05
    await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '33333333-3333-4333-8333-333333333301',
      status: 'out_on_course',
      startedAt: '2027-01-09T13:05:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:05:00.000Z',
    });

    // Organizer overrides at exact timestamp tie (13:05) -> Organizer wins
    const orgOverride = await organizerApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '33333333-3333-4333-8333-333333333302',
      status: 'out_on_course',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: course2.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:05:00.000Z',
    });
    expect(orgOverride.applied).toBe(true);
    expect(orgOverride.reason).toBe('applied');
    expect(orgOverride.leg.updatedByOrganizer).toBe(true);
    expect(orgOverride.leg.courseId).toBe(course2.id);

    // Non-Organizer tie (13:05) cannot overwrite Organizer update
    const tieReject = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '33333333-3333-4333-8333-333333333303',
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:05:00.000Z',
      durationSeconds: 300,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:05:00.000Z',
    });
    expect(tieReject.applied).toBe(false);
    expect(tieReject.reason).toBe('stale_or_overridden');
    expect(tieReject.leg.status).toBe('out_on_course');
    expect(tieReject.leg.courseId).toBe(course2.id);

    // Non-Organizer older timestamp (13:04) also rejected
    const olderReject = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '33333333-3333-4333-8333-333333333304',
      status: 'scheduled',
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: true,
      clientUpdatedAt: '2027-01-09T13:04:00.000Z',
    });
    expect(olderReject.applied).toBe(false);
    expect(olderReject.reason).toBe('stale_or_overridden');

    // Strictly newer Non-Organizer write (13:29) succeeds after Organizer update
    const newerFinish = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '33333333-3333-4333-8333-333333333305',
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:29:00.000Z',
      durationSeconds: 1740,
      courseId: course2.id,
      externalActivityUrl: 'https://www.strava.com/activities/12345',
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:29:00.000Z',
    });
    expect(newerFinish.applied).toBe(true);
    expect(newerFinish.reason).toBe('applied');
    expect(newerFinish.leg.status).toBe('completed');
    expect(newerFinish.leg.updatedByOrganizer).toBe(false);
  });

  it('Rule 3 (Participant vs Participant): uses newest client_updated_at and blocks out_on_course regressing completed unless is_explicit_revert = true', async () => {
    const { eventId, legId, course1, participantApi } = await createMutationFixture();

    // Finish at 13:30
    const finished = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '44444444-4444-4444-8444-444444444401',
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:30:00.000Z',
      durationSeconds: 1800,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:30:00.000Z',
    });
    expect(finished.applied).toBe(true);

    // Older clientUpdatedAt (13:20) is rejected
    const staleOlder = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '44444444-4444-4444-8444-444444444402',
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:20:00.000Z',
      durationSeconds: 1200,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:20:00.000Z',
    });
    expect(staleOlder.applied).toBe(false);
    expect(staleOlder.reason).toBe('stale_or_overridden');
    expect(staleOlder.leg.durationSeconds).toBe(1800);

    // Delayed offline out_on_course with NEWER timestamp (13:31) is STILL blocked by no-regress guard
    const regressBlocked = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '44444444-4444-4444-8444-444444444403',
      status: 'out_on_course',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:31:00.000Z',
    });
    expect(regressBlocked.applied).toBe(false);
    expect(regressBlocked.reason).toBe('stale_or_overridden');
    expect(regressBlocked.leg.status).toBe('completed');

    // Explicit revert (Undo) with isExplicitRevert = true succeeds
    const explicitRevert = await participantApi.applyLegMutation({
      eventId,
      legId,
      mutationId: '44444444-4444-4444-8444-444444444404',
      status: 'out_on_course',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: course1.id,
      externalActivityUrl: null,
      isExplicitRevert: true,
      clientUpdatedAt: '2027-01-09T13:31:05.000Z',
    });
    expect(explicitRevert.applied).toBe(true);
    expect(explicitRevert.reason).toBe('applied');
    expect(explicitRevert.leg.status).toBe('out_on_course');
    expect(explicitRevert.leg.finishedAt).toBeNull();
    expect(explicitRevert.leg.durationSeconds).toBeNull();
  });

  it('rejects non-positive durationSeconds and unsafe externalActivityUrl values', async () => {
    const { eventId, legId, course1, participantApi } = await createMutationFixture();

    await expect(
      participantApi.applyLegMutation({
        eventId,
        legId,
        mutationId: '55555555-5555-4555-8555-555555555501',
        status: 'completed',
        startedAt: '2027-01-09T13:00:00.000Z',
        finishedAt: '2027-01-09T13:00:00.000Z',
        durationSeconds: 0,
        courseId: course1.id,
        externalActivityUrl: null,
        isExplicitRevert: false,
        clientUpdatedAt: '2027-01-09T13:01:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      participantApi.applyLegMutation({
        eventId,
        legId,
        mutationId: '55555555-5555-4555-8555-555555555502',
        status: 'completed',
        startedAt: '2027-01-09T13:00:00.000Z',
        finishedAt: '2027-01-09T13:25:00.000Z',
        durationSeconds: 1500,
        courseId: course1.id,
        externalActivityUrl: 'javascript:alert(1)',
        isExplicitRevert: false,
        clientUpdatedAt: '2027-01-09T13:25:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('Postgres apply_leg_mutation RPC implements all three conflict rules and session_grants enforcement', () => {
    const sql = readFileSync(
      resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'),
      'utf8',
    );
    const rpcSection = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_leg_mutation('),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.ping_heartbeat('),
    );

    expect(rpcSection).toContain("public.has_grant(p_event_id, ARRAY['participant', 'organizer'])");
    expect(rpcSection).toContain("v_current.last_mutation_id = p_mutation_id");
    expect(rpcSection).toContain("'reason', 'duplicate'");
    expect(rpcSection).toContain(
      'NOT v_is_organizer AND v_current.updated_by_organizer AND p_client_updated_at <= v_current.client_updated_at',
    );
    expect(rpcSection).toContain('p_client_updated_at < v_current.client_updated_at');
    expect(rpcSection).toContain(
      "v_current.status = 'completed' AND p_status = 'out_on_course' AND NOT COALESCE(p_is_explicit_revert, false)",
    );
    expect(rpcSection).toContain("'reason', 'stale_or_overridden'");
  });
});
