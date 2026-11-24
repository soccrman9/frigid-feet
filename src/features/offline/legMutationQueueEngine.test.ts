import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventAccessError, type ApplyLegMutationInput, type Leg } from '../../types/domain';
import {
  clearOfflineDb,
  getQueuedLegMutations,
  type QueuedLegMutation,
} from './offlineDb';
import {
  createLegMutationQueueEngine,
  STALE_OVERRIDE_TOAST_MESSAGE,
} from './legMutationQueueEngine';

async function setupEngineFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
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
  const team = await organizerApi.createTeam(eventId, {
    name: 'Polar Pacers',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });
  const maya = await organizerApi.createParticipant(eventId, {
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

  const api = new InMemoryEventApi(store);
  await api.unlockEvent('2027', 'FROST-2027');

  const snap = await api.getEventSnapshot(eventId);
  const leg1 = snap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
  const leg2 = snap.legs.find((l) => l.teamId === team.id && l.roundNumber === 2)!;
  await api.updateLeg(eventId, leg1.id, { runnerId: maya.id });
  await api.updateLeg(eventId, leg2.id, { runnerId: maya.id });

  const updatedSnap = await api.getEventSnapshot(eventId);
  return {
    store,
    eventId,
    api,
    organizerApi,
    course,
    leg1: updatedSnap.legs.find((l) => l.id === leg1.id)!,
    leg2: updatedSnap.legs.find((l) => l.id === leg2.id)!,
  };
}

function makeStartInput(
  eventId: string,
  leg: Leg,
  mutationId: string,
  tsIso: string,
): ApplyLegMutationInput {
  return {
    eventId,
    legId: leg.id,
    mutationId,
    status: 'out_on_course',
    startedAt: tsIso,
    finishedAt: null,
    durationSeconds: null,
    courseId: leg.courseId,
    externalActivityUrl: null,
    isExplicitRevert: false,
    clientUpdatedAt: tsIso,
  };
}

function makeFinishInput(
  eventId: string,
  leg: Leg,
  mutationId: string,
  startedAt: string,
  finishedAt: string,
  durationSeconds: number,
): ApplyLegMutationInput {
  return {
    eventId,
    legId: leg.id,
    mutationId,
    status: 'completed',
    startedAt,
    finishedAt,
    durationSeconds,
    courseId: leg.courseId,
    externalActivityUrl: null,
    isExplicitRevert: false,
    clientUpdatedAt: finishedAt,
  };
}

describe('legMutationQueueEngine', () => {
  beforeEach(async () => {
    await clearOfflineDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await clearOfflineDb();
  });

  it('queues offline mutations in IndexedDB and flushes strictly FIFO on online, focus, and visibilitychange', async () => {
    const { eventId, api, leg1 } = await setupEngineFixture();
    let online = false;
    const callOrder: string[] = [];
    const applySpy = vi.spyOn(api, 'applyLegMutation').mockImplementation(async (input) => {
      callOrder.push(input.mutationId);
      return InMemoryEventApi.prototype.applyLegMutation.call(api, input);
    });

    const confirmedLegs: Leg[] = [];
    const queueSnapshots: QueuedLegMutation[][] = [];

    const engine = createLegMutationQueueEngine({
      eventId,
      eventApi: api,
      isOnline: () => online,
      onQueueChanged: (items) => queueSnapshots.push(items),
      onLegConfirmed: (leg) => confirmedLegs.push(leg),
    });
    engine.start();

    const startIso = '2027-01-09T13:00:00.000Z';
    const finishIso = '2027-01-09T13:26:00.000Z';

    const firstOutcome = await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-start-1', startIso),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    expect(firstOutcome.queuedOffline).toBe(true);
    expect(firstOutcome.result.leg.status).toBe('out_on_course');

    const secondOutcome = await engine.enqueue(
      makeFinishInput(eventId, firstOutcome.result.leg, 'mut-finish-1', startIso, finishIso, 1560),
      { actionType: 'finish', previousLegSnapshot: firstOutcome.result.leg },
    );
    expect(secondOutcome.queuedOffline).toBe(true);
    expect(applySpy).not.toHaveBeenCalled();

    expect((await getQueuedLegMutations(eventId)).map((q) => q.mutation_id)).toEqual([
      'mut-start-1',
      'mut-finish-1',
    ]);

    // Come back online -> window 'online' triggers FIFO flush
    online = true;
    window.dispatchEvent(new Event('online'));
    await engine.waitForIdle();

    expect(callOrder).toEqual(['mut-start-1', 'mut-finish-1']);
    expect(await getQueuedLegMutations(eventId)).toEqual([]);
    expect(confirmedLegs[confirmedLegs.length - 1]?.status).toBe('completed');
    expect(confirmedLegs[confirmedLegs.length - 1]?.durationSeconds).toBe(1560);

    // Verify visibilitychange (visible) & focus triggers flush queued items too
    online = false;
    await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-focus-1', '2027-01-09T14:00:00.000Z'),
      { actionType: 'start', previousLegSnapshot: confirmedLegs[confirmedLegs.length - 1]! },
    );
    expect((await getQueuedLegMutations(eventId)).length).toBe(1);

    online = true;
    window.dispatchEvent(new Event('focus'));
    await engine.waitForIdle();
    expect(await getQueuedLegMutations(eventId)).toEqual([]);

    online = false;
    await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-vis-1', '2027-01-09T14:05:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    online = true;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await engine.waitForIdle();
    expect(await getQueuedLegMutations(eventId)).toEqual([]);

    engine.stop();
  });

  it('retries failed flushes with exponential backoff (15s -> 30s -> 60s -> max 5m)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { eventId, api, leg1 } = await setupEngineFixture();

    let attempts = 0;
    vi.spyOn(api, 'applyLegMutation').mockImplementation(async (input) => {
      attempts += 1;
      if (attempts <= 2) {
        throw new Error('Temporary network timeout');
      }
      return InMemoryEventApi.prototype.applyLegMutation.call(api, input);
    });

    const engine = createLegMutationQueueEngine({
      eventId,
      eventApi: api,
      baseBackoffMs: 15_000,
      maxBackoffMs: 300_000,
      isOnline: () => true,
    });
    engine.start();

    // Initial enqueue online attempts flush #1 -> fails -> schedules 15s backoff
    const outcome = await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-backoff-1', '2027-01-09T13:00:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    expect(outcome.queuedOffline).toBe(true);
    expect(attempts).toBe(1);

    // Before 15s, no retry yet
    await vi.advanceTimersByTimeAsync(14_000);
    expect(attempts).toBe(1);

    // At 15s -> attempt #2 fails -> schedules 30s backoff
    await vi.advanceTimersByTimeAsync(1_200);
    await engine.waitForIdle();
    expect(attempts).toBe(2);

    // At +29s -> still waiting for 30s backoff
    await vi.advanceTimersByTimeAsync(29_000);
    expect(attempts).toBe(2);

    // At +30s -> attempt #3 succeeds and empties queue
    await vi.advanceTimersByTimeAsync(1_200);
    await engine.waitForIdle();
    expect(attempts).toBe(3);
    expect(await getQueuedLegMutations(eventId)).toEqual([]);

    engine.stop();
  });

  it('drops stale queue entry, syncs authoritative server Leg, and emits neutral toast on stale_or_overridden', async () => {
    const { eventId, api, organizerApi, leg1, leg2 } = await setupEngineFixture();
    let online = false;
    const staleEvents: Array<{ leg: Leg; message: string }> = [];
    const confirmedLegs: Leg[] = [];

    const engine = createLegMutationQueueEngine({
      eventId,
      eventApi: api,
      isOnline: () => online,
      onStaleOverride: (leg, message) => staleEvents.push({ leg, message }),
      onLegConfirmed: (leg) => confirmedLegs.push(leg),
    });
    engine.start();

    // Queue an offline start on leg1 at 13:00 and a valid start on leg2 at 14:00
    await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-stale-1', '2027-01-09T13:00:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    await engine.enqueue(
      makeStartInput(eventId, leg2, 'mut-valid-2', '2027-01-09T14:00:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg2 },
    );

    // Meanwhile Organizer already completed leg1 at 13:25 on the server!
    await organizerApi.applyLegMutation({
      eventId,
      legId: leg1.id,
      mutationId: 'org-complete-1',
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:25:00.000Z',
      durationSeconds: 1500,
      courseId: leg1.courseId,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:25:00.000Z',
    });

    online = true;
    await engine.flushNow();

    expect(staleEvents).toHaveLength(1);
    expect(staleEvents[0].message).toBe(STALE_OVERRIDE_TOAST_MESSAGE);
    expect(staleEvents[0].leg.id).toBe(leg1.id);
    expect(staleEvents[0].leg.status).toBe('completed');
    expect(staleEvents[0].leg.updatedByOrganizer).toBe(true);

    // Subsequent queued mutation on leg2 still flushed cleanly!
    expect(confirmedLegs.some((l) => l.id === leg2.id && l.status === 'out_on_course')).toBe(true);
    expect(await getQueuedLegMutations(eventId)).toEqual([]);

    engine.stop();
  });

  it('preserves all queued items intact in IndexedDB when session expires/revokes until Participant re-unlocks', async () => {
    const { eventId, api, organizerApi, leg1 } = await setupEngineFixture();
    let online = false;
    const authErrors: EventAccessError[] = [];

    const engine = createLegMutationQueueEngine({
      eventId,
      eventApi: api,
      isOnline: () => online,
      onAuthRequired: (err) => authErrors.push(err),
    });
    engine.start();

    await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-auth-1', '2027-01-09T13:00:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );

    // Organizer rotates invite code -> revokes Participant session_grants!
    await organizerApi.rotateEventSecret(eventId, 'invite_code', 'NEW-FROST-2027');

    online = true;
    await engine.flushNow();

    expect(authErrors).toHaveLength(1);
    expect(['UNAUTHORIZED', 'FORBIDDEN']).toContain(authErrors[0].code);

    // Item MUST remain intact in IndexedDB in 'pending' state!
    const preserved = await getQueuedLegMutations(eventId);
    expect(preserved).toHaveLength(1);
    expect(preserved[0].mutation_id).toBe('mut-auth-1');
    expect(preserved[0].sync_state).toBe('pending');

    // Participant re-unlocks Event with the new invite code -> resumeAfterUnlock flushes preserved queue!
    await api.unlockEvent('2027', 'NEW-FROST-2027');
    await engine.resumeAfterUnlock();

    expect(await getQueuedLegMutations(eventId)).toEqual([]);
    const serverSnap = await api.getEventSnapshot(eventId);
    expect(serverSnap.legs.find((l) => l.id === leg1.id)?.status).toBe('out_on_course');

    engine.stop();
  });

  it('handles offline-aware Undo: local delete with zero network call pre-flush, and compensating revert with isExplicitRevert=true post-flush', async () => {
    const { eventId, api, leg1 } = await setupEngineFixture();
    let online = false;
    const applySpy = vi.spyOn(api, 'applyLegMutation');

    const engine = createLegMutationQueueEngine({
      eventId,
      eventApi: api,
      isOnline: () => online,
    });
    engine.start();

    // 1. Pre-flush Undo while offline -> deletes from IndexedDB with ZERO network call
    const startOutcome = await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-undo-local', '2027-01-09T13:00:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    expect((await getQueuedLegMutations(eventId)).length).toBe(1);

    const localUndo = await engine.undoLegMutation(startOutcome.mutationId, leg1);
    expect(localUndo.mode).toBe('deleted_locally');
    expect(localUndo.restoredLeg.status).toBe('scheduled');
    expect(applySpy).not.toHaveBeenCalled();
    expect(await getQueuedLegMutations(eventId)).toEqual([]);

    // 2. Post-flush Undo while online -> enqueues & sends compensating revert with isExplicitRevert: true
    online = true;
    const onlineStart = await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-undo-online', '2027-01-09T13:05:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    expect(onlineStart.queuedOffline).toBe(false);
    expect(applySpy).toHaveBeenCalledTimes(1);

    const postFlushUndo = await engine.undoLegMutation(onlineStart.mutationId, leg1);
    expect(postFlushUndo.mode).toBe('reverted_online');
    expect(postFlushUndo.restoredLeg.status).toBe('scheduled');
    expect(applySpy).toHaveBeenCalledTimes(2);
    expect(applySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        legId: leg1.id,
        status: 'scheduled',
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        isExplicitRevert: true,
      }),
    );

    // 3. Post-flush Undo when connection drops right after flush -> queues compensating revert offline!
    const secondOnlineStart = await engine.enqueue(
      makeStartInput(eventId, leg1, 'mut-undo-drop', '2027-01-09T13:10:00.000Z'),
      { actionType: 'start', previousLegSnapshot: leg1 },
    );
    expect(secondOnlineStart.queuedOffline).toBe(false);

    online = false;
    const offlineRevertUndo = await engine.undoLegMutation(secondOnlineStart.mutationId, leg1);
    expect(offlineRevertUndo.mode).toBe('queued_revert_offline');
    const queuedRevert = await getQueuedLegMutations(eventId);
    expect(queuedRevert).toHaveLength(1);
    expect(queuedRevert[0].action_type).toBe('revert');
    expect(queuedRevert[0].is_explicit_revert).toBe(true);

    engine.stop();
  });
});
