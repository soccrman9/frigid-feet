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

describe('Badge RLS enforcement, 5 presets, and recipient XOR constraint', () => {
  it('enforces Organizer-only writes on badge_definitions & badge_awards, allows Participant/Dashboard reads, enforces XOR, and cascades award deletes', async () => {
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

    const team = await participantApi.createTeam(eventId, {
      name: 'Frostbite Fighters',
      tagline: null,
      colorHex: '#163A59',
      emoji: '❄️',
      isOpen: true,
      lookingNote: null,
    });

    const maya = await participantApi.createParticipant(eventId, {
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 30,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    // All 5 pre-seeded presets are readable by Participant and Dashboard
    const partSnap = await participantApi.getEventSnapshot(eventId);
    expect(partSnap.badgeDefinitions.filter((b) => b.isPreset).map((b) => b.name)).toEqual([
      'Best Cold-Weather Outfit',
      'Cheer Squad MVP',
      'Best Snack Contributor',
      'Most Encouraging',
      'Best Vibes at Basecamp',
    ]);
    const dashSnap = await dashboardApi.getEventSnapshot(eventId);
    expect(dashSnap.badgeDefinitions).toHaveLength(5);

    const preset = partSnap.badgeDefinitions[0];

    // Non-Organizer (Participant & Dashboard) writes are strictly FORBIDDEN
    await expect(
      participantApi.createBadgeDefinition(eventId, {
        name: 'Rogue Badge',
        emoji: '😈',
        description: null,
        isPreset: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      participantApi.deleteBadgeDefinition(eventId, preset.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      participantApi.createBadgeAward(eventId, {
        badgeDefinitionId: preset.id,
        participantId: maya.id,
        teamId: null,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      dashboardApi.createBadgeAward(eventId, {
        badgeDefinitionId: preset.id,
        participantId: maya.id,
        teamId: null,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Organizer cannot create custom Badge with blank name or emoji
    await expect(
      organizerApi.createBadgeDefinition(eventId, {
        name: '   ',
        emoji: '🎉',
        description: null,
        isPreset: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      organizerApi.createBadgeDefinition(eventId, {
        name: 'Best High-Five',
        emoji: '  ',
        description: null,
        isPreset: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Organizer creates custom Badge definition
    const customBadge = await organizerApi.createBadgeDefinition(eventId, {
      name: 'Frostiest Beard',
      emoji: '🧊',
      description: 'Maximum icicle accumulation on the Course.',
      isPreset: false,
    });

    // Strict XOR recipient constraint: both set -> VALIDATION_ERROR, neither set -> VALIDATION_ERROR
    await expect(
      organizerApi.createBadgeAward(eventId, {
        badgeDefinitionId: customBadge.id,
        participantId: maya.id,
        teamId: team.id,
        note: 'Both set',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      organizerApi.createBadgeAward(eventId, {
        badgeDefinitionId: customBadge.id,
        participantId: null,
        teamId: null,
        note: 'Neither set',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Valid Participant award & valid Team award
    const participantAward = await organizerApi.createBadgeAward(eventId, {
      badgeDefinitionId: preset.id,
      participantId: maya.id,
      teamId: null,
      note: 'Neon windbreaker legend',
    });
    const teamAward = await organizerApi.createBadgeAward(eventId, {
      badgeDefinitionId: customBadge.id,
      participantId: null,
      teamId: team.id,
      note: 'Whole team frosted over!',
    });

    // Non-Organizer cannot revoke awards
    await expect(
      participantApi.deleteBadgeAward(eventId, participantAward.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Participant & Dashboard see both awards
    const afterAwardSnap = await dashboardApi.getEventSnapshot(eventId);
    expect(afterAwardSnap.badgeAwards).toHaveLength(2);

    // Deleting custom badge definition cascades delete to its badge_awards
    await organizerApi.deleteBadgeDefinition(eventId, customBadge.id);
    const afterCascadeSnap = await organizerApi.getEventSnapshot(eventId);
    expect(afterCascadeSnap.badgeAwards.map((a) => a.id)).toEqual([participantAward.id]);
    expect(afterCascadeSnap.badgeAwards.find((a) => a.id === teamAward.id)).toBeUndefined();

    // Organizer revokes remaining award
    await organizerApi.deleteBadgeAward(eventId, participantAward.id);
    const finalSnap = await participantApi.getEventSnapshot(eventId);
    expect(finalSnap.badgeAwards).toHaveLength(0);
  });

  it('defines Organizer-only Postgres RLS policies, XOR CHECK constraint, and 5 pre-seeded presets in 0001_foundation.sql', () => {
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'), 'utf8');

    expect(sql).toMatch(/ALTER TABLE public\.badge_definitions ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/ALTER TABLE public\.badge_awards ENABLE ROW LEVEL SECURITY;/);

    // Strict XOR CHECK constraint on badge_awards
    expect(sql).toMatch(
      /CHECK \(\(participant_id IS NOT NULL\) <> \(team_id IS NOT NULL\)\)/,
    );

    // Organizer-only INSERT / UPDATE / DELETE on badge_definitions
    expect(sql).toMatch(
      /CREATE POLICY badge_definitions_insert_organizer ON public\.badge_definitions\s+FOR INSERT\s+WITH CHECK \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY badge_definitions_update_organizer ON public\.badge_definitions\s+FOR UPDATE\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\)\s+WITH CHECK \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY badge_definitions_delete_organizer ON public\.badge_definitions\s+FOR DELETE\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );

    // Organizer-only INSERT / UPDATE / DELETE on badge_awards
    expect(sql).toMatch(
      /CREATE POLICY badge_awards_insert_organizer ON public\.badge_awards\s+FOR INSERT\s+WITH CHECK \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY badge_awards_update_organizer ON public\.badge_awards\s+FOR UPDATE\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\)\s+WITH CHECK \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );
    expect(sql).toMatch(
      /CREATE POLICY badge_awards_delete_organizer ON public\.badge_awards\s+FOR DELETE\s+USING \(public\.has_grant\(event_id, ARRAY\['organizer'\]\)\);/m,
    );

    // 5 pre-seeded presets in create_event
    for (const presetName of [
      'Best Cold-Weather Outfit',
      'Cheer Squad MVP',
      'Best Snack Contributor',
      'Most Encouraging',
      'Best Vibes at Basecamp',
    ]) {
      expect(sql).toContain(presetName);
    }
  });

  it('surfaces FORBIDDEN on RLS rejections and VALIDATION_ERROR on XOR violations in SupabaseEventApi', async () => {
    const api = new SupabaseEventApi('https://example.supabase.co', 'anon-key');

    // Client-side XOR guard rejects invalid recipient combinations immediately
    await expect(
      api.createBadgeAward('evt-1', {
        badgeDefinitionId: 'def-1',
        participantId: 'p-1',
        teamId: 't-1',
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      api.createBadgeAward('evt-1', {
        badgeDefinitionId: 'def-1',
        participantId: null,
        teamId: null,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Mock RLS rejection on INSERT (42501) and 0-row filtered DELETE (RLS USING)
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "badge_awards"',
      },
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

    const deleteSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const deleteEqId = vi.fn().mockReturnValue({ select: deleteSelect });
    const deleteEqEvent = vi.fn().mockReturnValue({ eq: deleteEqId });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqEvent });

    vi.spyOn(api.client, 'from').mockReturnValue({
      insert: insertFn,
      delete: deleteFn,
    } as never);

    await expect(
      api.createBadgeDefinition('evt-1', {
        name: 'Blocked',
        emoji: '🚫',
        description: null,
        isPreset: false,
      }),
    ).rejects.toThrow(EventAccessError);

    await expect(
      api.createBadgeAward('evt-1', {
        badgeDefinitionId: 'def-1',
        participantId: 'p-1',
        teamId: null,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(api.deleteBadgeDefinition('evt-1', 'def-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await expect(api.deleteBadgeAward('evt-1', 'award-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
