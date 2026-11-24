import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { SupabaseEventApi } from '../../lib/supabaseEventApi';
import { EventAccessError } from '../../types/domain';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function createFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-token-secret-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
  });
  return { store, eventId };
}

describe('Basecamp Dashboard unlock_dashboard & strict read-only RLS enforcement', () => {
  it('verifies unlock_dashboard token grant and rejects every write and chip-in read under dashboard scope in InMemoryEventApi', async () => {
    const { store, eventId } = createFixture();

    // Seed Event records via Organizer session
    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.ensureSession();
    await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

    const course = await organizerApi.upsertCourse(eventId, {
      name: 'Boardwalk 5K',
      description: 'Flat waterfront route',
      distanceKm: 5,
      isPrimary: true,
      gpxXml: null,
      externalRouteUrl: null,
      sortOrder: 0,
    });
    const announcement = await organizerApi.createAnnouncement(eventId, {
      title: 'Welcome',
      body: 'Coffee is hot at Basecamp.',
      isPinned: true,
    });
    const team = await organizerApi.createTeam(eventId, {
      name: 'Frostbite Fighters',
      tagline: null,
      colorHex: '#163A59',
      emoji: '❄️',
      isOpen: true,
      lookingNote: null,
    });
    const runner = await organizerApi.createParticipant(eventId, {
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
    const orgSnap = await organizerApi.getEventSnapshot(eventId);
    const leg = orgSnap.legs[0];
    const supplyWishlist = await organizerApi.createSupplyItem(eventId, {
      category: 'drinks',
      name: 'Hot Cocoa',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });
    const supplyVolunteer = await organizerApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Banana Bread',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: runner.id,
    });
    const supplyClaim = await organizerApi.createSupplyClaim(eventId, {
      supplyItemId: supplyWishlist.id,
      participantId: runner.id,
      note: '2 gallons',
    });
    const chipIn = await organizerApi.createChipIn(eventId, {
      participantId: runner.id,
      amountCents: 2500,
      note: 'Venmo',
    });
    const badgeDef = orgSnap.badgeDefinitions[0];
    const badgeAward = await organizerApi.createBadgeAward(eventId, {
      badgeDefinitionId: badgeDef.id,
      participantId: runner.id,
      teamId: null,
      note: 'Awesome winter hat',
    });

    // Dashboard client: rejects blank and invalid tokens
    const dashboardApi = new InMemoryEventApi(store);
    await expect(dashboardApi.unlockDashboard('')).rejects.toMatchObject({
      code: 'INVALID_DASHBOARD_TOKEN',
    });
    await expect(dashboardApi.unlockDashboard('   ')).rejects.toMatchObject({
      code: 'INVALID_DASHBOARD_TOKEN',
    });
    await expect(dashboardApi.unlockDashboard('wrong-token')).rejects.toMatchObject({
      code: 'INVALID_DASHBOARD_TOKEN',
    });

    // Valid token unlocks strictly 'dashboard' scope
    const unlockedId = await dashboardApi.unlockDashboard('dash-token-secret-2027');
    expect(unlockedId).toBe(eventId);
    expect(await dashboardApi.getSessionGrants(eventId)).toEqual(['dashboard']);

    // Can read full read-only Event snapshot, with zero chip-in disclosure
    const snap = await dashboardApi.getEventSnapshot(eventId);
    expect(snap.event.name).toBe('Winter Grind 50K 2027');
    expect(snap.teams).toHaveLength(1);
    expect(snap.participants).toHaveLength(1);
    expect(snap.badgeAwards).toHaveLength(1);
    expect(snap.chipIns).toEqual([]);
    expect(snap.chipInTotalCents).toBe(0);

    // Chip-in RPCs are forbidden for dashboard scope
    await expect(dashboardApi.getChipInSummary(eventId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(dashboardApi.getChipIns(eventId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    // Every single write method MUST be rejected with FORBIDDEN
    const writeAttempts: Array<Promise<unknown>> = [
      dashboardApi.updateEvent(eventId, { name: 'Hacked Event' }),
      dashboardApi.upsertCourse(eventId, {
        name: 'Rogue 5K',
        description: null,
        distanceKm: 5,
        isPrimary: false,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 1,
      }),
      dashboardApi.deleteCourse(eventId, course.id),
      dashboardApi.createAnnouncement(eventId, { title: 'Hi', body: 'Nope', isPinned: false }),
      dashboardApi.updateAnnouncement(eventId, announcement.id, { body: 'Edited' }),
      dashboardApi.deleteAnnouncement(eventId, announcement.id),
      dashboardApi.createParticipant(eventId, {
        displayName: 'Rogue Runner',
        rsvpStatus: 'going_runner',
        teamId: null,
        availableFromRound: 1,
        availableToRound: 10,
        rough5kMinutes: null,
        isFirst5k: false,
        dietaryNotes: null,
        showTimesOnLeaderboard: false,
      }),
      dashboardApi.updateParticipant(eventId, runner.id, { displayName: 'Edited' }),
      dashboardApi.deleteParticipant(eventId, runner.id),
      dashboardApi.createTeam(eventId, {
        name: 'Rogue Team',
        tagline: null,
        colorHex: null,
        emoji: null,
        isOpen: true,
        lookingNote: null,
      }),
      dashboardApi.updateTeam(eventId, team.id, { name: 'Edited Team' }),
      dashboardApi.deleteTeam(eventId, team.id),
      dashboardApi.leaveTeam(runner.id),
      dashboardApi.updateLeg(eventId, leg.id, { status: 'out_on_course' }),
      dashboardApi.applyLegMutation({
        eventId,
        legId: leg.id,
        mutationId: 'dash-mut-1',
        status: 'out_on_course',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationSeconds: null,
        courseId: course.id,
        externalActivityUrl: null,
        isExplicitRevert: false,
        clientUpdatedAt: new Date().toISOString(),
      }),
      dashboardApi.startRound(eventId, 1, [], new Date().toISOString()),
      dashboardApi.createSupplyItem(eventId, {
        category: 'food',
        name: 'Rogue Wishlist',
        isWishlist: true,
        targetSlots: 1,
        createdByParticipantId: null,
      }),
      dashboardApi.createSupplyItem(eventId, {
        category: 'food',
        name: 'Rogue Volunteer',
        isWishlist: false,
        targetSlots: null,
        createdByParticipantId: runner.id,
      }),
      dashboardApi.updateSupplyItem(eventId, supplyVolunteer.id, { name: 'Edited' }),
      dashboardApi.deleteSupplyItem(eventId, supplyVolunteer.id),
      dashboardApi.createSupplyClaim(eventId, {
        supplyItemId: supplyWishlist.id,
        participantId: runner.id,
        note: null,
      }),
      dashboardApi.deleteSupplyClaim(eventId, supplyClaim.id),
      dashboardApi.createChipIn(eventId, {
        participantId: runner.id,
        amountCents: 1000,
        note: null,
      }),
      dashboardApi.updateChipIn(eventId, chipIn.id, { amountCents: 5000 }),
      dashboardApi.deleteChipIn(eventId, chipIn.id),
      dashboardApi.createBadgeDefinition(eventId, {
        name: 'Rogue Badge',
        emoji: '🚫',
        description: null,
        isPreset: false,
      }),
      dashboardApi.deleteBadgeDefinition(eventId, badgeDef.id),
      dashboardApi.createBadgeAward(eventId, {
        badgeDefinitionId: badgeDef.id,
        participantId: runner.id,
        teamId: null,
        note: null,
      }),
      dashboardApi.deleteBadgeAward(eventId, badgeAward.id),
      dashboardApi.rotateEventSecret(eventId, 'dashboard_token', 'new-token'),
    ];

    for (const attempt of writeAttempts) {
      await expect(attempt).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('defines SHA-256 unlock_dashboard RPC and strictly read-only dashboard RLS policies in 0001_foundation.sql', () => {
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'), 'utf8');

    // unlock_dashboard(p_token text) SECURITY DEFINER hashes with SHA-256 hex, matches dashboard_token_hash, upserts 'dashboard'
    const unlockFnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.unlock_dashboard\(p_token text\)[\s\S]*?\$\$;/,
    );
    expect(unlockFnMatch).not.toBeNull();
    const unlockFn = unlockFnMatch![0];
    expect(unlockFn).toContain('SECURITY DEFINER');
    expect(unlockFn).toContain("encode(digest(p_token, 'sha256'), 'hex')");
    expect(unlockFn).toContain('FROM public.event_secrets');
    expect(unlockFn).toContain('WHERE dashboard_token_hash = v_token_hash');
    expect(unlockFn).toContain("INSERT INTO public.session_grants (auth_uid, event_id, scope)");
    expect(unlockFn).toContain("VALUES (v_auth_uid, v_event_id, 'dashboard')");
    expect(unlockFn).toContain('RETURN v_event_id;');

    // Every policy that references 'dashboard' must ONLY be a FOR SELECT policy
    const policyBlocks = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policyBlocks.length).toBeGreaterThan(20);
    for (const policy of policyBlocks) {
      if (policy.includes("'dashboard'")) {
        expect(policy).toMatch(/\bFOR SELECT\b/);
        expect(policy).not.toMatch(/\bFOR (INSERT|UPDATE|DELETE|ALL)\b/);
        expect(policy).not.toContain('ON public.chip_ins');
        expect(policy).not.toContain('ON public.event_secrets');
      }
    }

    // chip_ins SELECT is strictly organizer-only (never dashboard)
    expect(sql).toMatch(
      /CREATE POLICY chip_ins_select_organizer ON public\.chip_ins\s+FOR SELECT\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    // event_secrets revokes all access from anon/authenticated
    expect(sql).toContain('REVOKE ALL ON public.event_secrets FROM PUBLIC, anon, authenticated;');
  });

  it('calls unlock_dashboard RPC in SupabaseEventApi and surfaces INVALID_DASHBOARD_TOKEN on mismatch', async () => {
    const api = new SupabaseEventApi('https://example.supabase.co', 'anon-key');
    vi.spyOn(api.client.auth, 'getSession').mockResolvedValue({
      data: { session: { user: { id: 'anon-uid-1' } } },
      error: null,
    } as never);

    const rpcSpy = vi
      .spyOn(api.client, 'rpc')
      .mockResolvedValueOnce({ data: 'evt-123', error: null } as never)
      .mockResolvedValueOnce({
        data: null,
        error: { code: '28000', message: 'Invalid dashboard token' },
      } as never);

    const eventId = await api.unlockDashboard('valid-token-xyz');
    expect(eventId).toBe('evt-123');
    expect(rpcSpy).toHaveBeenCalledWith('unlock_dashboard', { p_token: 'valid-token-xyz' });

    await expect(api.unlockDashboard('bad-token')).rejects.toThrow(EventAccessError);
    await expect(
      (async () => {
        rpcSpy.mockResolvedValueOnce({
          data: null,
          error: { code: '28000', message: 'Invalid dashboard token' },
        } as never);
        return api.unlockDashboard('bad-token');
      })(),
    ).rejects.toMatchObject({ code: 'INVALID_DASHBOARD_TOKEN' });
  });
});
