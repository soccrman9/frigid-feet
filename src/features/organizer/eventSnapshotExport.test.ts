import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import {
  SNAPSHOT_EXPORT_TABLES,
  buildSnapshotFilename,
  escapeCsvCell,
  serializeEventSnapshotCsv,
  serializeEventSnapshotJson,
} from './eventSnapshotExport';

async function createRichSnapshotFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K, "2027" Edition',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-INVITE-SECRET',
    organizerPasscode: 'HOST-PASS-SECRET',
    dashboardToken: 'DASH-TOKEN-SECRET',
    isActive: true,
    basecampName: 'Lakeside Pavilion, North',
    basecampAddress: '100 Basecamp Trail\nFrost Harbor, VT',
    coldWeatherTips: 'Bring "extra" socks, hand warmers,\nand a thermos.',
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
    chipInBreakdown: [
      { label: 'Pavilion, heated', amountCents: 20000 },
      { label: 'Cocoa "bar"', amountCents: 10000 },
    ],
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.unlockOrganizer(eventId, 'HOST-PASS-SECRET');

  const course = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: 'Flat, scenic "lakefront" loop\nStarts at Basecamp',
    distanceKm: 5.0,
    isPrimary: true,
    gpxXml: '<gpx version="1.1">\n  <trk><name>Boardwalk</name></trk>\n</gpx>',
    externalRouteUrl: 'https://www.strava.com/routes/12345',
    sortOrder: 0,
  });

  await organizerApi.createAnnouncement(eventId, {
    title: 'Coffee, Tea & "Hot" Cider',
    body: 'Line 1: Kettle is on.\nLine 2: Grab a mug!',
    isPinned: true,
  });

  const team = await organizerApi.createTeam(eventId, {
    name: 'Frostbite, Inc.',
    tagline: 'Run "fast", stay warm',
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const runner = await organizerApi.createParticipant(eventId, {
    displayName: 'Maya "Speedy" Chen',
    rsvpStatus: 'going_runner',
    teamId: team.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 27,
    isFirst5k: false,
    dietaryNotes: 'Gluten-free, no peanuts',
    showTimesOnLeaderboard: false,
  });

  const initialSnap = await organizerApi.getEventSnapshot(eventId);
  const leg1 = initialSnap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
  await organizerApi.updateLeg(eventId, leg1.id, {
    runnerId: runner.id,
    courseId: course.id,
    status: 'completed',
    startedAt: '2027-01-09T13:00:00.000Z',
    finishedAt: '2027-01-09T13:27:00.000Z',
    durationSeconds: 1620,
  });

  const soup = await organizerApi.createSupplyItem(eventId, {
    category: 'food',
    name: 'Crockpot Soup, "Chili"',
    isWishlist: true,
    targetSlots: 2,
    createdByParticipantId: null,
  });

  await organizerApi.createSupplyClaim(eventId, {
    supplyItemId: soup.id,
    participantId: runner.id,
    note: 'Vegetarian, mild\nServes 8',
  });

  await organizerApi.createChipIn(eventId, {
    participantId: runner.id,
    amountCents: 2000,
    note: 'Venmo, "thanks!"',
  });

  const badgeDef = initialSnap.badgeDefinitions[0];
  await organizerApi.createBadgeAward(eventId, {
    badgeDefinitionId: badgeDef.id,
    participantId: runner.id,
    teamId: null,
    note: 'Best fleece, "iconic"\nRound 1',
  });

  const snapshot = await organizerApi.getEventSnapshot(eventId);
  return { store, organizerApi, eventId, snapshot };
}

describe('eventSnapshotExport — JSON serialization & secret exclusion', () => {
  it('serializes all 12 standard RLS-protected tables into valid UTF-8 JSON and never includes event_secrets or secret hashes', async () => {
    const { snapshot } = await createRichSnapshotFixture();

    // Simulate hostile/accidental extra secret properties attached to the snapshot object
    const pollutedSnapshot = Object.assign({}, snapshot, {
      event_secrets: {
        invite_code_hash: 'bcrypt$invite',
        organizer_passcode_hash: 'bcrypt$organizer',
        dashboard_token_hash: 'sha256$dashboard',
      },
      event: Object.assign({}, snapshot.event, {
        invite_code_hash: 'bcrypt$invite',
        organizer_passcode_hash: 'bcrypt$organizer',
        dashboard_token_hash: 'sha256$dashboard',
        inviteCodeHash: 'bcrypt$invite',
        organizerPasscodeHash: 'bcrypt$organizer',
        dashboardTokenHash: 'sha256$dashboard',
      }),
    });

    const jsonText = serializeEventSnapshotJson(pollutedSnapshot, '2027-01-09T18:00:00.000Z');
    const parsed = JSON.parse(jsonText) as {
      schema_version: number;
      exported_at: string;
      event_id: string;
      event_slug: string;
      tables: Record<string, unknown[]>;
    };

    expect(parsed.schema_version).toBe(1);
    expect(parsed.exported_at).toBe('2027-01-09T18:00:00.000Z');
    expect(parsed.event_id).toBe(snapshot.event.id);
    expect(parsed.event_slug).toBe('2027');

    // Exact 12 RLS-protected tables
    expect(Object.keys(parsed.tables)).toEqual([
      'events',
      'courses',
      'announcements',
      'rounds',
      'teams',
      'participants',
      'legs',
      'supply_items',
      'supply_claims',
      'chip_ins',
      'badge_definitions',
      'badge_awards',
    ]);
    expect(SNAPSHOT_EXPORT_TABLES).toHaveLength(12);

    // Populated records are present including chip_ins and unicode emoji
    expect(parsed.tables.events).toHaveLength(1);
    expect(parsed.tables.courses).toHaveLength(1);
    expect(parsed.tables.announcements).toHaveLength(1);
    expect(parsed.tables.rounds).toHaveLength(10);
    expect(parsed.tables.teams).toHaveLength(1);
    expect(parsed.tables.participants).toHaveLength(1);
    expect(parsed.tables.legs).toHaveLength(10);
    expect(parsed.tables.supply_items).toHaveLength(1);
    expect(parsed.tables.supply_claims).toHaveLength(1);
    expect(parsed.tables.chip_ins).toHaveLength(1);
    expect(parsed.tables.badge_definitions).toHaveLength(5);
    expect(parsed.tables.badge_awards).toHaveLength(1);

    // Explicitly verify UTF-8 preservation
    expect(jsonText).toContain('❄️');

    // Explicitly verify NO event_secrets or secret hash/plaintext fields appear anywhere
    const forbiddenSubstrings = [
      'event_secrets',
      'invite_code_hash',
      'organizer_passcode_hash',
      'dashboard_token_hash',
      'inviteCodeHash',
      'organizerPasscodeHash',
      'dashboardTokenHash',
      'FROST-INVITE-SECRET',
      'HOST-PASS-SECRET',
      'DASH-TOKEN-SECRET',
      'bcrypt$invite',
      'bcrypt$organizer',
      'sha256$dashboard',
    ];
    for (const forbidden of forbiddenSubstrings) {
      expect(jsonText).not.toContain(forbidden);
    }
  });
});

describe('eventSnapshotExport — CSV RFC 4180 escaping & serialization', () => {
  it('escapes commas, double quotes, LF/CRLF newlines, nullish values, and JSON objects per RFC 4180', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
    expect(escapeCsvCell('mix, "quoted"\nmultiline')).toBe('"mix, ""quoted""\nmultiline"');
    expect(escapeCsvCell([{ label: 'Hot "cocoa"', amountCents: 500 }])).toBe(
      '"[{""label"":""Hot \\""cocoa\\"""",""amountCents"":500}]"',
    );
  });

  it('produces valid RFC 4180 CSV across all 12 tables with round-trippable commas, quotes, and newlines, and zero secret leakage', async () => {
    const { snapshot } = await createRichSnapshotFixture();

    const csvText = serializeEventSnapshotCsv(snapshot, '2027-01-09T18:00:00.000Z');

    // Parse with an independent RFC 4180 parser to verify structural round-trip
    const rows = parseCsvRfc4180(csvText);

    // Every one of the 12 tables has a `table,<name>` section marker
    const tableMarkers = rows
      .filter((r) => r.length === 2 && r[0] === 'table')
      .map((r) => r[1]);
    expect(tableMarkers).toEqual([
      'events',
      'courses',
      'announcements',
      'rounds',
      'teams',
      'participants',
      'legs',
      'supply_items',
      'supply_claims',
      'chip_ins',
      'badge_definitions',
      'badge_awards',
    ]);

    // Verify tricky values (commas, quotes, newlines) round-trip cleanly!
    const eventSectionIndex = rows.findIndex((r) => r[0] === 'table' && r[1] === 'events');
    const eventHeader = rows[eventSectionIndex + 1];
    const eventRow = rows[eventSectionIndex + 2];
    expect(eventRow[eventHeader.indexOf('name')]).toBe('Winter Grind 50K, "2027" Edition');
    expect(eventRow[eventHeader.indexOf('basecamp_address')]).toBe(
      '100 Basecamp Trail\nFrost Harbor, VT',
    );
    expect(eventRow[eventHeader.indexOf('cold_weather_tips')]).toBe(
      'Bring "extra" socks, hand warmers,\nand a thermos.',
    );

    const chipInSectionIndex = rows.findIndex((r) => r[0] === 'table' && r[1] === 'chip_ins');
    const chipInHeader = rows[chipInSectionIndex + 1];
    const chipInRow = rows[chipInSectionIndex + 2];
    expect(chipInRow[chipInHeader.indexOf('amount_cents')]).toBe('2000');
    expect(chipInRow[chipInHeader.indexOf('note')]).toBe('Venmo, "thanks!"');

    const claimSectionIndex = rows.findIndex((r) => r[0] === 'table' && r[1] === 'supply_claims');
    const claimHeader = rows[claimSectionIndex + 1];
    const claimRow = rows[claimSectionIndex + 2];
    expect(claimRow[claimHeader.indexOf('note')]).toBe('Vegetarian, mild\nServes 8');

    // Never leaks secrets
    expect(csvText).not.toContain('event_secrets');
    expect(csvText).not.toContain('invite_code_hash');
    expect(csvText).not.toContain('organizer_passcode_hash');
    expect(csvText).not.toContain('dashboard_token_hash');
    expect(csvText).not.toContain('FROST-INVITE-SECRET');
    expect(csvText).not.toContain('HOST-PASS-SECRET');
    expect(csvText).not.toContain('DASH-TOKEN-SECRET');
  });

  it('builds clean sanitized snapshot filenames with date stamp', () => {
    expect(buildSnapshotFilename('2027', 'json', '2027-01-09T18:00:00.000Z')).toBe(
      'winter-grind-2027-snapshot-2027-01-09.json',
    );
    expect(buildSnapshotFilename('Winter 2027 / Test!', 'csv', '2027-01-09T18:00:00.000Z')).toBe(
      'winter-grind-winter-2027-test-snapshot-2027-01-09.csv',
    );
  });
});

/**
 * Independent RFC 4180 CSV parser used strictly as a test oracle to verify
 * quoted fields containing commas, escaped double quotes (""), and embedded newlines.
 */
function parseCsvRfc4180(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' && input[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 2;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
