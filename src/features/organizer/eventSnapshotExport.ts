import type {
  Announcement,
  BadgeAward,
  BadgeDefinition,
  ChipIn,
  Course,
  EventRecord,
  EventSnapshot,
  Leg,
  Participant,
  Round,
  SupplyClaim,
  SupplyItem,
  Team,
} from '../../types/domain';

/**
 * The 12 standard RLS-protected Event tables included in Event Snapshot backups.
 * Explicitly excludes `event_secrets` and `session_grants`.
 */
export const SNAPSHOT_EXPORT_TABLES = [
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
] as const;

export type SnapshotExportTable = (typeof SNAPSHOT_EXPORT_TABLES)[number];

type ExportRow = Record<string, unknown>;

export interface EventSnapshotExportPayload {
  schema_version: 1;
  exported_at: string;
  event_id: string;
  event_slug: string;
  tables: Record<SnapshotExportTable, ExportRow[]>;
}

const TABLE_COLUMNS: Record<SnapshotExportTable, readonly string[]> = {
  events: [
    'id',
    'slug',
    'name',
    'event_date',
    'start_time',
    'timezone',
    'is_active',
    'basecamp_name',
    'basecamp_address',
    'basecamp_maps_url',
    'parking_amenities_notes',
    'cold_weather_tips',
    'safety_first_aid_notes',
    'strava_club_url',
    'recap_note',
    'chip_in_target_cents',
    'chip_in_suggested_cents',
    'chip_in_breakdown',
    'venmo_handle',
    'zelle_handle',
    'created_at',
  ],
  courses: [
    'id',
    'event_id',
    'name',
    'description',
    'distance_km',
    'is_primary',
    'gpx_xml',
    'external_route_url',
    'sort_order',
  ],
  announcements: ['id', 'event_id', 'title', 'body', 'is_pinned', 'created_at'],
  rounds: ['id', 'event_id', 'round_number', 'scheduled_start_at', 'started_at'],
  teams: [
    'id',
    'event_id',
    'name',
    'tagline',
    'color_hex',
    'emoji',
    'is_open',
    'looking_note',
    'created_at',
  ],
  participants: [
    'id',
    'event_id',
    'display_name',
    'rsvp_status',
    'team_id',
    'available_from_round',
    'available_to_round',
    'rough_5k_minutes',
    'is_first_5k',
    'dietary_notes',
    'show_times_on_leaderboard',
    'created_at',
  ],
  legs: [
    'id',
    'event_id',
    'team_id',
    'round_number',
    'runner_id',
    'course_id',
    'status',
    'started_at',
    'finished_at',
    'duration_seconds',
    'external_activity_url',
    'client_updated_at',
    'last_mutation_id',
    'updated_by_organizer',
  ],
  supply_items: [
    'id',
    'event_id',
    'category',
    'name',
    'is_wishlist',
    'target_slots',
    'created_by_participant_id',
    'created_at',
  ],
  supply_claims: ['id', 'event_id', 'supply_item_id', 'participant_id', 'note', 'created_at'],
  chip_ins: ['id', 'event_id', 'participant_id', 'amount_cents', 'note', 'recorded_at'],
  badge_definitions: ['id', 'event_id', 'name', 'emoji', 'description', 'is_preset'],
  badge_awards: [
    'id',
    'event_id',
    'badge_definition_id',
    'participant_id',
    'team_id',
    'note',
    'awarded_at',
  ],
};

function projectEvent(event: EventRecord): ExportRow {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    event_date: event.eventDate,
    start_time: event.startTime,
    timezone: event.timezone,
    is_active: event.isActive,
    basecamp_name: event.basecampName,
    basecamp_address: event.basecampAddress,
    basecamp_maps_url: event.basecampMapsUrl,
    parking_amenities_notes: event.parkingAmenitiesNotes,
    cold_weather_tips: event.coldWeatherTips,
    safety_first_aid_notes: event.safetyFirstAidNotes,
    strava_club_url: event.stravaClubUrl,
    recap_note: event.recapNote,
    chip_in_target_cents: event.chipInTargetCents,
    chip_in_suggested_cents: event.chipInSuggestedCents,
    chip_in_breakdown: event.chipInBreakdown.map((item) => ({
      label: item.label,
      amount_cents: item.amountCents,
    })),
    venmo_handle: event.venmoHandle,
    zelle_handle: event.zelleHandle,
    created_at: event.createdAt,
  };
}

function projectCourse(course: Course): ExportRow {
  return {
    id: course.id,
    event_id: course.eventId,
    name: course.name,
    description: course.description,
    distance_km: course.distanceKm,
    is_primary: course.isPrimary,
    gpx_xml: course.gpxXml,
    external_route_url: course.externalRouteUrl,
    sort_order: course.sortOrder,
  };
}

function projectAnnouncement(announcement: Announcement): ExportRow {
  return {
    id: announcement.id,
    event_id: announcement.eventId,
    title: announcement.title,
    body: announcement.body,
    is_pinned: announcement.isPinned,
    created_at: announcement.createdAt,
  };
}

function projectRound(round: Round): ExportRow {
  return {
    id: round.id,
    event_id: round.eventId,
    round_number: round.roundNumber,
    scheduled_start_at: round.scheduledStartAt,
    started_at: round.startedAt,
  };
}

function projectTeam(team: Team): ExportRow {
  return {
    id: team.id,
    event_id: team.eventId,
    name: team.name,
    tagline: team.tagline,
    color_hex: team.colorHex,
    emoji: team.emoji,
    is_open: team.isOpen,
    looking_note: team.lookingNote,
    created_at: team.createdAt,
  };
}

function projectParticipant(participant: Participant): ExportRow {
  return {
    id: participant.id,
    event_id: participant.eventId,
    display_name: participant.displayName,
    rsvp_status: participant.rsvpStatus,
    team_id: participant.teamId,
    available_from_round: participant.availableFromRound,
    available_to_round: participant.availableToRound,
    rough_5k_minutes: participant.rough5kMinutes,
    is_first_5k: participant.isFirst5k,
    dietary_notes: participant.dietaryNotes,
    show_times_on_leaderboard: participant.showTimesOnLeaderboard,
    created_at: participant.createdAt,
  };
}

function projectLeg(leg: Leg): ExportRow {
  return {
    id: leg.id,
    event_id: leg.eventId,
    team_id: leg.teamId,
    round_number: leg.roundNumber,
    runner_id: leg.runnerId,
    course_id: leg.courseId,
    status: leg.status,
    started_at: leg.startedAt,
    finished_at: leg.finishedAt,
    duration_seconds: leg.durationSeconds,
    external_activity_url: leg.externalActivityUrl,
    client_updated_at: leg.clientUpdatedAt,
    last_mutation_id: leg.lastMutationId,
    updated_by_organizer: leg.updatedByOrganizer,
  };
}

function projectSupplyItem(item: SupplyItem): ExportRow {
  return {
    id: item.id,
    event_id: item.eventId,
    category: item.category,
    name: item.name,
    is_wishlist: item.isWishlist,
    target_slots: item.targetSlots,
    created_by_participant_id: item.createdByParticipantId,
    created_at: item.createdAt,
  };
}

function projectSupplyClaim(claim: SupplyClaim): ExportRow {
  return {
    id: claim.id,
    event_id: claim.eventId,
    supply_item_id: claim.supplyItemId,
    participant_id: claim.participantId,
    note: claim.note,
    created_at: claim.createdAt,
  };
}

function projectChipIn(chipIn: ChipIn): ExportRow {
  return {
    id: chipIn.id,
    event_id: chipIn.eventId,
    participant_id: chipIn.participantId,
    amount_cents: chipIn.amountCents,
    note: chipIn.note,
    recorded_at: chipIn.recordedAt,
  };
}

function projectBadgeDefinition(def: BadgeDefinition): ExportRow {
  return {
    id: def.id,
    event_id: def.eventId,
    name: def.name,
    emoji: def.emoji,
    description: def.description,
    is_preset: def.isPreset,
  };
}

function projectBadgeAward(award: BadgeAward): ExportRow {
  return {
    id: award.id,
    event_id: award.eventId,
    badge_definition_id: award.badgeDefinitionId,
    participant_id: award.participantId,
    team_id: award.teamId,
    note: award.note,
    awarded_at: award.awardedAt,
  };
}

/**
 * Builds an explicit allow-listed Event Snapshot export payload covering only
 * the 12 standard RLS-protected tables (never `event_secrets` or secret hashes).
 */
export function buildEventSnapshotExportPayload(
  snapshot: EventSnapshot,
  exportedAt: string = new Date().toISOString(),
): EventSnapshotExportPayload {
  return {
    schema_version: 1,
    exported_at: exportedAt,
    event_id: snapshot.event.id,
    event_slug: snapshot.event.slug,
    tables: {
      events: [projectEvent(snapshot.event)],
      courses: snapshot.courses.map(projectCourse),
      announcements: snapshot.announcements.map(projectAnnouncement),
      rounds: snapshot.rounds.map(projectRound),
      teams: snapshot.teams.map(projectTeam),
      participants: snapshot.participants.map(projectParticipant),
      legs: snapshot.legs.map(projectLeg),
      supply_items: snapshot.supplyItems.map(projectSupplyItem),
      supply_claims: snapshot.supplyClaims.map(projectSupplyClaim),
      chip_ins: snapshot.chipIns.map(projectChipIn),
      badge_definitions: snapshot.badgeDefinitions.map(projectBadgeDefinition),
      badge_awards: snapshot.badgeAwards.map(projectBadgeAward),
    },
  };
}

/**
 * Serializes an Event Snapshot into valid UTF-8 JSON.
 */
export function serializeEventSnapshotJson(
  snapshot: EventSnapshot,
  exportedAt: string = new Date().toISOString(),
): string {
  const payload = buildEventSnapshotExportPayload(snapshot, exportedAt);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Escapes a single cell value according to RFC 4180 CSV rules:
 * - null/undefined -> empty field
 * - objects/arrays -> JSON stringified
 * - values containing `,`, `"`, `\n`, or `\r` -> enclosed in `"` with internal `"` doubled (`""`)
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else {
    text = JSON.stringify(value);
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Serializes all 12 standard RLS-protected Event tables into a single RFC 4180 CSV document.
 * Each table section starts with `table,<table_name>`, followed by its header row and data rows.
 */
export function serializeEventSnapshotCsv(
  snapshot: EventSnapshot,
  exportedAt: string = new Date().toISOString(),
): string {
  const payload = buildEventSnapshotExportPayload(snapshot, exportedAt);
  const lines: string[] = [];

  lines.push(`exported_at,${escapeCsvCell(payload.exported_at)}`);
  lines.push(`event_slug,${escapeCsvCell(payload.event_slug)}`);
  lines.push('');

  for (let i = 0; i < SNAPSHOT_EXPORT_TABLES.length; i += 1) {
    const tableName = SNAPSHOT_EXPORT_TABLES[i];
    const columns = TABLE_COLUMNS[tableName];
    const rows = payload.tables[tableName];

    lines.push(`table,${escapeCsvCell(tableName)}`);
    lines.push(columns.map((col) => escapeCsvCell(col)).join(','));

    for (const row of rows) {
      lines.push(columns.map((col) => escapeCsvCell(row[col])).join(','));
    }

    if (i < SNAPSHOT_EXPORT_TABLES.length - 1) {
      lines.push('');
    }
  }

  return `${lines.join('\r\n')}\r\n`;
}

export function buildSnapshotFilename(
  slug: string,
  format: 'json' | 'csv',
  exportedAt: string = new Date().toISOString(),
): string {
  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event';
  const datePart = exportedAt.slice(0, 10);
  return `winter-grind-${safeSlug}-snapshot-${datePart}.${format}`;
}

export function triggerFileDownload(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
