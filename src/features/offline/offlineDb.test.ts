import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import type { EventSnapshot, Leg } from '../../types/domain';
import {
  clearOfflineDb,
  deleteQueuedLegMutation,
  getEventSnapshotByEventId,
  getEventSnapshotBySlug,
  getQueuedLegMutation,
  getQueuedLegMutations,
  putQueuedLegMutation,
  saveEventSnapshot,
  type QueuedLegMutation,
} from './offlineDb';
import { applyPendingMutationsToSnapshot } from './optimisticOverlay';

async function buildSnapshotFixture(): Promise<{
  eventId: string;
  snapshot: EventSnapshot;
  leg: Leg;
  secondaryCourseId: string;
}> {
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

  const orgApi = new InMemoryEventApi(store);
  await orgApi.unlockOrganizer(eventId, 'HOST-2027');
  await orgApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });
  const lake = await orgApi.upsertCourse(eventId, {
    name: 'Lake Loop 5K',
    description: null,
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });
  const team = await orgApi.createTeam(eventId, {
    name: 'Polar Pacers',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });
  const maya = await orgApi.createParticipant(eventId, {
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

  const initial = await orgApi.getEventSnapshot(eventId);
  const leg = initial.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
  await orgApi.updateLeg(eventId, leg.id, { runnerId: maya.id });
  const snapshot = await orgApi.getEventSnapshot(eventId);
  const assignedLeg = snapshot.legs.find((l) => l.id === leg.id)!;

  return { eventId, snapshot, leg: assignedLeg, secondaryCourseId: lake.id };
}

describe('offlineDb & optimisticOverlay', () => {
  beforeEach(async () => {
    await clearOfflineDb();
  });

  afterEach(async () => {
    await clearOfflineDb();
  });

  it('persists and retrieves event_snapshot by event_id and slug with last_synced_at', async () => {
    const { eventId, snapshot } = await buildSnapshotFixture();
    const syncedAt = '2027-01-09T14:10:00.000Z';

    await saveEventSnapshot(snapshot, syncedAt);

    const byId = await getEventSnapshotByEventId(eventId);
    expect(byId).not.toBeNull();
    expect(byId?.event_id).toBe(eventId);
    expect(byId?.slug).toBe('2027');
    expect(byId?.last_synced_at).toBe(syncedAt);
    expect(byId?.data.event.name).toBe('Winter Grind 50K 2027');

    const bySlug = await getEventSnapshotBySlug('2027');
    expect(bySlug).not.toBeNull();
    expect(bySlug?.event_id).toBe(eventId);
    expect(bySlug?.last_synced_at).toBe(syncedAt);
  });

  it('strips private chipIns rows before persisting event_snapshot to IndexedDB while preserving chipInTotalCents', async () => {
    const { eventId, snapshot } = await buildSnapshotFixture();
    const organizerSnapshot: EventSnapshot = {
      ...snapshot,
      chipInTotalCents: 4500,
      chipIns: [
        {
          id: 'ci-secret-1',
          eventId,
          participantId: snapshot.participants[0]?.id ?? null,
          amountCents: 4500,
          note: 'Private Venmo note',
          recordedAt: '2027-01-09T12:00:00.000Z',
        },
      ],
    };

    await saveEventSnapshot(organizerSnapshot, '2027-01-09T14:15:00.000Z');

    const stored = await getEventSnapshotByEventId(eventId);
    expect(stored).not.toBeNull();
    expect(stored?.data.chipIns).toEqual([]);
    expect(stored?.data.chipInTotalCents).toBe(4500);
    // Input snapshot object is not mutated
    expect(organizerSnapshot.chipIns).toHaveLength(1);
  });

  it('stores leg_mutation_queue entries and reads them in strict FIFO queued_at order', async () => {
    const { eventId, leg } = await buildSnapshotFixture();

    const second: QueuedLegMutation = {
      mutation_id: 'mut-2',
      event_id: eventId,
      leg_id: leg.id,
      action_type: 'finish',
      payload: {
        status: 'completed',
        started_at: '2027-01-09T13:00:00.000Z',
        finished_at: '2027-01-09T13:26:00.000Z',
        duration_seconds: 1560,
        course_id: leg.courseId,
        external_activity_url: null,
      },
      is_explicit_revert: false,
      client_updated_at: '2027-01-09T13:26:00.000Z',
      previous_leg_snapshot: {
        ...leg,
        status: 'out_on_course',
        startedAt: '2027-01-09T13:00:00.000Z',
      },
      queued_at: '2027-01-09T13:26:00.000Z',
      retry_count: 0,
      sync_state: 'pending',
    };

    const first: QueuedLegMutation = {
      mutation_id: 'mut-1',
      event_id: eventId,
      leg_id: leg.id,
      action_type: 'start',
      payload: {
        status: 'out_on_course',
        started_at: '2027-01-09T13:00:00.000Z',
        finished_at: null,
        duration_seconds: null,
        course_id: leg.courseId,
        external_activity_url: null,
      },
      is_explicit_revert: false,
      client_updated_at: '2027-01-09T13:00:00.000Z',
      previous_leg_snapshot: leg,
      queued_at: '2027-01-09T13:00:00.000Z',
      retry_count: 0,
      sync_state: 'pending',
    };

    // Insert out of chronological order; FIFO read must return first then second
    await putQueuedLegMutation(second);
    await putQueuedLegMutation(first);

    const queued = await getQueuedLegMutations(eventId);
    expect(queued.map((item) => item.mutation_id)).toEqual(['mut-1', 'mut-2']);

    const fetchedOne = await getQueuedLegMutation('mut-1');
    expect(fetchedOne?.action_type).toBe('start');

    await deleteQueuedLegMutation('mut-1');
    const remaining = await getQueuedLegMutations(eventId);
    expect(remaining.map((item) => item.mutation_id)).toEqual(['mut-2']);
  });

  it('deterministically overlays FIFO pending leg mutations onto EventSnapshot without mutating input', async () => {
    const { eventId, snapshot, leg, secondaryCourseId } = await buildSnapshotFixture();

    const queue: QueuedLegMutation[] = [
      {
        mutation_id: 'mut-2',
        event_id: eventId,
        leg_id: leg.id,
        action_type: 'finish',
        payload: {
          status: 'completed',
          started_at: '2027-01-09T13:00:00.000Z',
          finished_at: '2027-01-09T13:27:30.000Z',
          duration_seconds: 1650,
          course_id: secondaryCourseId,
          external_activity_url: 'https://www.strava.com/activities/12345',
        },
        is_explicit_revert: false,
        client_updated_at: '2027-01-09T13:27:30.000Z',
        previous_leg_snapshot: {
          ...leg,
          status: 'out_on_course',
          startedAt: '2027-01-09T13:00:00.000Z',
        },
        queued_at: '2027-01-09T13:27:30.000Z',
        retry_count: 0,
        sync_state: 'pending',
      },
      {
        mutation_id: 'mut-1',
        event_id: eventId,
        leg_id: leg.id,
        action_type: 'start',
        payload: {
          status: 'out_on_course',
          started_at: '2027-01-09T13:00:00.000Z',
          finished_at: null,
          duration_seconds: null,
          course_id: leg.courseId,
          external_activity_url: null,
        },
        is_explicit_revert: false,
        client_updated_at: '2027-01-09T13:00:00.000Z',
        previous_leg_snapshot: leg,
        queued_at: '2027-01-09T13:00:00.000Z',
        retry_count: 0,
        sync_state: 'pending',
      },
    ];

    const overlaid = applyPendingMutationsToSnapshot(snapshot, queue);

    // Input snapshot remains untouched
    expect(snapshot.legs.find((l) => l.id === leg.id)?.status).toBe('scheduled');

    const updatedLeg = overlaid.legs.find((l) => l.id === leg.id)!;
    expect(updatedLeg.status).toBe('completed');
    expect(updatedLeg.startedAt).toBe('2027-01-09T13:00:00.000Z');
    expect(updatedLeg.finishedAt).toBe('2027-01-09T13:27:30.000Z');
    expect(updatedLeg.durationSeconds).toBe(1650);
    expect(updatedLeg.courseId).toBe(secondaryCourseId);
    expect(updatedLeg.externalActivityUrl).toBe('https://www.strava.com/activities/12345');
    expect(updatedLeg.lastMutationId).toBe('mut-2');
  });
});
