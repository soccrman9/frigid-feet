import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseEventApi } from '../../lib/supabaseEventApi';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import {
  REALTIME_TABLES,
  type RealtimeChangeEvent,
  type RealtimeConnectionStatus,
} from './realtimeTypes';

interface RegisteredPostgresListener {
  filter: { event: string; schema: string; table: string; filter?: string };
  callback: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => void;
}

function createFakeSupabaseClient() {
  const listeners: RegisteredPostgresListener[] = [];
  let statusCallback: ((status: string) => void) | null = null;
  const channelNames: string[] = [];
  const removedChannels: unknown[] = [];

  const fakeChannel = {
    on: vi.fn((type: string, filter: RegisteredPostgresListener['filter'], callback: RegisteredPostgresListener['callback']) => {
      if (type === 'postgres_changes') {
        listeners.push({ filter, callback });
      }
      return fakeChannel;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      statusCallback = cb ?? null;
      return fakeChannel;
    }),
  };

  const client = {
    channel: vi.fn((name: string) => {
      channelNames.push(name);
      return fakeChannel;
    }),
    removeChannel: vi.fn(async (ch: unknown) => {
      removedChannels.push(ch);
      return 'ok';
    }),
  } as unknown as SupabaseClient;

  return {
    client,
    fakeChannel,
    listeners,
    channelNames,
    removedChannels,
    emitStatus: (status: string) => statusCallback?.(status),
    emitRow: (
      table: string,
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      newRow: Record<string, unknown>,
      oldRow: Record<string, unknown> = {},
    ) => {
      const match = listeners.find((l) => l.filter.table === table);
      if (!match) throw new Error(`No listener registered for table ${table}`);
      match.callback({ eventType, new: newRow, old: oldRow });
    },
  };
}

describe('SupabaseEventApi single-channel Realtime subscription', () => {
  it('opens ONE multiplexed channel across all 11 live tables with event_id filtering, maps snake_case rows to camelCase, and reports status transitions', () => {
    const fake = createFakeSupabaseClient();
    const api = new SupabaseEventApi(fake.client);

    const events: RealtimeChangeEvent[] = [];
    const statuses: RealtimeConnectionStatus[] = [];

    const unsubscribe = api.subscribeToEvent('evt-2027', {
      onChange: (event) => events.push(event),
      onStatusChange: (status) => statuses.push(status),
    });

    // Strictly ONE channel opened
    expect(fake.channelNames).toEqual(['event:evt-2027']);
    expect(fake.listeners).toHaveLength(11);

    // Every canonical table is registered with event: '*', schema: 'public', and event filter
    const registeredTables = fake.listeners.map((l) => l.filter.table);
    expect(new Set(registeredTables)).toEqual(new Set(REALTIME_TABLES));

    for (const listener of fake.listeners) {
      expect(listener.filter.event).toBe('*');
      expect(listener.filter.schema).toBe('public');
      if (listener.filter.table === 'events') {
        expect(listener.filter.filter).toBe('id=eq.evt-2027');
      } else {
        expect(listener.filter.filter).toBe('event_id=eq.evt-2027');
      }
    }

    // Status transitions
    expect(statuses).toEqual(['connecting']);
    fake.emitStatus('SUBSCRIBED');
    fake.emitStatus('CHANNEL_ERROR');
    fake.emitStatus('TIMED_OUT');
    fake.emitStatus('CLOSED');
    fake.emitStatus('SUBSCRIBED');
    expect(statuses).toEqual([
      'connecting',
      'connected',
      'reconnecting',
      'reconnecting',
      'disconnected',
      'connected',
    ]);

    // Snake_case -> camelCase mapping for INSERT, UPDATE, and DELETE
    fake.emitRow('legs', 'UPDATE', {
      id: 'leg-1',
      event_id: 'evt-2027',
      team_id: 'team-1',
      round_number: 4,
      runner_id: 'p-1',
      course_id: 'course-1',
      status: 'completed',
      started_at: '2027-01-09T16:00:00.000Z',
      finished_at: '2027-01-09T16:28:10.000Z',
      duration_seconds: 1690,
      external_activity_url: 'https://strava.com/activities/123',
      client_updated_at: '2027-01-09T16:28:10.000Z',
      last_mutation_id: 'mut-1',
      updated_by_organizer: false,
    });

    fake.emitRow(
      'supply_claims',
      'DELETE',
      {},
      {
        id: 'claim-9',
        event_id: 'evt-2027',
        supply_item_id: 'sup-1',
        participant_id: 'p-1',
        note: 'Bringing two boxes',
        created_at: '2027-01-08T10:00:00.000Z',
      },
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      table: 'legs',
      eventType: 'UPDATE',
      newRow: {
        id: 'leg-1',
        eventId: 'evt-2027',
        teamId: 'team-1',
        roundNumber: 4,
        runnerId: 'p-1',
        courseId: 'course-1',
        status: 'completed',
        startedAt: '2027-01-09T16:00:00.000Z',
        finishedAt: '2027-01-09T16:28:10.000Z',
        durationSeconds: 1690,
        externalActivityUrl: 'https://strava.com/activities/123',
        clientUpdatedAt: '2027-01-09T16:28:10.000Z',
        lastMutationId: 'mut-1',
        updatedByOrganizer: false,
      },
      oldRow: null,
    });

    expect(events[1]).toEqual({
      table: 'supply_claims',
      eventType: 'DELETE',
      newRow: null,
      oldRow: {
        id: 'claim-9',
        eventId: 'evt-2027',
        supplyItemId: 'sup-1',
        participantId: 'p-1',
        note: 'Bringing two boxes',
        createdAt: '2027-01-08T10:00:00.000Z',
      },
    });

    // Unsubscribe cleans up channel and suppresses post-unsubscribe CLOSED callbacks
    unsubscribe();
    expect(fake.removedChannels).toEqual([fake.fakeChannel]);
    fake.emitStatus('CLOSED');
    expect(statuses).toHaveLength(6);
  });
});

describe('InMemoryEventApi typed Realtime pub/sub & simulation helpers', () => {
  it('emits typed RealtimeChangeEvents on live mutations and supports simulating socket status drops/reconnects', async () => {
    const store = new InMemoryEventStore();
    const eventId = store.createEvent({
      slug: '2027',
      name: 'Winter Grind 50K 2027',
      eventDate: '2027-01-09',
      startTime: '2027-01-09T13:00:00.000Z',
      timezone: 'America/New_York',
      inviteCode: 'FROST50K',
      organizerPasscode: 'HOST50K',
      dashboardToken: 'dash-2027',
      isActive: true,
    });

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.unlockOrganizer(eventId, 'HOST50K');

    const mobileApi = new InMemoryEventApi(store);
    await mobileApi.unlockEvent('2027', 'FROST50K');

    const received: RealtimeChangeEvent[] = [];
    const statuses: RealtimeConnectionStatus[] = [];

    const unsub = mobileApi.subscribeToEvent(eventId, {
      onChange: (change) => received.push(change),
      onStatusChange: (status) => statuses.push(status),
    });

    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(statuses).toContain('connected');

    const announcement = await organizerApi.createAnnouncement(eventId, {
      title: 'Hot broth',
      body: 'Ready at Basecamp!',
      isPinned: true,
    });
    await organizerApi.deleteAnnouncement(eventId, announcement.id);

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({
      table: 'announcements',
      eventType: 'INSERT',
      newRow: { id: announcement.id, title: 'Hot broth' },
    });
    expect(received[1]).toMatchObject({
      table: 'announcements',
      eventType: 'DELETE',
      oldRow: { id: announcement.id },
    });

    store.simulateRealtimeStatus(eventId, 'reconnecting');
    store.simulateRealtimeStatus(eventId, 'connected');
    expect(statuses.slice(-2)).toEqual(['reconnecting', 'connected']);

    unsub();
    expect(store.getActiveSubscriptionCount(eventId)).toBe(0);
  });
});
