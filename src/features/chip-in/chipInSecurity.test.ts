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
    organizerPasscode: 'HOST-PASS-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
    venmoHandle: '@wintergrind',
    zelleHandle: 'host@wintergrind.test',
  });
  return { store, eventId };
}

describe('Chip-In RPC aggregation, Organizer CRUD, and server-enforced RLS', () => {
  it('aggregates chip-ins via get_chip_in_summary for participant and organizer scopes while returning zero individual rows or counts to non-Organizers', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-2027');

    const participantApi = new InMemoryEventApi(store);
    await participantApi.unlockEvent('2027', 'FROST-2027');

    const dashboardApi = new InMemoryEventApi(store);
    await dashboardApi.unlockDashboard('dash-token-2027');

    const unauthApi = new InMemoryEventApi(store);

    // Starts at 0 when no chip-ins exist
    expect(await participantApi.getChipInSummary(eventId)).toBe(0);
    expect(await organizerApi.getChipInSummary(eventId)).toBe(0);

    // Denied for dashboard and unauthenticated sessions
    await expect(dashboardApi.getChipInSummary(eventId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(unauthApi.getChipInSummary(eventId)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const maya = await participantApi.createParticipant(eventId, {
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: null,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 29,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    // Organizer records linked + anonymous chip-ins
    await organizerApi.createChipIn(eventId, {
      participantId: maya.id,
      amountCents: 2550,
      note: 'Venmo from Maya',
    });
    await organizerApi.createChipIn(eventId, {
      participantId: null,
      amountCents: 1450,
      note: 'Cash in jar',
    });

    // Aggregate is exact sum (2550 + 1450 = 4000) for both participant and organizer
    expect(await participantApi.getChipInSummary(eventId)).toBe(4000);
    expect(await organizerApi.getChipInSummary(eventId)).toBe(4000);

    // Participant snapshot has aggregate total ONLY — never individual rows
    const participantSnap = await participantApi.getEventSnapshot(eventId);
    expect(participantSnap.chipInTotalCents).toBe(4000);
    expect(participantSnap.chipIns).toEqual([]);

    // Organizer snapshot has both aggregate and full ledger
    const organizerSnap = await organizerApi.getEventSnapshot(eventId);
    expect(organizerSnap.chipInTotalCents).toBe(4000);
    expect(organizerSnap.chipIns).toHaveLength(2);
  });

  it('supports Organizer create, read, update, and delete on chip_ins and validates positive integer amountCents', async () => {
    const { store, eventId } = createFixture();
    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-2027');

    const sam = await organizerApi.createParticipant(eventId, {
      displayName: 'Sam Patel',
      rsvpStatus: 'going_supporter',
      teamId: null,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    // Rejects 0, negative, and non-integer amountCents on create
    for (const badAmount of [0, -100, 12.5, Number.NaN]) {
      await expect(
        organizerApi.createChipIn(eventId, {
          participantId: null,
          amountCents: badAmount,
          note: null,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    const entry = await organizerApi.createChipIn(eventId, {
      participantId: sam.id,
      amountCents: 2000,
      note: 'Zelle',
    });
    expect(entry.participantId).toBe(sam.id);
    expect(entry.amountCents).toBe(2000);
    expect(entry.note).toBe('Zelle');
    expect(entry.recordedAt).toBeTruthy();

    // Rejects invalid amountCents on update
    for (const badAmount of [0, -50, 9.9, Number.NaN]) {
      await expect(
        organizerApi.updateChipIn(eventId, entry.id, { amountCents: badAmount }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    // Valid update (switch to anonymous, update amount & note)
    const updated = await organizerApi.updateChipIn(eventId, entry.id, {
      participantId: null,
      amountCents: 3575,
      note: 'Updated to anonymous',
    });
    expect(updated.participantId).toBeNull();
    expect(updated.amountCents).toBe(3575);
    expect(updated.note).toBe('Updated to anonymous');
    expect(await organizerApi.getChipInSummary(eventId)).toBe(3575);

    // Delete removes row and drops aggregate back to 0
    await organizerApi.deleteChipIn(eventId, entry.id);
    expect(await organizerApi.getChipIns(eventId)).toEqual([]);
    expect(await organizerApi.getChipInSummary(eventId)).toBe(0);
  });

  it('blocks non-Organizer (participant, dashboard, and unauthenticated) sessions from SELECT, INSERT, UPDATE, and DELETE on chip_ins', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-2027');

    const seeded = await organizerApi.createChipIn(eventId, {
      participantId: null,
      amountCents: 5000,
      note: 'Private entry',
    });

    const participantApi = new InMemoryEventApi(store);
    await participantApi.unlockEvent('2027', 'FROST-2027');

    const dashboardApi = new InMemoryEventApi(store);
    await dashboardApi.unlockDashboard('dash-token-2027');

    const unauthApi = new InMemoryEventApi(store);

    for (const nonOrgApi of [participantApi, dashboardApi]) {
      await expect(nonOrgApi.getChipIns(eventId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        nonOrgApi.createChipIn(eventId, {
          participantId: null,
          amountCents: 1000,
          note: 'Unauthorized insert',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        nonOrgApi.updateChipIn(eventId, seeded.id, { amountCents: 9999 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(nonOrgApi.deleteChipIn(eventId, seeded.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }

    await expect(unauthApi.getChipIns(eventId)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      unauthApi.createChipIn(eventId, { participantId: null, amountCents: 1000, note: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      unauthApi.updateChipIn(eventId, seeded.id, { amountCents: 9999 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(unauthApi.deleteChipIn(eventId, seeded.id)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    // Original row remains intact
    const rows = await organizerApi.getChipIns(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(5000);
  });

  it('surfaces FORBIDDEN or zero-row RLS filtering in SupabaseEventApi when Postgres RLS blocks chip_ins SELECT, INSERT, UPDATE, DELETE, or get_chip_in_summary RPC', async () => {
    const api = new SupabaseEventApi('https://example.supabase.co', 'anon-key');

    // Mock SELECT filtered to 0 rows by Postgres RLS USING for non-Organizers
    const selectOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const selectEq = vi.fn().mockReturnValue({ order: selectOrder });
    const selectFn = vi.fn().mockReturnValue({ eq: selectEq });

    // Mock INSERT rejected by Postgres RLS (42501)
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "chip_ins"',
      },
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

    // Mock UPDATE filtered out by Postgres RLS USING (PGRST116 0 rows)
    const updateSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'The result contains 0 rows' },
    });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEqId = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEqEvent = vi.fn().mockReturnValue({ eq: updateEqId });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqEvent });

    // Mock DELETE filtered out by Postgres RLS USING (returns 0 rows)
    const deleteSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const deleteEqId = vi.fn().mockReturnValue({ select: deleteSelect });
    const deleteEqEvent = vi.fn().mockReturnValue({ eq: deleteEqId });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqEvent });

    vi.spyOn(api.client, 'from').mockReturnValue({
      select: selectFn,
      insert: insertFn,
      update: updateFn,
      delete: deleteFn,
    } as never);

    vi.spyOn(api.client, 'rpc').mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Event access required' },
    } as never);

    await expect(api.getChipInSummary('evt-1')).rejects.toThrow(EventAccessError);
    await expect(api.getChipInSummary('evt-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(api.getChipIns('evt-1')).resolves.toEqual([]);

    await expect(
      api.createChipIn('evt-1', { participantId: null, amountCents: 1500, note: 'Blocked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      api.updateChipIn('evt-1', 'chip-1', { amountCents: 2000 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(api.deleteChipIn('evt-1', 'chip-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('verifies 0001_foundation.sql enforces Organizer-only RLS on chip_ins and aggregate-only SECURITY DEFINER get_chip_in_summary', () => {
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'), 'utf8');

    // RLS enabled on chip_ins
    expect(sql).toMatch(/ALTER TABLE public\.chip_ins ENABLE ROW LEVEL SECURITY;/);

    // Strictly Organizer-only policies on SELECT, INSERT, UPDATE, DELETE
    expect(sql).toMatch(
      /CREATE POLICY chip_ins_select_organizer ON public\.chip_ins\s+FOR SELECT\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY chip_ins_insert_organizer ON public\.chip_ins\s+FOR INSERT\s+WITH CHECK \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY chip_ins_update_organizer ON public\.chip_ins\s+FOR UPDATE\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\)\s+WITH CHECK \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY chip_ins_delete_organizer ON public\.chip_ins\s+FOR DELETE\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );

    // get_chip_in_summary SECURITY DEFINER RPC checks participant/organizer and returns ONLY COALESCE(SUM(amount_cents), 0)
    const rpcMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.get_chip_in_summary\(p_event_id uuid\)[\s\S]*?\$\$;/,
    );
    expect(rpcMatch).not.toBeNull();
    const rpcBody = rpcMatch![0];
    expect(rpcBody).toContain('RETURNS int');
    expect(rpcBody).toContain('SECURITY DEFINER');
    expect(rpcBody).toContain("public.has_grant(p_event_id, ARRAY['participant', 'organizer'])");
    expect(rpcBody).toContain('COALESCE(SUM(amount_cents), 0)');
    expect(rpcBody).not.toMatch(/COUNT\s*\(/i);

    // chip_ins is intentionally excluded from supabase_realtime publication
    const pubMatch = sql.match(/v_tables text\[\] := ARRAY\[[\s\S]*?\];/);
    expect(pubMatch).not.toBeNull();
    expect(pubMatch![0]).not.toContain("'chip_ins'");
  });
});
