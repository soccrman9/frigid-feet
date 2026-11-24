import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from './inMemoryEventApi';
import { EventAccessError } from '../types/domain';

function createFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-KEY-2027',
    dashboardToken: 'dash-token-secret-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
    chipInTargetCents: 30000,
  });

  const api = new InMemoryEventApi(store);
  return { store, eventId, api };
}

describe('EventApi — provisioning, invite unlock, and RLS isolation', () => {
  it('returns only the active Event slug before unlock and blocks ungranted reads', async () => {
    const { api, eventId } = createFixture();

    await expect(api.getActiveEventSlug()).resolves.toBe('2027');
    await expect(api.pingHeartbeat()).resolves.toBe(true);
    await expect(api.getEventSnapshot(eventId)).rejects.toThrow(EventAccessError);
    await expect(api.getChipInSummary(eventId)).rejects.toThrow(EventAccessError);
    await expect(api.getChipIns(eventId)).rejects.toThrow(EventAccessError);
  });

  it('rejects invalid invite codes and unlocks with a valid invite code', async () => {
    const { api, eventId } = createFixture();
    await api.ensureSession();

    await expect(api.unlockEvent('2027', 'WRONG-CODE')).rejects.toMatchObject({
      code: 'INVALID_INVITE_CODE',
    });

    const unlockedId = await api.unlockEvent('2027', 'FROST-2027');
    expect(unlockedId).toBe(eventId);
    expect(await api.getSessionGrants(eventId)).toEqual(['participant']);

    const snapshot = await api.getEventSnapshot(eventId);
    expect(snapshot.event.name).toBe('Winter Grind 50K 2027');
    expect(snapshot.rounds).toHaveLength(10);
    expect(snapshot.rounds[0].roundNumber).toBe(1);
    expect(snapshot.rounds[9].roundNumber).toBe(10);
    expect(snapshot.badgeDefinitions).toHaveLength(5);
    expect(snapshot.badgeDefinitions.map((b) => b.name)).toEqual([
      'Best Cold-Weather Outfit',
      'Cheer Squad MVP',
      'Best Snack Contributor',
      'Most Encouraging',
      'Best Vibes at Basecamp',
    ]);
    // Never leaks event_secrets
    expect(JSON.stringify(snapshot)).not.toContain('FROST-2027');
    expect(JSON.stringify(snapshot)).not.toContain('HOST-KEY-2027');
    expect(JSON.stringify(snapshot)).not.toContain('dash-token-secret-2027');
  });

  it('enforces the full RLS matrix across dashboard, participant, and organizer scopes', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.ensureSession();
    expect(await organizerApi.unlockOrganizer(eventId, 'WRONG')).toBe(false);
    expect(await organizerApi.unlockOrganizer(eventId, 'HOST-KEY-2027')).toBe(true);

    // Organizer can seed Courses, Wish-list Supplies, and Chip-Ins
    const course = await organizerApi.upsertCourse(eventId, {
      name: 'Boardwalk 5K',
      description: 'Flat waterfront loop',
      distanceKm: 5,
      isPrimary: true,
      gpxXml: null,
      externalRouteUrl: 'https://example.com/boardwalk-5k',
      sortOrder: 0,
    });
    const wishlistItem = await organizerApi.createSupplyItem(eventId, {
      category: 'drinks',
      name: 'Hot Cocoa Thermos',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });
    await organizerApi.createChipIn(eventId, {
      participantId: null,
      amountCents: 4500,
      note: 'Venmo',
    });

    // Participant session
    const participantApi = new InMemoryEventApi(store);
    await participantApi.ensureSession();
    await participantApi.unlockEvent('2027', 'FROST-2027');

    // Participant sees aggregate chip-in total via RPC, NOT individual chip_ins
    expect(await participantApi.getChipInSummary(eventId)).toBe(4500);
    await expect(participantApi.getChipIns(eventId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const pSnap = await participantApi.getEventSnapshot(eventId);
    expect(pSnap.chipInTotalCents).toBe(4500);
    expect(pSnap.chipIns).toEqual([]);

    // Participant can create volunteered Supply (isWishlist: false), NOT wish-list Supply
    const volunteered = await participantApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Banana Bread',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: null,
    });
    expect(volunteered.isWishlist).toBe(false);

    await expect(
      participantApi.createSupplyItem(eventId, {
        category: 'food',
        name: 'Unauthorized Wishlist',
        isWishlist: true,
        targetSlots: 3,
        createdByParticipantId: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      participantApi.updateSupplyItem(eventId, wishlistItem.id, { name: 'Tampered' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      participantApi.deleteSupplyItem(eventId, wishlistItem.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Participant cannot edit Organizer-only tables
    await expect(
      participantApi.updateEvent(eventId, { name: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      participantApi.createAnnouncement(eventId, {
        title: 'Nope',
        body: 'Blocked',
        isPinned: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      participantApi.deleteCourse(eventId, course.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Dashboard session is strictly read-only and has zero chip_ins access
    const dashboardApi = new InMemoryEventApi(store);
    await dashboardApi.ensureSession();
    await expect(dashboardApi.unlockDashboard('bad-token')).rejects.toMatchObject({
      code: 'INVALID_DASHBOARD_TOKEN',
    });
    expect(await dashboardApi.unlockDashboard('dash-token-secret-2027')).toBe(eventId);

    const dSnap = await dashboardApi.getEventSnapshot(eventId);
    expect(dSnap.event.name).toBe('Winter Grind 50K 2027');
    expect(dSnap.chipIns).toEqual([]);
    await expect(dashboardApi.getChipIns(eventId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(dashboardApi.getChipInSummary(eventId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      dashboardApi.createParticipant(eventId, {
        displayName: 'Read Only Attempt',
        rsvpStatus: 'going_runner',
        teamId: null,
        availableFromRound: 1,
        availableToRound: 10,
        rough5kMinutes: 30,
        isFirst5k: false,
        dietaryNotes: null,
        showTimesOnLeaderboard: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('pre-seeds 10 placeholder legs on Team creation, handles leaveTeam cleanup, startRound, applyLegMutation, and secret rotation', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.ensureSession();
    await organizerApi.unlockOrganizer(eventId, 'HOST-KEY-2027');

    const primaryCourse = await organizerApi.upsertCourse(eventId, {
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

    const team = await participantApi.createTeam(eventId, {
      name: 'Frostbite Fighters',
      tagline: 'Warm socks only',
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

    let snap = await participantApi.getEventSnapshot(eventId);
    const teamLegs = snap.legs.filter((l) => l.teamId === team.id);
    expect(teamLegs).toHaveLength(10);
    expect(teamLegs.every((l) => l.status === 'scheduled' && l.runnerId === null && l.courseId === primaryCourse.id)).toBe(true);

    // Assign runner to Round 1 and Round 2
    const leg1 = teamLegs.find((l) => l.roundNumber === 1)!;
    const leg2 = teamLegs.find((l) => l.roundNumber === 2)!;
    await participantApi.updateLeg(eventId, leg1.id, { runnerId: runner.id });
    await participantApi.updateLeg(eventId, leg2.id, { runnerId: runner.id });

    // Organizer starts Round 1
    const startedAt = '2027-01-09T13:00:00.000Z';
    const startedCount = await organizerApi.startRound(eventId, 1, [], startedAt);
    expect(startedCount).toBe(1);

    // Non-organizer stale write cannot overwrite Organizer's mass-start
    const staleResult = await participantApi.applyLegMutation({
      eventId,
      legId: leg1.id,
      mutationId: 'mut-stale-1',
      status: 'scheduled',
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      courseId: primaryCourse.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: startedAt,
    });
    expect(staleResult.applied).toBe(false);
    expect(staleResult.reason).toBe('stale_or_overridden');

    // Strictly newer finish succeeds and is idempotent on replay
    const finishedAt = '2027-01-09T13:28:00.000Z';
    const finishRes = await participantApi.applyLegMutation({
      eventId,
      legId: leg1.id,
      mutationId: 'mut-finish-1',
      status: 'completed',
      startedAt,
      finishedAt,
      durationSeconds: 1680,
      courseId: primaryCourse.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: finishedAt,
    });
    expect(finishRes.applied).toBe(true);
    expect(finishRes.reason).toBe('applied');

    const replayRes = await participantApi.applyLegMutation({
      eventId,
      legId: leg1.id,
      mutationId: 'mut-finish-1',
      status: 'completed',
      startedAt,
      finishedAt,
      durationSeconds: 1680,
      courseId: primaryCourse.id,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: finishedAt,
    });
    expect(replayRes.applied).toBe(true);
    expect(replayRes.reason).toBe('duplicate');

    // Leaving team preserves completed leg1, unassigns scheduled leg2, keeps team because leg1 is completed
    await participantApi.leaveTeam(runner.id);
    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.teams.find((t) => t.id === team.id)).toBeDefined();
    expect(snap.legs.find((l) => l.id === leg1.id)?.runnerId).toBe(runner.id);
    expect(snap.legs.find((l) => l.id === leg2.id)?.runnerId).toBeNull();

    // Empty team with 0 completed legs is auto-deleted on leaveTeam
    const emptyTeam = await participantApi.createTeam(eventId, {
      name: 'Temp Squad',
      tagline: null,
      colorHex: null,
      emoji: null,
      isOpen: true,
      lookingNote: null,
    });
    await participantApi.updateParticipant(eventId, runner.id, { teamId: emptyTeam.id });
    await participantApi.leaveTeam(runner.id);
    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.teams.find((t) => t.id === emptyTeam.id)).toBeUndefined();

    // Rotating invite_code revokes participant session grants
    await organizerApi.rotateEventSecret(eventId, 'invite_code', 'NEW-FROST-2027');
    await expect(participantApi.getEventSnapshot(eventId)).rejects.toThrow(EventAccessError);
    await expect(participantApi.unlockEvent('2027', 'FROST-2027')).rejects.toMatchObject({
      code: 'INVALID_INVITE_CODE',
    });
    expect(await participantApi.unlockEvent('2027', 'NEW-FROST-2027')).toBe(eventId);
  });
});
