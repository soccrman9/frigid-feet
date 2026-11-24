import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import type { EventSnapshot } from '../../types/domain';
import { REALTIME_TABLES } from './realtimeTypes';
import { applyRealtimeChangeToSnapshot } from './realtimeMerge';

async function createBaseSnapshot(): Promise<EventSnapshot> {
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
    basecampName: 'Lakeside Pavilion',
  });
  const api = new InMemoryEventApi(store);
  await api.unlockOrganizer(eventId, 'HOST50K');
  return api.getEventSnapshot(eventId);
}

describe('REALTIME_TABLES & applyRealtimeChangeToSnapshot', () => {
  it('lists all 11 canonical live tables in REALTIME_TABLES', () => {
    expect(REALTIME_TABLES).toHaveLength(11);
    expect(new Set(REALTIME_TABLES)).toEqual(
      new Set([
        'legs',
        'rounds',
        'teams',
        'participants',
        'announcements',
        'badge_awards',
        'badge_definitions',
        'supply_items',
        'supply_claims',
        'events',
        'courses',
      ]),
    );
  });

  it('merges INSERT, UPDATE, and DELETE across legs, rounds, teams, and participants while preserving canonical sort order', async () => {
    const initial = await createBaseSnapshot();
    const eventId = initial.event.id;

    // Teams sorted alphabetically
    let snap = applyRealtimeChangeToSnapshot(initial, {
      table: 'teams',
      eventType: 'INSERT',
      newRow: {
        id: 'team-z',
        eventId,
        name: 'Zero Degree Runners',
        tagline: null,
        colorHex: '#163A59',
        emoji: '❄️',
        isOpen: true,
        lookingNote: null,
        createdAt: '2027-01-01T00:00:00.000Z',
      },
      oldRow: null,
    });
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'teams',
      eventType: 'INSERT',
      newRow: {
        id: 'team-a',
        eventId,
        name: 'Arctic Striders',
        tagline: 'Steady',
        colorHex: '#157A4B',
        emoji: '🧤',
        isOpen: true,
        lookingNote: null,
        createdAt: '2027-01-01T00:01:00.000Z',
      },
      oldRow: null,
    });
    expect(snap.teams.map((t) => t.name)).toEqual(['Arctic Striders', 'Zero Degree Runners']);
    // Original snapshot stays untouched (immutable)
    expect(initial.teams).toEqual([]);

    // Team UPDATE re-sorts cleanly
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'teams',
      eventType: 'UPDATE',
      newRow: { ...snap.teams[1], name: 'Alpine Pacers' },
      oldRow: { id: 'team-z' },
    });
    expect(snap.teams.map((t) => t.name)).toEqual(['Alpine Pacers', 'Arctic Striders']);

    // Legs sorted canonically by (teamId, roundNumber) and deduplicated on duplicate INSERT
    const legB2 = {
      id: 'leg-b2',
      eventId,
      teamId: 'team-z',
      roundNumber: 2,
      runnerId: null,
      courseId: null,
      status: 'scheduled' as const,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      externalActivityUrl: null,
      clientUpdatedAt: '2027-01-09T13:00:00.000Z',
      lastMutationId: null,
      updatedByOrganizer: false,
    };
    const legA1 = { ...legB2, id: 'leg-a1', teamId: 'team-a', roundNumber: 1 };
    const legB1 = { ...legB2, id: 'leg-b1', teamId: 'team-z', roundNumber: 1 };

    snap = applyRealtimeChangeToSnapshot(snap, { table: 'legs', eventType: 'INSERT', newRow: legB2, oldRow: null });
    snap = applyRealtimeChangeToSnapshot(snap, { table: 'legs', eventType: 'INSERT', newRow: legA1, oldRow: null });
    snap = applyRealtimeChangeToSnapshot(snap, { table: 'legs', eventType: 'INSERT', newRow: legB1, oldRow: null });
    // Duplicate INSERT replaces without duplicating
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'legs',
      eventType: 'INSERT',
      newRow: { ...legB1, status: 'out_on_course', startedAt: '2027-01-09T13:00:00.000Z' },
      oldRow: null,
    });
    expect(snap.legs.map((l) => l.id)).toEqual(['leg-a1', 'leg-b1', 'leg-b2']);
    expect(snap.legs.find((l) => l.id === 'leg-b1')?.status).toBe('out_on_course');

    // Leg DELETE removes cleanly
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'legs',
      eventType: 'DELETE',
      newRow: null,
      oldRow: { id: 'leg-b2' },
    });
    expect(snap.legs.map((l) => l.id)).toEqual(['leg-a1', 'leg-b1']);

    // Round UPDATE preserves roundNumber ascending order
    const round3 = snap.rounds.find((r) => r.roundNumber === 3)!;
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'rounds',
      eventType: 'UPDATE',
      newRow: { ...round3, startedAt: '2027-01-09T15:00:00.000Z' },
      oldRow: { id: round3.id },
    });
    expect(snap.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(snap.rounds[2].startedAt).toBe('2027-01-09T15:00:00.000Z');

    // Participant INSERT / UPDATE / DELETE sorted by displayName
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'participants',
      eventType: 'INSERT',
      newRow: {
        id: 'p-2',
        eventId,
        displayName: 'Zoe Park',
        rsvpStatus: 'going_runner',
        teamId: 'team-a',
        availableFromRound: 1,
        availableToRound: 10,
        rough5kMinutes: 27,
        isFirst5k: false,
        dietaryNotes: null,
        showTimesOnLeaderboard: false,
        createdAt: '2027-01-01T00:00:00.000Z',
      },
      oldRow: null,
    });
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'participants',
      eventType: 'INSERT',
      newRow: {
        id: 'p-1',
        eventId,
        displayName: 'Alex Rivera',
        rsvpStatus: 'going_supporter',
        teamId: null,
        availableFromRound: 1,
        availableToRound: 10,
        rough5kMinutes: null,
        isFirst5k: false,
        dietaryNotes: 'Gluten-free',
        showTimesOnLeaderboard: false,
        createdAt: '2027-01-01T00:01:00.000Z',
      },
      oldRow: null,
    });
    expect(snap.participants.map((p) => p.displayName)).toEqual(['Alex Rivera', 'Zoe Park']);

    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'participants',
      eventType: 'DELETE',
      newRow: null,
      oldRow: { id: 'p-2' },
    });
    expect(snap.participants.map((p) => p.displayName)).toEqual(['Alex Rivera']);

    // Team DELETE
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'teams',
      eventType: 'DELETE',
      newRow: null,
      oldRow: { id: 'team-z' },
    });
    expect(snap.teams.map((t) => t.id)).toEqual(['team-a']);
  });

  it('merges announcements, courses, events, supply_items, supply_claims, badge_definitions, and badge_awards', async () => {
    const initial = await createBaseSnapshot();
    const eventId = initial.event.id;

    // Events UPDATE
    let snap = applyRealtimeChangeToSnapshot(initial, {
      table: 'events',
      eventType: 'UPDATE',
      newRow: { ...initial.event, basecampName: 'Updated Warm Lodge' },
      oldRow: { id: eventId },
    });
    expect(snap.event.basecampName).toBe('Updated Warm Lodge');

    // Courses sorted by sortOrder
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'courses',
      eventType: 'INSERT',
      newRow: {
        id: 'course-2',
        eventId,
        name: 'Hill Loop 5K',
        description: null,
        distanceKm: 5,
        isPrimary: false,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 2,
      },
      oldRow: null,
    });
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'courses',
      eventType: 'INSERT',
      newRow: {
        id: 'course-1',
        eventId,
        name: 'Boardwalk 5K',
        description: 'Flat',
        distanceKm: 5,
        isPrimary: true,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 0,
      },
      oldRow: null,
    });
    expect(snap.courses.map((c) => c.id)).toEqual(['course-1', 'course-2']);

    // Announcements sorted pinned first, then newest createdAt
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'announcements',
      eventType: 'INSERT',
      newRow: {
        id: 'ann-1',
        eventId,
        title: 'Coffee ready',
        body: 'Hot pot on table 1',
        isPinned: false,
        createdAt: '2027-01-09T14:00:00.000Z',
      },
      oldRow: null,
    });
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'announcements',
      eventType: 'INSERT',
      newRow: {
        id: 'ann-2',
        eventId,
        title: 'Ice patch',
        body: 'Watch the north bridge turn.',
        isPinned: true,
        createdAt: '2027-01-09T13:30:00.000Z',
      },
      oldRow: null,
    });
    expect(snap.announcements.map((a) => a.id)).toEqual(['ann-2', 'ann-1']);

    // Supply items & supply claims INSERT + DELETE
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'supply_items',
      eventType: 'INSERT',
      newRow: {
        id: 'sup-1',
        eventId,
        category: 'drinks',
        name: 'Hot Cocoa',
        isWishlist: true,
        targetSlots: 2,
        createdByParticipantId: null,
        createdAt: '2027-01-08T12:00:00.000Z',
      },
      oldRow: null,
    });
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'supply_claims',
      eventType: 'INSERT',
      newRow: {
        id: 'claim-1',
        eventId,
        supplyItemId: 'sup-1',
        participantId: 'p-1',
        note: 'Oat milk too',
        createdAt: '2027-01-08T12:15:00.000Z',
      },
      oldRow: null,
    });
    expect(snap.supplyItems).toHaveLength(1);
    expect(snap.supplyClaims).toHaveLength(1);

    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'supply_claims',
      eventType: 'DELETE',
      newRow: null,
      oldRow: { id: 'claim-1' },
    });
    expect(snap.supplyClaims).toHaveLength(0);

    // Badge definitions & badge awards INSERT + DELETE
    const initialDefCount = snap.badgeDefinitions.length;
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'badge_definitions',
      eventType: 'INSERT',
      newRow: {
        id: 'bdef-custom',
        eventId,
        name: 'Best Beanie',
        emoji: '🧶',
        description: 'Top knitwear',
        isPreset: false,
      },
      oldRow: null,
    });
    expect(snap.badgeDefinitions).toHaveLength(initialDefCount + 1);

    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'badge_awards',
      eventType: 'INSERT',
      newRow: {
        id: 'baward-1',
        eventId,
        badgeDefinitionId: 'bdef-custom',
        participantId: 'p-1',
        teamId: null,
        note: 'Neon pom-pom!',
        awardedAt: '2027-01-09T17:00:00.000Z',
      },
      oldRow: null,
    });
    expect(snap.badgeAwards).toHaveLength(1);

    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'badge_awards',
      eventType: 'DELETE',
      newRow: null,
      oldRow: { id: 'baward-1' },
    });
    expect(snap.badgeAwards).toHaveLength(0);

    // Defensive check: ignore rows belonging to a different Event
    const beforeForeign = snap;
    snap = applyRealtimeChangeToSnapshot(snap, {
      table: 'announcements',
      eventType: 'INSERT',
      newRow: {
        id: 'ann-foreign',
        eventId: 'other-event-id',
        title: 'Wrong event',
        body: 'Should not appear',
        isPinned: true,
        createdAt: '2027-01-09T15:00:00.000Z',
      },
      oldRow: null,
    });
    expect(snap).toBe(beforeForeign);
  });
});
