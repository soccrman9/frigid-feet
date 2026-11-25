import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  EventAccessError,
  type Announcement,
  type ApplyLegMutationInput,
  type ApplyLegMutationResult,
  type BadgeAward,
  type BadgeDefinition,
  type ChipIn,
  type ChipInBreakdownItem,
  type Course,
  type EventRecord,
  type EventSnapshot,
  type GrantScope,
  type Leg,
  type LegStatus,
  type Participant,
  type Round,
  type RsvpStatus,
  type SecretType,
  type SupplyCategory,
  type SupplyClaim,
  type SupplyItem,
  type Team,
} from '../types/domain';
import type { EventApi, Unsubscribe } from './eventApi';
import { createSeededInMemoryEventApi } from './inMemoryEventApi';
import {
  REALTIME_TABLES,
  type RealtimeChangeEvent,
  type RealtimeConnectionStatus,
  type RealtimeEventType,
  type RealtimeOldRow,
  type RealtimeSubscriptionHandlers,
  type RealtimeTable,
  type RealtimeTableRowMap,
} from '../features/realtime/realtimeTypes';

type Row = Record<string, unknown>;

function mapChipInBreakdown(raw: unknown): ChipInBreakdownItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      label: String(item.label ?? ''),
      amountCents: Number(item.amount_cents ?? item.amountCents ?? 0),
    }));
}

function mapEvent(row: Row): EventRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    eventDate: (row.event_date as string | null) ?? null,
    startTime: (row.start_time as string | null) ?? null,
    timezone: (row.timezone as string | null) ?? null,
    isActive: Boolean(row.is_active),
    basecampName: (row.basecamp_name as string | null) ?? null,
    basecampAddress: (row.basecamp_address as string | null) ?? null,
    basecampMapsUrl: (row.basecamp_maps_url as string | null) ?? null,
    parkingAmenitiesNotes: (row.parking_amenities_notes as string | null) ?? null,
    coldWeatherTips: (row.cold_weather_tips as string | null) ?? null,
    safetyFirstAidNotes: (row.safety_first_aid_notes as string | null) ?? null,
    stravaClubUrl: (row.strava_club_url as string | null) ?? null,
    recapNote: (row.recap_note as string | null) ?? null,
    chipInTargetCents: Number(row.chip_in_target_cents ?? 0),
    chipInSuggestedCents:
      row.chip_in_suggested_cents == null ? null : Number(row.chip_in_suggested_cents),
    chipInBreakdown: mapChipInBreakdown(row.chip_in_breakdown),
    venmoHandle: (row.venmo_handle as string | null) ?? null,
    zelleHandle: (row.zelle_handle as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapCourse(row: Row): Course {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    distanceKm: Number(row.distance_km ?? 5),
    isPrimary: Boolean(row.is_primary),
    gpxXml: (row.gpx_xml as string | null) ?? null,
    externalRouteUrl: (row.external_route_url as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapAnnouncement(row: Row): Announcement {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    title: (row.title as string | null) ?? null,
    body: String(row.body),
    isPinned: Boolean(row.is_pinned),
    createdAt: String(row.created_at),
  };
}

function mapRound(row: Row): Round {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    roundNumber: Number(row.round_number),
    scheduledStartAt: String(row.scheduled_start_at),
    startedAt: (row.started_at as string | null) ?? null,
  };
}

function mapTeam(row: Row): Team {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    name: String(row.name),
    tagline: (row.tagline as string | null) ?? null,
    colorHex: (row.color_hex as string | null) ?? null,
    emoji: (row.emoji as string | null) ?? null,
    isOpen: Boolean(row.is_open),
    lookingNote: (row.looking_note as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapParticipant(row: Row): Participant {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    displayName: String(row.display_name),
    rsvpStatus: row.rsvp_status as RsvpStatus,
    teamId: (row.team_id as string | null) ?? null,
    availableFromRound: Number(row.available_from_round ?? 1),
    availableToRound: Number(row.available_to_round ?? 10),
    rough5kMinutes: row.rough_5k_minutes == null ? null : Number(row.rough_5k_minutes),
    isFirst5k: Boolean(row.is_first_5k),
    dietaryNotes: (row.dietary_notes as string | null) ?? null,
    showTimesOnLeaderboard: Boolean(row.show_times_on_leaderboard),
    createdAt: String(row.created_at),
  };
}

function mapLeg(row: Row): Leg {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    teamId: String(row.team_id),
    roundNumber: Number(row.round_number),
    runnerId: (row.runner_id as string | null) ?? null,
    courseId: (row.course_id as string | null) ?? null,
    status: row.status as LegStatus,
    startedAt: (row.started_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    externalActivityUrl: (row.external_activity_url as string | null) ?? null,
    clientUpdatedAt: String(row.client_updated_at),
    lastMutationId: (row.last_mutation_id as string | null) ?? null,
    updatedByOrganizer: Boolean(row.updated_by_organizer),
  };
}

function mapSupplyItem(row: Row): SupplyItem {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    category: row.category as SupplyCategory,
    name: String(row.name),
    isWishlist: Boolean(row.is_wishlist),
    targetSlots: row.target_slots == null ? null : Number(row.target_slots),
    createdByParticipantId: (row.created_by_participant_id as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapSupplyClaim(row: Row): SupplyClaim {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    supplyItemId: String(row.supply_item_id),
    participantId: String(row.participant_id),
    note: (row.note as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapChipIn(row: Row): ChipIn {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    participantId: (row.participant_id as string | null) ?? null,
    amountCents: Number(row.amount_cents),
    note: (row.note as string | null) ?? null,
    recordedAt: String(row.recorded_at),
  };
}

function mapBadgeDefinition(row: Row): BadgeDefinition {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    name: String(row.name),
    emoji: String(row.emoji),
    description: (row.description as string | null) ?? null,
    isPreset: Boolean(row.is_preset),
  };
}

function mapBadgeAward(row: Row): BadgeAward {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    badgeDefinitionId: String(row.badge_definition_id),
    participantId: (row.participant_id as string | null) ?? null,
    teamId: (row.team_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    awardedAt: String(row.awarded_at),
  };
}

function handleSupabaseError(
  error: { code?: string; status?: number; message?: string } | null,
): never {
  const message = error?.message ?? 'Request failed.';
  const lowerMessage = message.toLowerCase();

  if (message.includes('Invalid invite code') || error?.code === '28000') {
    if (lowerMessage.includes('dashboard')) {
      throw new EventAccessError('INVALID_DASHBOARD_TOKEN', 'Invalid Basecamp Dashboard link.');
    }
    throw new EventAccessError('INVALID_INVITE_CODE', 'That invite code did not match this Event.');
  }

  if (
    error?.code === 'PGRST301' ||
    error?.code === '401' ||
    error?.status === 401 ||
    lowerMessage.includes('jwt expired') ||
    lowerMessage.includes('invalid jwt') ||
    lowerMessage.includes('not authenticated') ||
    lowerMessage.includes('authentication session required')
  ) {
    throw new EventAccessError('UNAUTHORIZED', message);
  }

  if (error?.code === '42501') {
    throw new EventAccessError('FORBIDDEN', message);
  }
  throw new EventAccessError('VALIDATION_ERROR', message);
}

function hasValidRowId(row: unknown): row is Row & { id: string } {
  if (!row || typeof row !== 'object' || !('id' in row)) {
    return false;
  }
  const id = (row as Row).id;
  return typeof id === 'string' && id.length > 0;
}

function mapRowForTable<T extends RealtimeTable>(table: T, row: Row): RealtimeTableRowMap[T] {
  switch (table) {
    case 'events':
      return mapEvent(row) as RealtimeTableRowMap[T];
    case 'courses':
      return mapCourse(row) as RealtimeTableRowMap[T];
    case 'announcements':
      return mapAnnouncement(row) as RealtimeTableRowMap[T];
    case 'rounds':
      return mapRound(row) as RealtimeTableRowMap[T];
    case 'teams':
      return mapTeam(row) as RealtimeTableRowMap[T];
    case 'participants':
      return mapParticipant(row) as RealtimeTableRowMap[T];
    case 'legs':
      return mapLeg(row) as RealtimeTableRowMap[T];
    case 'supply_items':
      return mapSupplyItem(row) as RealtimeTableRowMap[T];
    case 'supply_claims':
      return mapSupplyClaim(row) as RealtimeTableRowMap[T];
    case 'badge_definitions':
      return mapBadgeDefinition(row) as RealtimeTableRowMap[T];
    case 'badge_awards':
      return mapBadgeAward(row) as RealtimeTableRowMap[T];
  }
}

function mapOldRowForTable<T extends RealtimeTable>(
  table: T,
  row: unknown,
): RealtimeOldRow<T> | null {
  if (!hasValidRowId(row)) return null;
  const keys = Object.keys(row);
  if (keys.length <= 1) {
    return { id: String(row.id) } as RealtimeOldRow<T>;
  }
  if (keys.length === 2 && 'event_id' in row && typeof row.event_id === 'string') {
    return { id: String(row.id), eventId: row.event_id } as unknown as RealtimeOldRow<T>;
  }
  return mapRowForTable(table, row) as RealtimeOldRow<T>;
}

export function mapPostgresPayloadToRealtimeChange<T extends RealtimeTable>(
  table: T,
  payload: {
    eventType: string;
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
  },
): RealtimeChangeEvent | null {
  const eventType = payload.eventType as RealtimeEventType;
  if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') {
    return null;
  }

  if (eventType === 'DELETE') {
    const oldRow = mapOldRowForTable(table, payload.old);
    if (!oldRow) return null;
    return {
      table,
      eventType: 'DELETE',
      newRow: null,
      oldRow,
    } as RealtimeChangeEvent;
  }

  if (!hasValidRowId(payload.new)) {
    return null;
  }

  return {
    table,
    eventType,
    newRow: mapRowForTable(table, payload.new),
    oldRow: mapOldRowForTable(table, payload.old),
  } as RealtimeChangeEvent;
}

function mapChannelStatus(status: string): RealtimeConnectionStatus | null {
  switch (status) {
    case 'SUBSCRIBED':
      return 'connected';
    case 'TIMED_OUT':
    case 'CHANNEL_ERROR':
      return 'reconnecting';
    case 'CLOSED':
      return 'disconnected';
    default:
      return null;
  }
}

export class SupabaseEventApi implements EventApi {
  readonly client: SupabaseClient;

  constructor(urlOrClient: string | SupabaseClient, anonKey?: string) {
    if (typeof urlOrClient === 'string') {
      this.client = createClient(urlOrClient, anonKey ?? '', {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } else {
      this.client = urlOrClient;
    }
  }

  async ensureSession(): Promise<string> {
    const {
      data: { session },
    } = await this.client.auth.getSession();
    if (session?.user?.id) {
      return session.user.id;
    }

    const { data, error } = await this.client.auth.signInAnonymously();
    if (error || !data.user?.id) {
      throw new EventAccessError(
        'UNAUTHORIZED',
        error?.message ?? 'Could not establish an anonymous session.',
      );
    }
    return data.user.id;
  }

  async getActiveEventSlug(): Promise<string | null> {
    const { data, error } = await this.client.rpc('get_active_event_slug');
    if (error) handleSupabaseError(error);
    return (data as string | null) ?? null;
  }

  async getGrantedEventBySlug(
    slug: string,
  ): Promise<{ eventId: string; grants: GrantScope[] } | null> {
    const {
      data: { session },
    } = await this.client.auth.getSession();
    if (!session?.user?.id) return null;

    const { data, error } = await this.client
      .from('events')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data?.id) return null;
    const eventId = String(data.id);
    const grants = await this.getSessionGrants(eventId);
    if (!grants.some((g) => g === 'participant' || g === 'organizer')) return null;
    return { eventId, grants };
  }

  async getSessionGrants(eventId: string): Promise<GrantScope[]> {
    const { data, error } = await this.client
      .from('session_grants')
      .select('scope')
      .eq('event_id', eventId);

    if (error) return [];
    return (data ?? []).map((row) => row.scope as GrantScope);
  }

  async unlockEvent(slug: string, code: string): Promise<string> {
    await this.ensureSession();
    const { data, error } = await this.client.rpc('unlock_event', {
      p_slug: slug,
      p_code: code.trim(),
    });
    if (error || !data) handleSupabaseError(error);
    return String(data);
  }

  async unlockOrganizer(eventId: string, passcode: string): Promise<boolean> {
    await this.ensureSession();
    const { data, error } = await this.client.rpc('unlock_organizer', {
      p_event_id: eventId,
      p_passcode: passcode,
    });
    if (error) handleSupabaseError(error);
    return Boolean(data);
  }

  async revokeOrganizerGrant(eventId: string): Promise<void> {
    const { error } = await this.client.rpc('revoke_organizer_grant', {
      p_event_id: eventId,
    });
    if (error) handleSupabaseError(error);
  }

  async unlockDashboard(token: string): Promise<string> {
    await this.ensureSession();
    const { data, error } = await this.client.rpc('unlock_dashboard', {
      p_token: token,
    });
    if (error || !data) {
      throw new EventAccessError('INVALID_DASHBOARD_TOKEN', 'Invalid Basecamp Dashboard link.');
    }
    return String(data);
  }

  async rotateEventSecret(
    eventId: string,
    secretType: SecretType,
    newValue: string,
  ): Promise<void> {
    const { error } = await this.client.rpc('rotate_event_secret', {
      p_event_id: eventId,
      p_secret_type: secretType,
      p_new_value: newValue,
    });
    if (error) handleSupabaseError(error);
  }

  async pingHeartbeat(): Promise<boolean> {
    const { data, error } = await this.client.rpc('ping_heartbeat');
    if (error) handleSupabaseError(error);
    return Boolean(data);
  }

  async getEventSnapshot(eventId: string): Promise<EventSnapshot> {
    const grants = await this.getSessionGrants(eventId);
    const isOrganizer = grants.includes('organizer');
    const canSeeChipInTotal = isOrganizer || grants.includes('participant');

    const [
      eventRes,
      coursesRes,
      announcementsRes,
      roundsRes,
      teamsRes,
      participantsRes,
      legsRes,
      supplyItemsRes,
      supplyClaimsRes,
      badgeDefsRes,
      badgeAwardsRes,
    ] = await Promise.all([
      this.client.from('events').select('*').eq('id', eventId).single(),
      this.client.from('courses').select('*').eq('event_id', eventId).order('sort_order'),
      this.client
        .from('announcements')
        .select('*')
        .eq('event_id', eventId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      this.client.from('rounds').select('*').eq('event_id', eventId).order('round_number'),
      this.client.from('teams').select('*').eq('event_id', eventId).order('name'),
      this.client.from('participants').select('*').eq('event_id', eventId).order('display_name'),
      this.client.from('legs').select('*').eq('event_id', eventId).order('round_number'),
      this.client.from('supply_items').select('*').eq('event_id', eventId),
      this.client.from('supply_claims').select('*').eq('event_id', eventId),
      this.client.from('badge_definitions').select('*').eq('event_id', eventId),
      this.client.from('badge_awards').select('*').eq('event_id', eventId),
    ]);

    if (eventRes.error || !eventRes.data) {
      if (eventRes.error?.code === 'PGRST116' || (!eventRes.error && !eventRes.data)) {
        const {
          data: { session },
        } = await this.client.auth.getSession();
        if (!session?.user?.id) {
          throw new EventAccessError(
            'UNAUTHORIZED',
            'Your session has expired. Please re-open the Event to reconnect.',
          );
        }
        throw new EventAccessError('FORBIDDEN', 'You no longer have access to this Event.');
      }
      handleSupabaseError(eventRes.error);
    }

    let chipInTotalCents = 0;
    if (canSeeChipInTotal) {
      chipInTotalCents = await this.getChipInSummary(eventId);
    }

    let chipIns: ChipIn[] = [];
    if (isOrganizer) {
      chipIns = await this.getChipIns(eventId);
    }

    return {
      event: mapEvent(eventRes.data as Row),
      courses: (coursesRes.data ?? []).map((r) => mapCourse(r as Row)),
      announcements: (announcementsRes.data ?? []).map((r) => mapAnnouncement(r as Row)),
      rounds: (roundsRes.data ?? []).map((r) => mapRound(r as Row)),
      teams: (teamsRes.data ?? []).map((r) => mapTeam(r as Row)),
      participants: (participantsRes.data ?? []).map((r) => mapParticipant(r as Row)),
      legs: (legsRes.data ?? []).map((r) => mapLeg(r as Row)),
      supplyItems: (supplyItemsRes.data ?? []).map((r) => mapSupplyItem(r as Row)),
      supplyClaims: (supplyClaimsRes.data ?? []).map((r) => mapSupplyClaim(r as Row)),
      badgeDefinitions: (badgeDefsRes.data ?? []).map((r) => mapBadgeDefinition(r as Row)),
      badgeAwards: (badgeAwardsRes.data ?? []).map((r) => mapBadgeAward(r as Row)),
      chipInTotalCents,
      chipIns,
    };
  }

  async getChipInSummary(eventId: string): Promise<number> {
    const { data, error } = await this.client.rpc('get_chip_in_summary', {
      p_event_id: eventId,
    });
    if (error) handleSupabaseError(error);
    return Number(data ?? 0);
  }

  async getChipIns(eventId: string): Promise<ChipIn[]> {
    const { data, error } = await this.client
      .from('chip_ins')
      .select('*')
      .eq('event_id', eventId)
      .order('recorded_at', { ascending: false });
    if (error) handleSupabaseError(error);
    return (data ?? []).map((r) => mapChipIn(r as Row));
  }

  async updateEvent(
    eventId: string,
    patch: Partial<Omit<EventRecord, 'id' | 'slug' | 'createdAt'>>,
  ): Promise<EventRecord> {
    const payload: Row = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.eventDate !== undefined) payload.event_date = patch.eventDate;
    if (patch.startTime !== undefined) payload.start_time = patch.startTime;
    if (patch.timezone !== undefined) payload.timezone = patch.timezone;
    if (patch.isActive !== undefined) payload.is_active = patch.isActive;
    if (patch.basecampName !== undefined) payload.basecamp_name = patch.basecampName;
    if (patch.basecampAddress !== undefined) payload.basecamp_address = patch.basecampAddress;
    if (patch.basecampMapsUrl !== undefined) payload.basecamp_maps_url = patch.basecampMapsUrl;
    if (patch.parkingAmenitiesNotes !== undefined)
      payload.parking_amenities_notes = patch.parkingAmenitiesNotes;
    if (patch.coldWeatherTips !== undefined) payload.cold_weather_tips = patch.coldWeatherTips;
    if (patch.safetyFirstAidNotes !== undefined)
      payload.safety_first_aid_notes = patch.safetyFirstAidNotes;
    if (patch.stravaClubUrl !== undefined) payload.strava_club_url = patch.stravaClubUrl;
    if (patch.recapNote !== undefined) payload.recap_note = patch.recapNote;
    if (patch.chipInTargetCents !== undefined)
      payload.chip_in_target_cents = patch.chipInTargetCents;
    if (patch.chipInSuggestedCents !== undefined)
      payload.chip_in_suggested_cents = patch.chipInSuggestedCents;
    if (patch.chipInBreakdown !== undefined) {
      payload.chip_in_breakdown = patch.chipInBreakdown.map((item) => ({
        label: item.label,
        amount_cents: item.amountCents,
      }));
    }
    if (patch.venmoHandle !== undefined) payload.venmo_handle = patch.venmoHandle;
    if (patch.zelleHandle !== undefined) payload.zelle_handle = patch.zelleHandle;

    const { data, error } = await this.client
      .from('events')
      .update(payload)
      .eq('id', eventId)
      .select('*')
      .single();
    if (error || !data) handleSupabaseError(error);
    return mapEvent(data as Row);
  }

  async upsertCourse(
    eventId: string,
    course: Omit<Course, 'id' | 'eventId'> & { id?: string },
  ): Promise<Course> {
    const payload: Row = {
      event_id: eventId,
      name: course.name,
      description: course.description,
      distance_km: course.distanceKm,
      is_primary: course.isPrimary,
      gpx_xml: course.gpxXml,
      external_route_url: course.externalRouteUrl,
      sort_order: course.sortOrder,
    };
    if (course.id) payload.id = course.id;

    const { data, error } = await this.client
      .from('courses')
      .upsert(payload)
      .select('*')
      .single();
    if (error || !data) handleSupabaseError(error);
    return mapCourse(data as Row);
  }

  async deleteCourse(eventId: string, courseId: string): Promise<void> {
    const { error } = await this.client
      .from('courses')
      .delete()
      .eq('event_id', eventId)
      .eq('id', courseId);
    if (error) handleSupabaseError(error);
  }

  async createAnnouncement(
    eventId: string,
    data: Pick<Announcement, 'title' | 'body' | 'isPinned'>,
  ): Promise<Announcement> {
    const { data: row, error } = await this.client
      .from('announcements')
      .insert({
        event_id: eventId,
        title: data.title,
        body: data.body,
        is_pinned: data.isPinned,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapAnnouncement(row as Row);
  }

  async updateAnnouncement(
    eventId: string,
    announcementId: string,
    patch: Partial<Pick<Announcement, 'title' | 'body' | 'isPinned'>>,
  ): Promise<Announcement> {
    const payload: Row = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.body !== undefined) payload.body = patch.body;
    if (patch.isPinned !== undefined) payload.is_pinned = patch.isPinned;

    const { data: row, error } = await this.client
      .from('announcements')
      .update(payload)
      .eq('event_id', eventId)
      .eq('id', announcementId)
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapAnnouncement(row as Row);
  }

  async deleteAnnouncement(eventId: string, announcementId: string): Promise<void> {
    const { error } = await this.client
      .from('announcements')
      .delete()
      .eq('event_id', eventId)
      .eq('id', announcementId);
    if (error) handleSupabaseError(error);
  }

  async createParticipant(
    eventId: string,
    data: Omit<Participant, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<Participant> {
    const { data: row, error } = await this.client
      .from('participants')
      .insert({
        event_id: eventId,
        display_name: data.displayName,
        rsvp_status: data.rsvpStatus,
        team_id: data.teamId,
        available_from_round: data.availableFromRound,
        available_to_round: data.availableToRound,
        rough_5k_minutes: data.rough5kMinutes,
        is_first_5k: data.isFirst5k,
        dietary_notes: data.dietaryNotes,
        show_times_on_leaderboard: data.showTimesOnLeaderboard,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapParticipant(row as Row);
  }

  async updateParticipant(
    eventId: string,
    participantId: string,
    patch: Partial<Omit<Participant, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<Participant> {
    const payload: Row = {};
    if (patch.displayName !== undefined) payload.display_name = patch.displayName;
    if (patch.rsvpStatus !== undefined) payload.rsvp_status = patch.rsvpStatus;
    if (patch.teamId !== undefined) payload.team_id = patch.teamId;
    if (patch.availableFromRound !== undefined)
      payload.available_from_round = patch.availableFromRound;
    if (patch.availableToRound !== undefined) payload.available_to_round = patch.availableToRound;
    if (patch.rough5kMinutes !== undefined) payload.rough_5k_minutes = patch.rough5kMinutes;
    if (patch.isFirst5k !== undefined) payload.is_first_5k = patch.isFirst5k;
    if (patch.dietaryNotes !== undefined) payload.dietary_notes = patch.dietaryNotes;
    if (patch.showTimesOnLeaderboard !== undefined)
      payload.show_times_on_leaderboard = patch.showTimesOnLeaderboard;

    const { data: row, error } = await this.client
      .from('participants')
      .update(payload)
      .eq('event_id', eventId)
      .eq('id', participantId)
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapParticipant(row as Row);
  }

  async deleteParticipant(eventId: string, participantId: string): Promise<void> {
    const { error } = await this.client
      .from('participants')
      .delete()
      .eq('event_id', eventId)
      .eq('id', participantId);
    if (error) handleSupabaseError(error);
  }

  async createTeam(
    eventId: string,
    data: Omit<Team, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<Team> {
    const { data: row, error } = await this.client
      .from('teams')
      .insert({
        event_id: eventId,
        name: data.name,
        tagline: data.tagline,
        color_hex: data.colorHex,
        emoji: data.emoji,
        is_open: data.isOpen,
        looking_note: data.lookingNote,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapTeam(row as Row);
  }

  async updateTeam(
    eventId: string,
    teamId: string,
    patch: Partial<Omit<Team, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<Team> {
    const payload: Row = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.tagline !== undefined) payload.tagline = patch.tagline;
    if (patch.colorHex !== undefined) payload.color_hex = patch.colorHex;
    if (patch.emoji !== undefined) payload.emoji = patch.emoji;
    if (patch.isOpen !== undefined) payload.is_open = patch.isOpen;
    if (patch.lookingNote !== undefined) payload.looking_note = patch.lookingNote;

    const { data: row, error } = await this.client
      .from('teams')
      .update(payload)
      .eq('event_id', eventId)
      .eq('id', teamId)
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapTeam(row as Row);
  }

  async deleteTeam(eventId: string, teamId: string): Promise<void> {
    const { error } = await this.client
      .from('teams')
      .delete()
      .eq('event_id', eventId)
      .eq('id', teamId);
    if (error) handleSupabaseError(error);
  }

  async leaveTeam(participantId: string): Promise<void> {
    const { error } = await this.client.rpc('leave_team', {
      p_participant_id: participantId,
    });
    if (error) handleSupabaseError(error);
  }

  async updateLeg(
    eventId: string,
    legId: string,
    patch: Partial<Omit<Leg, 'id' | 'eventId' | 'teamId' | 'roundNumber'>>,
  ): Promise<Leg> {
    const payload: Row = {};
    if (patch.runnerId !== undefined) payload.runner_id = patch.runnerId;
    if (patch.courseId !== undefined) payload.course_id = patch.courseId;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.startedAt !== undefined) payload.started_at = patch.startedAt;
    if (patch.finishedAt !== undefined) payload.finished_at = patch.finishedAt;
    if (patch.durationSeconds !== undefined) payload.duration_seconds = patch.durationSeconds;
    if (patch.externalActivityUrl !== undefined)
      payload.external_activity_url = patch.externalActivityUrl;

    const { data: row, error } = await this.client
      .from('legs')
      .update(payload)
      .eq('event_id', eventId)
      .eq('id', legId)
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapLeg(row as Row);
  }

  async applyLegMutation(input: ApplyLegMutationInput): Promise<ApplyLegMutationResult> {
    const { data, error } = await this.client.rpc('apply_leg_mutation', {
      p_event_id: input.eventId,
      p_leg_id: input.legId,
      p_mutation_id: input.mutationId,
      p_status: input.status,
      p_started_at: input.startedAt,
      p_finished_at: input.finishedAt,
      p_duration_seconds: input.durationSeconds,
      p_course_id: input.courseId,
      p_external_activity_url: input.externalActivityUrl,
      p_is_explicit_revert: input.isExplicitRevert,
      p_client_updated_at: input.clientUpdatedAt,
    });
    if (error || !data) handleSupabaseError(error);
    const result = data as {
      applied: boolean;
      reason: 'applied' | 'duplicate' | 'stale_or_overridden';
      leg: Row;
    };
    return {
      applied: result.applied,
      reason: result.reason,
      leg: mapLeg(result.leg),
    };
  }

  async startRound(
    eventId: string,
    roundNumber: number,
    excludeLegIds: string[] = [],
    startedAt: string = new Date().toISOString(),
  ): Promise<number> {
    const { data, error } = await this.client.rpc('start_round', {
      p_event_id: eventId,
      p_round_number: roundNumber,
      p_exclude_leg_ids: excludeLegIds,
      p_started_at: startedAt,
    });
    if (error) handleSupabaseError(error);
    return Number(data ?? 0);
  }

  async createSupplyItem(
    eventId: string,
    data: Omit<SupplyItem, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<SupplyItem> {
    const { data: row, error } = await this.client
      .from('supply_items')
      .insert({
        event_id: eventId,
        category: data.category,
        name: data.name,
        is_wishlist: data.isWishlist,
        target_slots: data.targetSlots,
        created_by_participant_id: data.createdByParticipantId,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapSupplyItem(row as Row);
  }

  async updateSupplyItem(
    eventId: string,
    supplyItemId: string,
    patch: Partial<Omit<SupplyItem, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<SupplyItem> {
    const payload: Row = {};
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.isWishlist !== undefined) payload.is_wishlist = patch.isWishlist;
    if (patch.targetSlots !== undefined) payload.target_slots = patch.targetSlots;

    const { data: row, error } = await this.client
      .from('supply_items')
      .update(payload)
      .eq('event_id', eventId)
      .eq('id', supplyItemId)
      .select('*')
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        throw new EventAccessError(
          'FORBIDDEN',
          'You do not have permission to edit this Supply item.',
        );
      }
      handleSupabaseError(error);
    }
    if (!row) {
      throw new EventAccessError(
        'FORBIDDEN',
        'You do not have permission to edit this Supply item.',
      );
    }
    return mapSupplyItem(row as Row);
  }

  async deleteSupplyItem(eventId: string, supplyItemId: string): Promise<void> {
    const { data, error } = await this.client
      .from('supply_items')
      .delete()
      .eq('event_id', eventId)
      .eq('id', supplyItemId)
      .select('id');
    if (error) handleSupabaseError(error);
    if (!data || data.length === 0) {
      throw new EventAccessError(
        'FORBIDDEN',
        'You do not have permission to delete this Supply item.',
      );
    }
  }

  async createSupplyClaim(
    eventId: string,
    data: Omit<SupplyClaim, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<SupplyClaim> {
    const { data: row, error } = await this.client
      .from('supply_claims')
      .insert({
        event_id: eventId,
        supply_item_id: data.supplyItemId,
        participant_id: data.participantId,
        note: data.note,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapSupplyClaim(row as Row);
  }

  async deleteSupplyClaim(eventId: string, supplyClaimId: string): Promise<void> {
    const { error } = await this.client
      .from('supply_claims')
      .delete()
      .eq('event_id', eventId)
      .eq('id', supplyClaimId);
    if (error) handleSupabaseError(error);
  }

  async createChipIn(
    eventId: string,
    data: Omit<ChipIn, 'id' | 'eventId' | 'recordedAt'>,
  ): Promise<ChipIn> {
    const { data: row, error } = await this.client
      .from('chip_ins')
      .insert({
        event_id: eventId,
        participant_id: data.participantId,
        amount_cents: data.amountCents,
        note: data.note,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapChipIn(row as Row);
  }

  async updateChipIn(
    eventId: string,
    chipInId: string,
    patch: Partial<Omit<ChipIn, 'id' | 'eventId' | 'recordedAt'>>,
  ): Promise<ChipIn> {
    const payload: Row = {};
    if (patch.participantId !== undefined) payload.participant_id = patch.participantId;
    if (patch.amountCents !== undefined) payload.amount_cents = patch.amountCents;
    if (patch.note !== undefined) payload.note = patch.note;

    const { data: row, error } = await this.client
      .from('chip_ins')
      .update(payload)
      .eq('event_id', eventId)
      .eq('id', chipInId)
      .select('*')
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        throw new EventAccessError(
          'FORBIDDEN',
          'You do not have permission to edit this chip-in entry.',
        );
      }
      handleSupabaseError(error);
    }
    if (!row) {
      throw new EventAccessError(
        'FORBIDDEN',
        'You do not have permission to edit this chip-in entry.',
      );
    }
    return mapChipIn(row as Row);
  }

  async deleteChipIn(eventId: string, chipInId: string): Promise<void> {
    const { data, error } = await this.client
      .from('chip_ins')
      .delete()
      .eq('event_id', eventId)
      .eq('id', chipInId)
      .select('id');
    if (error) handleSupabaseError(error);
    if (!data || data.length === 0) {
      throw new EventAccessError(
        'FORBIDDEN',
        'You do not have permission to delete this chip-in entry.',
      );
    }
  }

  async createBadgeDefinition(
    eventId: string,
    data: Omit<BadgeDefinition, 'id' | 'eventId'>,
  ): Promise<BadgeDefinition> {
    const name = data.name.trim();
    const emoji = data.emoji.trim();
    if (!name) {
      throw new EventAccessError('VALIDATION_ERROR', 'Badge name cannot be empty.');
    }
    if (!emoji) {
      throw new EventAccessError('VALIDATION_ERROR', 'Badge emoji cannot be empty.');
    }
    const { data: row, error } = await this.client
      .from('badge_definitions')
      .insert({
        event_id: eventId,
        name,
        emoji,
        description: data.description?.trim() ? data.description.trim() : null,
        is_preset: data.isPreset,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapBadgeDefinition(row as Row);
  }

  async deleteBadgeDefinition(eventId: string, badgeDefinitionId: string): Promise<void> {
    const { data, error } = await this.client
      .from('badge_definitions')
      .delete()
      .eq('event_id', eventId)
      .eq('id', badgeDefinitionId)
      .select('id');
    if (error) handleSupabaseError(error);
    if (!data || data.length === 0) {
      throw new EventAccessError(
        'FORBIDDEN',
        'You do not have permission to delete this Badge definition.',
      );
    }
  }

  async createBadgeAward(
    eventId: string,
    data: Omit<BadgeAward, 'id' | 'eventId' | 'awardedAt'>,
  ): Promise<BadgeAward> {
    const hasParticipant = data.participantId !== null;
    const hasTeam = data.teamId !== null;
    if (hasParticipant === hasTeam) {
      throw new EventAccessError(
        'VALIDATION_ERROR',
        'Badge award must target either a Participant or a Team, not both or neither.',
      );
    }
    const { data: row, error } = await this.client
      .from('badge_awards')
      .insert({
        event_id: eventId,
        badge_definition_id: data.badgeDefinitionId,
        participant_id: data.participantId,
        team_id: data.teamId,
        note: data.note?.trim() ? data.note.trim() : null,
      })
      .select('*')
      .single();
    if (error || !row) handleSupabaseError(error);
    return mapBadgeAward(row as Row);
  }

  async deleteBadgeAward(eventId: string, badgeAwardId: string): Promise<void> {
    const { data, error } = await this.client
      .from('badge_awards')
      .delete()
      .eq('event_id', eventId)
      .eq('id', badgeAwardId)
      .select('id');
    if (error) handleSupabaseError(error);
    if (!data || data.length === 0) {
      throw new EventAccessError(
        'FORBIDDEN',
        'You do not have permission to revoke this Badge award.',
      );
    }
  }

  subscribeToEvent(eventId: string, handlers: RealtimeSubscriptionHandlers): Unsubscribe {
    let unsubscribed = false;
    handlers.onStatusChange?.('connecting');

    const channel = this.client.channel(`event:${eventId}`);
    for (const table of REALTIME_TABLES) {
      const filter = table === 'events' ? `id=eq.${eventId}` : `event_id=eq.${eventId}`;
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          if (unsubscribed) return;
          const change = mapPostgresPayloadToRealtimeChange(table, {
            eventType: payload.eventType,
            new: payload.new as Record<string, unknown> | null,
            old: payload.old as Record<string, unknown> | null,
          });
          if (change) {
            handlers.onChange(change);
          }
        },
      );
    }

    channel.subscribe((status) => {
      if (unsubscribed) return;
      const mapped = mapChannelStatus(status);
      if (mapped) {
        handlers.onStatusChange?.(mapped);
      }
    });

    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      void this.client.removeChannel(channel);
    };
  }
}

export interface EventApiEnvConfig {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  DEV?: boolean;
  VITE_USE_MOCK_API?: string;
}

export class EventConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventConfigurationError';
  }
}

function isValidSupabaseConfig(url?: string, anonKey?: string): boolean {
  const trimmedUrl = url?.trim() ?? '';
  const trimmedKey = anonKey?.trim() ?? '';
  if (!trimmedUrl || !trimmedKey) return false;
  if (
    trimmedUrl.includes('your-project-ref') ||
    trimmedKey.includes('your-anon-key') ||
    trimmedKey.includes('placeholder')
  ) {
    return false;
  }
  return true;
}

export function createEventApiFromEnv(
  overrideEnv?: EventApiEnvConfig,
  devMockFactory?: () => EventApi,
): EventApi {
  const url = overrideEnv
    ? overrideEnv.VITE_SUPABASE_URL
    : (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const anonKey = overrideEnv
    ? overrideEnv.VITE_SUPABASE_ANON_KEY
    : (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  const isDev = overrideEnv ? Boolean(overrideEnv.DEV) : import.meta.env.DEV;
  const useMockApi = overrideEnv
    ? overrideEnv.VITE_USE_MOCK_API === 'true'
    : import.meta.env.VITE_USE_MOCK_API === 'true';

  if (isDev && useMockApi) {
    if (devMockFactory) return devMockFactory();
    if (import.meta.env.DEV) {
      return createSeededInMemoryEventApi().api;
    }
  }

  if (isValidSupabaseConfig(url, anonKey)) {
    return new SupabaseEventApi(url!.trim(), anonKey!.trim());
  }

  if (isDev) {
    if (devMockFactory) return devMockFactory();
    if (import.meta.env.DEV) {
      return createSeededInMemoryEventApi().api;
    }
  }

  throw new EventConfigurationError(
    'Winter Grind 50K is not configured for a live Supabase backend. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment environment.',
  );
}
