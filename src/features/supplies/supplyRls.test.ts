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
    dashboardToken: 'dash-token-2027',
    isActive: true,
  });

  return { store, eventId };
}

describe('Supplies RLS enforcement & wish-list protection', () => {
  it('rejects all non-Organizer mutations to is_wishlist = true rows while permitting volunteered Supplies and claims', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.ensureSession();
    await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

    const participantApi = new InMemoryEventApi(store);
    await participantApi.ensureSession();
    await participantApi.unlockEvent('2027', 'FROST-2027');

    const dashboardApi = new InMemoryEventApi(store);
    await dashboardApi.ensureSession();
    await dashboardApi.unlockDashboard('dash-token-2027');

    const maya = await participantApi.createParticipant(eventId, {
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: null,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    // Organizer creates a wish-list item
    const wishlistItem = await organizerApi.createSupplyItem(eventId, {
      category: 'drinks',
      name: 'Hot Cocoa Thermos',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });

    // Non-Organizer INSERT with isWishlist = true -> FORBIDDEN
    await expect(
      participantApi.createSupplyItem(eventId, {
        category: 'food',
        name: 'Sneaky Wishlist Item',
        isWishlist: true,
        targetSlots: 1,
        createdByParticipantId: maya.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Non-Organizer UPDATE on existing isWishlist = true row -> FORBIDDEN
    await expect(
      participantApi.updateSupplyItem(eventId, wishlistItem.id, {
        name: 'Renamed Wishlist',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Non-Organizer UPDATE attempting to demote isWishlist = true -> false -> FORBIDDEN
    await expect(
      participantApi.updateSupplyItem(eventId, wishlistItem.id, {
        isWishlist: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Non-Organizer DELETE on isWishlist = true row -> FORBIDDEN
    await expect(
      participantApi.deleteSupplyItem(eventId, wishlistItem.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Non-Organizer volunteered Supply CRUD succeeds, EXCEPT promoting isWishlist: false -> true
    const volunteered = await participantApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Banana Bread',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: maya.id,
    });

    await expect(
      participantApi.updateSupplyItem(eventId, volunteered.id, {
        isWishlist: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updatedVolunteered = await participantApi.updateSupplyItem(eventId, volunteered.id, {
      name: 'Walnut Banana Bread',
      category: 'food',
    });
    expect(updatedVolunteered.name).toBe('Walnut Banana Bread');

    // Non-Organizer can claim & unclaim a wish-list Supply
    const claim = await participantApi.createSupplyClaim(eventId, {
      supplyItemId: wishlistItem.id,
      participantId: maya.id,
      note: 'Bringing marshmallows too',
    });
    expect(claim.supplyItemId).toBe(wishlistItem.id);
    await participantApi.deleteSupplyClaim(eventId, claim.id);

    // Non-Organizer can delete volunteered Supply
    await participantApi.deleteSupplyItem(eventId, volunteered.id);

    // Dashboard scope is read-only
    await expect(
      dashboardApi.createSupplyItem(eventId, {
        category: 'food',
        name: 'Read Only Attempt',
        isWishlist: false,
        targetSlots: null,
        createdByParticipantId: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      dashboardApi.createSupplyClaim(eventId, {
        supplyItemId: wishlistItem.id,
        participantId: maya.id,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Organizer can update and delete wish-list Supply
    const updatedWishlist = await organizerApi.updateSupplyItem(eventId, wishlistItem.id, {
      targetSlots: 3,
    });
    expect(updatedWishlist.targetSlots).toBe(3);
    await organizerApi.deleteSupplyItem(eventId, wishlistItem.id);
  });

  it('defines Postgres RLS policies in 0001_foundation.sql rejecting non-Organizer INSERT, UPDATE, and DELETE on is_wishlist = true rows', () => {
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'), 'utf8');

    expect(sql).toMatch(/ALTER TABLE public\.supply_items ENABLE ROW LEVEL SECURITY;/);

    // INSERT policy: organizer OR (participant AND is_wishlist = false)
    expect(sql).toMatch(
      /CREATE POLICY supply_items_insert ON public\.supply_items\s+FOR INSERT\s+WITH CHECK \(\s*public\.has_grant\(event_id, ARRAY\['organizer'\]\)\s+OR \(public\.has_grant\(event_id, ARRAY\['participant'\]\) AND is_wishlist = false\)\s*\);/m,
    );

    // UPDATE policy: BOTH USING and WITH CHECK enforce organizer OR (participant AND is_wishlist = false)
    expect(sql).toMatch(
      /CREATE POLICY supply_items_update ON public\.supply_items\s+FOR UPDATE\s+USING \(\s*public\.has_grant\(event_id, ARRAY\['organizer'\]\)\s+OR \(public\.has_grant\(event_id, ARRAY\['participant'\]\) AND is_wishlist = false\)\s*\)\s+WITH CHECK \(\s*public\.has_grant\(event_id, ARRAY\['organizer'\]\)\s+OR \(public\.has_grant\(event_id, ARRAY\['participant'\]\) AND is_wishlist = false\)\s*\);/m,
    );

    // DELETE policy: organizer OR (participant AND is_wishlist = false)
    expect(sql).toMatch(
      /CREATE POLICY supply_items_delete ON public\.supply_items\s+FOR DELETE\s+USING \(\s*public\.has_grant\(event_id, ARRAY\['organizer'\]\)\s+OR \(public\.has_grant\(event_id, ARRAY\['participant'\]\) AND is_wishlist = false\)\s*\);/m,
    );
  });

  it('surfaces FORBIDDEN in SupabaseEventApi when Postgres RLS rejects INSERT, UPDATE, or DELETE on wish-list supply_items', async () => {
    const api = new SupabaseEventApi('https://example.supabase.co', 'anon-key');

    // Mock INSERT rejected by Postgres RLS (code 42501)
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "supply_items"',
      },
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

    // Mock DELETE filtered out by Postgres RLS USING (returns 0 rows with error: null)
    const deleteSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const deleteEqId = vi.fn().mockReturnValue({ select: deleteSelect });
    const deleteEqEvent = vi.fn().mockReturnValue({ eq: deleteEqId });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqEvent });

    // Mock UPDATE filtered out by Postgres RLS USING (PGRST116 0 rows returned)
    const updateSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'The result contains 0 rows' },
    });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEqId = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEqEvent = vi.fn().mockReturnValue({ eq: updateEqId });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqEvent });

    vi.spyOn(api.client, 'from').mockReturnValue({
      insert: insertFn,
      update: updateFn,
      delete: deleteFn,
    } as never);

    await expect(
      api.createSupplyItem('evt-1', {
        category: 'food',
        name: 'Blocked Wishlist',
        isWishlist: true,
        targetSlots: 2,
        createdByParticipantId: null,
      }),
    ).rejects.toThrow(EventAccessError);

    await expect(
      api.createSupplyItem('evt-1', {
        category: 'food',
        name: 'Blocked Wishlist',
        isWishlist: true,
        targetSlots: 2,
        createdByParticipantId: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      api.updateSupplyItem('evt-1', 'item-wishlist-1', { name: 'Tampered' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(api.deleteSupplyItem('evt-1', 'item-wishlist-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
