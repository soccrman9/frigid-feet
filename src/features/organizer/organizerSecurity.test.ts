import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
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
    basecampName: 'Lakeside Pavilion',
  });
  return { store, eventId };
}

describe('Organizer RPCs, RLS rejections, secret rotation, and Course URL validation', () => {
  it('unlocks Organizer Mode with valid passcode granting participant + organizer scopes, and returns false on wrong passcode', async () => {
    const { store, eventId } = createFixture();
    const api = new InMemoryEventApi(store);
    await api.ensureSession();

    expect(await api.unlockOrganizer(eventId, 'WRONG-PASSCODE')).toBe(false);
    expect(await api.getSessionGrants(eventId)).toEqual([]);

    expect(await api.unlockOrganizer(eventId, 'HOST-PASS-2027')).toBe(true);
    const grants = await api.getSessionGrants(eventId);
    expect(grants).toEqual(expect.arrayContaining(['participant', 'organizer']));
    expect(grants).toHaveLength(2);
  });

  it('rejects non-Organizer writes to events, courses, announcements, and rotateEventSecret', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-2027');

    const seededCourse = await organizerApi.upsertCourse(eventId, {
      name: 'Boardwalk 5K',
      description: 'Flat waterfront loop',
      distanceKm: 5.0,
      isPrimary: true,
      gpxXml: null,
      externalRouteUrl: 'https://www.strava.com/routes/123',
      sortOrder: 0,
    });
    const seededAnnouncement = await organizerApi.createAnnouncement(eventId, {
      title: 'Coffee ready',
      body: 'Hot kettle at Basecamp.',
      isPinned: true,
    });

    const participantApi = new InMemoryEventApi(store);
    await participantApi.unlockEvent('2027', 'FROST-2027');

    const dashboardApi = new InMemoryEventApi(store);
    await dashboardApi.unlockDashboard('dash-token-2027');

    for (const nonOrgApi of [participantApi, dashboardApi]) {
      await expect(
        nonOrgApi.updateEvent(eventId, { basecampName: 'Unauthorized Basecamp' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        nonOrgApi.upsertCourse(eventId, {
          name: 'Rogue Course',
          description: null,
          distanceKm: 5.0,
          isPrimary: false,
          gpxXml: null,
          externalRouteUrl: null,
          sortOrder: 1,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        nonOrgApi.upsertCourse(eventId, {
          id: seededCourse.id,
          name: 'Tampered Course',
          description: null,
          distanceKm: 5.0,
          isPrimary: true,
          gpxXml: null,
          externalRouteUrl: null,
          sortOrder: 0,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(nonOrgApi.deleteCourse(eventId, seededCourse.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      await expect(
        nonOrgApi.createAnnouncement(eventId, {
          title: 'Unauthorized',
          body: 'Nope',
          isPinned: false,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        nonOrgApi.updateAnnouncement(eventId, seededAnnouncement.id, { isPinned: false }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        nonOrgApi.deleteAnnouncement(eventId, seededAnnouncement.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        nonOrgApi.rotateEventSecret(eventId, 'invite_code', 'HIJACKED'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('revokes other Organizer sessions on organizer_passcode rotation while keeping the calling Organizer active', async () => {
    const { store, eventId } = createFixture();

    const callerOrganizer = new InMemoryEventApi(store);
    const coOrganizer = new InMemoryEventApi(store);

    expect(await callerOrganizer.unlockOrganizer(eventId, 'HOST-PASS-2027')).toBe(true);
    expect(await coOrganizer.unlockOrganizer(eventId, 'HOST-PASS-2027')).toBe(true);

    await callerOrganizer.rotateEventSecret(eventId, 'organizer_passcode', 'NEW-HOST-PASS-2027');

    // Calling Organizer remains active and can still perform Organizer writes
    expect(await callerOrganizer.getSessionGrants(eventId)).toContain('organizer');
    const updated = await callerOrganizer.updateEvent(eventId, {
      recapNote: 'Caller session preserved after rotation.',
    });
    expect(updated.recapNote).toBe('Caller session preserved after rotation.');

    // Other Organizer's organizer grant is revoked (only participant grant remains)
    const coGrants = await coOrganizer.getSessionGrants(eventId);
    expect(coGrants).not.toContain('organizer');
    await expect(
      coOrganizer.updateEvent(eventId, { recapNote: 'Should be blocked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Old passcode no longer unlocks; new passcode unlocks
    expect(await coOrganizer.unlockOrganizer(eventId, 'HOST-PASS-2027')).toBe(false);
    expect(await coOrganizer.unlockOrganizer(eventId, 'NEW-HOST-PASS-2027')).toBe(true);
    expect(await coOrganizer.getSessionGrants(eventId)).toContain('organizer');
  });

  it('revokes Dashboard sessions on dashboard_token rotation and Participant sessions on invite_code rotation', async () => {
    const { store, eventId } = createFixture();

    const organizerApi = new InMemoryEventApi(store);
    const participantApi = new InMemoryEventApi(store);
    const dashboardApi = new InMemoryEventApi(store);

    await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-2027');
    await participantApi.unlockEvent('2027', 'FROST-2027');
    await dashboardApi.unlockDashboard('dash-token-2027');

    // Rotate dashboard_token -> dashboard session revoked; participant & organizer unaffected
    await organizerApi.rotateEventSecret(eventId, 'dashboard_token', 'dash-token-rotated-999');
    await expect(dashboardApi.getEventSnapshot(eventId)).rejects.toThrow(EventAccessError);
    await expect(dashboardApi.unlockDashboard('dash-token-2027')).rejects.toMatchObject({
      code: 'INVALID_DASHBOARD_TOKEN',
    });
    expect(await dashboardApi.unlockDashboard('dash-token-rotated-999')).toBe(eventId);
    expect(await participantApi.getSessionGrants(eventId)).toContain('participant');

    // Rotate invite_code -> participant session revoked; organizer stays active
    await organizerApi.rotateEventSecret(eventId, 'invite_code', 'FROST-ROTATED');
    await expect(participantApi.getEventSnapshot(eventId)).rejects.toThrow(EventAccessError);
    expect(await organizerApi.getSessionGrants(eventId)).toContain('organizer');
    expect((await organizerApi.getEventSnapshot(eventId)).event.id).toBe(eventId);
  });

  it('strictly validates https:// externalRouteUrl on Courses', async () => {
    const { store, eventId } = createFixture();
    const organizerApi = new InMemoryEventApi(store);
    await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-2027');

    const invalidUrls = [
      'http://example.com/route',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://',
      'https://not a valid host/path',
      `https://example.com/${'a'.repeat(490)}`,
    ];

    for (const badUrl of invalidUrls) {
      await expect(
        organizerApi.upsertCourse(eventId, {
          name: 'Unsafe Course',
          description: null,
          distanceKm: 5.0,
          isPrimary: false,
          gpxXml: null,
          externalRouteUrl: badUrl,
          sortOrder: 0,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    const validCourse = await organizerApi.upsertCourse(eventId, {
      name: 'Safe Course',
      description: null,
      distanceKm: 5.0,
      isPrimary: true,
      gpxXml: null,
      externalRouteUrl: 'https://www.strava.com/routes/5050',
      sortOrder: 0,
    });
    expect(validCourse.externalRouteUrl).toBe('https://www.strava.com/routes/5050');
  });

  it('verifies SQL migration enforces unlock_organizer, rotate_event_secret caller preservation, and Organizer-only RLS on events/courses/announcements', () => {
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/0001_foundation.sql'), 'utf8');

    // unlock_organizer grants both participant and organizer, returns boolean
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.unlock_organizer\(p_event_id uuid, p_passcode text\)\s+RETURNS boolean[\s\S]*?SECURITY DEFINER[\s\S]*?\(v_auth_uid, p_event_id, 'participant'\),[\s\S]*?\(v_auth_uid, p_event_id, 'organizer'\)/,
    );

    // rotate_event_secret requires organizer scope and preserves caller on organizer_passcode rotation
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.rotate_event_secret\([\s\S]*?IF NOT public\.has_grant\(p_event_id, ARRAY\['organizer'\]\)[\s\S]*?AND scope = 'organizer'\s+AND auth_uid <> auth\.uid\(\)/,
    );

    // Non-organizer RLS restrictions on events, courses, announcements
    for (const table of ['events', 'courses', 'announcements']) {
      expect(sql).toMatch(
        new RegExp(`CREATE POLICY ${table}_insert_organizer ON public\\.${table}[\\s\\S]*?ARRAY\\['organizer'\\]`),
      );
      expect(sql).toMatch(
        new RegExp(`CREATE POLICY ${table}_update_organizer ON public\\.${table}[\\s\\S]*?ARRAY\\['organizer'\\]`),
      );
      expect(sql).toMatch(
        new RegExp(`CREATE POLICY ${table}_delete_organizer ON public\\.${table}[\\s\\S]*?ARRAY\\['organizer'\\]`),
      );
    }
  });
});
