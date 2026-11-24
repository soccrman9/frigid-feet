import {
  EventAccessError,
  PRESET_BADGE_DEFINITIONS,
  type Announcement,
  type ApplyLegMutationInput,
  type ApplyLegMutationResult,
  type BadgeAward,
  type BadgeDefinition,
  type ChipIn,
  type Course,
  type CreateEventInput,
  type EventRecord,
  type EventSnapshot,
  type GrantScope,
  type Leg,
  type Participant,
  type Round,
  type SecretType,
  type SessionGrant,
  type SupplyClaim,
  type SupplyItem,
  type Team,
} from '../types/domain';
import type { EventApi, Unsubscribe } from './eventApi';
import { toSafeHttpsUrl } from '../features/home/urlSafety';

interface StoredSecrets {
  eventId: string;
  inviteCode: string;
  organizerPasscode: string;
  dashboardToken: string;
  updatedAt: string;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function validateHttpsUrl(url: string | null | undefined, fieldName: string): void {
  if (url == null) return;
  const safe = toSafeHttpsUrl(url);
  if (!safe || safe !== url) {
    throw new EventAccessError(
      'VALIDATION_ERROR',
      `${fieldName} must be a valid https:// URL (500 characters or fewer).`,
    );
  }
}

export class InMemoryEventStore {
  readonly events = new Map<string, EventRecord>();
  private readonly secrets = new Map<string, StoredSecrets>();
  readonly sessionGrants: SessionGrant[] = [];
  readonly courses = new Map<string, Course>();
  readonly announcements = new Map<string, Announcement>();
  readonly rounds = new Map<string, Round>();
  readonly teams = new Map<string, Team>();
  readonly participants = new Map<string, Participant>();
  readonly legs = new Map<string, Leg>();
  readonly supplyItems = new Map<string, SupplyItem>();
  readonly supplyClaims = new Map<string, SupplyClaim>();
  readonly chipIns = new Map<string, ChipIn>();
  readonly badgeDefinitions = new Map<string, BadgeDefinition>();
  readonly badgeAwards = new Map<string, BadgeAward>();
  private readonly listeners = new Map<string, Set<() => void>>();

  notify(eventId: string): void {
    const subs = this.listeners.get(eventId);
    if (!subs) return;
    for (const fn of subs) {
      fn();
    }
  }

  subscribe(eventId: string, onChange: () => void): Unsubscribe {
    let subs = this.listeners.get(eventId);
    if (!subs) {
      subs = new Set();
      this.listeners.set(eventId, subs);
    }
    subs.add(onChange);
    return () => {
      subs?.delete(onChange);
    };
  }

  createEvent(input: CreateEventInput): string {
    for (const existing of this.events.values()) {
      if (existing.slug === input.slug) {
        throw new EventAccessError('VALIDATION_ERROR', `Event slug "${input.slug}" already exists.`);
      }
    }

    const isActive = input.isActive ?? true;
    if (isActive) {
      for (const existing of this.events.values()) {
        if (existing.isActive) {
          existing.isActive = false;
        }
      }
    }

    const eventId = generateId();
    const now = new Date().toISOString();

    const record: EventRecord = {
      id: eventId,
      slug: input.slug,
      name: input.name,
      eventDate: input.eventDate,
      startTime: input.startTime,
      timezone: input.timezone,
      isActive,
      basecampName: input.basecampName ?? null,
      basecampAddress: input.basecampAddress ?? null,
      basecampMapsUrl: input.basecampMapsUrl ?? null,
      parkingAmenitiesNotes: input.parkingAmenitiesNotes ?? null,
      coldWeatherTips: input.coldWeatherTips ?? null,
      safetyFirstAidNotes: input.safetyFirstAidNotes ?? null,
      stravaClubUrl: input.stravaClubUrl ?? null,
      recapNote: null,
      chipInTargetCents: input.chipInTargetCents ?? 0,
      chipInSuggestedCents: input.chipInSuggestedCents ?? null,
      chipInBreakdown: input.chipInBreakdown ? [...input.chipInBreakdown] : [],
      venmoHandle: input.venmoHandle ?? null,
      zelleHandle: input.zelleHandle ?? null,
      createdAt: now,
    };

    this.events.set(eventId, record);
    this.secrets.set(eventId, {
      eventId,
      inviteCode: input.inviteCode,
      organizerPasscode: input.organizerPasscode,
      dashboardToken: input.dashboardToken,
      updatedAt: now,
    });

    const baseStartMs = Date.parse(input.startTime);
    for (let roundNumber = 1; roundNumber <= 10; roundNumber += 1) {
      const roundId = generateId();
      const scheduledStartAt = new Date(baseStartMs + (roundNumber - 1) * 3_600_000).toISOString();
      this.rounds.set(roundId, {
        id: roundId,
        eventId,
        roundNumber,
        scheduledStartAt,
        startedAt: null,
      });
    }

    for (const preset of PRESET_BADGE_DEFINITIONS) {
      const id = generateId();
      this.badgeDefinitions.set(id, {
        id,
        eventId,
        ...preset,
      });
    }

    return eventId;
  }

  verifyInviteCode(slug: string, code: string): string | null {
    const event = Array.from(this.events.values()).find((e) => e.slug === slug);
    if (!event) return null;
    const secret = this.secrets.get(event.id);
    if (!secret || secret.inviteCode !== code) return null;
    return event.id;
  }

  verifyOrganizerPasscode(eventId: string, passcode: string): boolean {
    const secret = this.secrets.get(eventId);
    return Boolean(secret && secret.organizerPasscode === passcode);
  }

  verifyDashboardToken(token: string): string | null {
    if (!token.trim()) return null;
    for (const secret of this.secrets.values()) {
      if (secret.dashboardToken === token) {
        return secret.eventId;
      }
    }
    return null;
  }

  rotateSecret(
    eventId: string,
    secretType: SecretType,
    newValue: string,
    callerAuthUid: string,
  ): void {
    const secret = this.secrets.get(eventId);
    if (!secret) {
      throw new EventAccessError('NOT_FOUND', 'Event not found.');
    }
    if (!newValue.trim()) {
      throw new EventAccessError('VALIDATION_ERROR', 'New secret value cannot be empty.');
    }

    secret.updatedAt = new Date().toISOString();

    if (secretType === 'invite_code') {
      secret.inviteCode = newValue;
      this.removeGrants((g) => g.eventId === eventId && g.scope === 'participant');
    } else if (secretType === 'organizer_passcode') {
      secret.organizerPasscode = newValue;
      this.removeGrants(
        (g) => g.eventId === eventId && g.scope === 'organizer' && g.authUid !== callerAuthUid,
      );
    } else if (secretType === 'dashboard_token') {
      secret.dashboardToken = newValue;
      this.removeGrants((g) => g.eventId === eventId && g.scope === 'dashboard');
    }
  }

  upsertGrant(authUid: string, eventId: string, scope: GrantScope): void {
    const existing = this.sessionGrants.find(
      (g) => g.authUid === authUid && g.eventId === eventId && g.scope === scope,
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.grantedAt = now;
    } else {
      this.sessionGrants.push({ authUid, eventId, scope, grantedAt: now });
    }
  }

  hasGrant(authUid: string | null, eventId: string, scopes: GrantScope[]): boolean {
    if (!authUid) return false;
    return this.sessionGrants.some(
      (g) => g.authUid === authUid && g.eventId === eventId && scopes.includes(g.scope),
    );
  }

  getGrants(authUid: string | null, eventId: string): GrantScope[] {
    if (!authUid) return [];
    return this.sessionGrants
      .filter((g) => g.authUid === authUid && g.eventId === eventId)
      .map((g) => g.scope);
  }

  private removeGrants(predicate: (grant: SessionGrant) => boolean): void {
    for (let i = this.sessionGrants.length - 1; i >= 0; i -= 1) {
      if (predicate(this.sessionGrants[i])) {
        this.sessionGrants.splice(i, 1);
      }
    }
  }

  seedTeamLegs(eventId: string, teamId: string): void {
    const primaryCourse =
      Array.from(this.courses.values())
        .filter((c) => c.eventId === eventId)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)[0] ??
      null;

    const now = new Date().toISOString();
    for (let roundNumber = 1; roundNumber <= 10; roundNumber += 1) {
      const id = generateId();
      this.legs.set(id, {
        id,
        eventId,
        teamId,
        roundNumber,
        runnerId: null,
        courseId: primaryCourse?.id ?? null,
        status: 'scheduled',
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        externalActivityUrl: null,
        clientUpdatedAt: now,
        lastMutationId: null,
        updatedByOrganizer: false,
      });
    }
  }
}

export class InMemoryEventApi implements EventApi {
  private readonly store: InMemoryEventStore;
  private authUid: string | null;

  constructor(store: InMemoryEventStore, initialAuthUid?: string) {
    this.store = store;
    this.authUid = initialAuthUid ?? null;
  }

  private requireAuth(): string {
    if (!this.authUid) {
      throw new EventAccessError('UNAUTHORIZED', 'Anonymous session required.');
    }
    return this.authUid;
  }

  private requireGrant(eventId: string, scopes: GrantScope[]): void {
    const uid = this.requireAuth();
    if (!this.store.hasGrant(uid, eventId, scopes)) {
      throw new EventAccessError('FORBIDDEN', 'You do not have permission for this Event action.');
    }
  }

  async ensureSession(): Promise<string> {
    if (!this.authUid) {
      this.authUid = generateId();
    }
    return this.authUid;
  }

  async getActiveEventSlug(): Promise<string | null> {
    const active = Array.from(this.store.events.values())
      .filter((e) => e.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return active?.slug ?? null;
  }

  async getGrantedEventBySlug(
    slug: string,
  ): Promise<{ eventId: string; grants: GrantScope[] } | null> {
    if (!this.authUid) return null;
    const event = Array.from(this.store.events.values()).find((e) => e.slug === slug);
    if (!event) return null;
    const grants = this.store.getGrants(this.authUid, event.id);
    if (grants.length === 0) return null;
    return { eventId: event.id, grants };
  }

  async getSessionGrants(eventId: string): Promise<GrantScope[]> {
    return this.store.getGrants(this.authUid, eventId);
  }

  async unlockEvent(slug: string, code: string): Promise<string> {
    const uid = await this.ensureSession();
    const eventId = this.store.verifyInviteCode(slug, code.trim());
    if (!eventId) {
      throw new EventAccessError('INVALID_INVITE_CODE', 'That invite code did not match this Event.');
    }
    this.store.upsertGrant(uid, eventId, 'participant');
    return eventId;
  }

  async unlockOrganizer(eventId: string, passcode: string): Promise<boolean> {
    const uid = await this.ensureSession();
    if (!this.store.verifyOrganizerPasscode(eventId, passcode)) {
      return false;
    }
    this.store.upsertGrant(uid, eventId, 'participant');
    this.store.upsertGrant(uid, eventId, 'organizer');
    return true;
  }

  async unlockDashboard(token: string): Promise<string> {
    const uid = await this.ensureSession();
    const eventId = this.store.verifyDashboardToken(token);
    if (!eventId) {
      throw new EventAccessError('INVALID_DASHBOARD_TOKEN', 'Invalid Basecamp Dashboard link.');
    }
    this.store.upsertGrant(uid, eventId, 'dashboard');
    return eventId;
  }

  async rotateEventSecret(
    eventId: string,
    secretType: SecretType,
    newValue: string,
  ): Promise<void> {
    this.requireGrant(eventId, ['organizer']);
    this.store.rotateSecret(eventId, secretType, newValue, this.requireAuth());
  }

  async pingHeartbeat(): Promise<boolean> {
    return true;
  }

  async getEventSnapshot(eventId: string): Promise<EventSnapshot> {
    this.requireGrant(eventId, ['dashboard', 'participant', 'organizer']);
    const event = this.store.events.get(eventId);
    if (!event) {
      throw new EventAccessError('NOT_FOUND', 'Event not found.');
    }

    const isOrganizer = this.store.hasGrant(this.authUid, eventId, ['organizer']);
    const canSeeChipInTotal = this.store.hasGrant(this.authUid, eventId, [
      'participant',
      'organizer',
    ]);

    const chipIns = isOrganizer
      ? Array.from(this.store.chipIns.values())
          .filter((c) => c.eventId === eventId)
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
          .map((c) => ({ ...c }))
      : [];

    const chipInTotalCents = canSeeChipInTotal
      ? Array.from(this.store.chipIns.values())
          .filter((c) => c.eventId === eventId)
          .reduce((sum, item) => sum + item.amountCents, 0)
      : 0;

    return {
      event: { ...event, chipInBreakdown: [...event.chipInBreakdown] },
      courses: Array.from(this.store.courses.values())
        .filter((c) => c.eventId === eventId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ ...c })),
      announcements: Array.from(this.store.announcements.values())
        .filter((a) => a.eventId === eventId)
        .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.createdAt.localeCompare(a.createdAt))
        .map((a) => ({ ...a })),
      rounds: Array.from(this.store.rounds.values())
        .filter((r) => r.eventId === eventId)
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map((r) => ({ ...r })),
      teams: Array.from(this.store.teams.values())
        .filter((t) => t.eventId === eventId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ ...t })),
      participants: Array.from(this.store.participants.values())
        .filter((p) => p.eventId === eventId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((p) => ({ ...p })),
      legs: Array.from(this.store.legs.values())
        .filter((l) => l.eventId === eventId)
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map((l) => ({ ...l })),
      supplyItems: Array.from(this.store.supplyItems.values())
        .filter((s) => s.eventId === eventId)
        .map((s) => ({ ...s })),
      supplyClaims: Array.from(this.store.supplyClaims.values())
        .filter((c) => c.eventId === eventId)
        .map((c) => ({ ...c })),
      badgeDefinitions: Array.from(this.store.badgeDefinitions.values())
        .filter((b) => b.eventId === eventId)
        .map((b) => ({ ...b })),
      badgeAwards: Array.from(this.store.badgeAwards.values())
        .filter((b) => b.eventId === eventId)
        .map((b) => ({ ...b })),
      chipInTotalCents,
      chipIns,
    };
  }

  async getChipInSummary(eventId: string): Promise<number> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    return Array.from(this.store.chipIns.values())
      .filter((c) => c.eventId === eventId)
      .reduce((sum, item) => sum + item.amountCents, 0);
  }

  async getChipIns(eventId: string): Promise<ChipIn[]> {
    this.requireGrant(eventId, ['organizer']);
    return Array.from(this.store.chipIns.values())
      .filter((c) => c.eventId === eventId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .map((c) => ({ ...c }));
  }

  async updateEvent(
    eventId: string,
    patch: Partial<Omit<EventRecord, 'id' | 'slug' | 'createdAt'>>,
  ): Promise<EventRecord> {
    this.requireGrant(eventId, ['organizer']);
    const existing = this.store.events.get(eventId);
    if (!existing) throw new EventAccessError('NOT_FOUND', 'Event not found.');
    const updated: EventRecord = { ...existing, ...patch };
    this.store.events.set(eventId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async upsertCourse(
    eventId: string,
    course: Omit<Course, 'id' | 'eventId'> & { id?: string },
  ): Promise<Course> {
    this.requireGrant(eventId, ['organizer']);
    validateHttpsUrl(course.externalRouteUrl, 'externalRouteUrl');
    const id = course.id ?? generateId();
    const record: Course = { ...course, id, eventId };
    this.store.courses.set(id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async deleteCourse(eventId: string, courseId: string): Promise<void> {
    this.requireGrant(eventId, ['organizer']);
    this.store.courses.delete(courseId);
    for (const leg of this.store.legs.values()) {
      if (leg.eventId === eventId && leg.courseId === courseId) {
        leg.courseId = null;
      }
    }
    this.store.notify(eventId);
  }

  async createAnnouncement(
    eventId: string,
    data: Pick<Announcement, 'title' | 'body' | 'isPinned'>,
  ): Promise<Announcement> {
    this.requireGrant(eventId, ['organizer']);
    const record: Announcement = {
      id: generateId(),
      eventId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.store.announcements.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async updateAnnouncement(
    eventId: string,
    announcementId: string,
    patch: Partial<Pick<Announcement, 'title' | 'body' | 'isPinned'>>,
  ): Promise<Announcement> {
    this.requireGrant(eventId, ['organizer']);
    const existing = this.store.announcements.get(announcementId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Announcement not found.');
    }
    const updated = { ...existing, ...patch };
    this.store.announcements.set(announcementId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async deleteAnnouncement(eventId: string, announcementId: string): Promise<void> {
    this.requireGrant(eventId, ['organizer']);
    this.store.announcements.delete(announcementId);
    this.store.notify(eventId);
  }

  async createParticipant(
    eventId: string,
    data: Omit<Participant, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<Participant> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    if (
      data.availableFromRound < 1 ||
      data.availableToRound > 10 ||
      data.availableFromRound > data.availableToRound
    ) {
      throw new EventAccessError('VALIDATION_ERROR', 'Invalid Round attendance window.');
    }
    const record: Participant = {
      id: generateId(),
      eventId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.store.participants.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async updateParticipant(
    eventId: string,
    participantId: string,
    patch: Partial<Omit<Participant, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<Participant> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    const existing = this.store.participants.get(participantId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Participant not found.');
    }
    const updated = { ...existing, ...patch };
    if (
      updated.availableFromRound < 1 ||
      updated.availableToRound > 10 ||
      updated.availableFromRound > updated.availableToRound
    ) {
      throw new EventAccessError('VALIDATION_ERROR', 'Invalid Round attendance window.');
    }
    this.store.participants.set(participantId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async deleteParticipant(eventId: string, participantId: string): Promise<void> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    this.store.participants.delete(participantId);
    this.store.notify(eventId);
  }

  async createTeam(
    eventId: string,
    data: Omit<Team, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<Team> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    const record: Team = {
      id: generateId(),
      eventId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.store.teams.set(record.id, record);
    this.store.seedTeamLegs(eventId, record.id);
    this.store.notify(eventId);
    return { ...record };
  }

  async updateTeam(
    eventId: string,
    teamId: string,
    patch: Partial<Omit<Team, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<Team> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    const existing = this.store.teams.get(teamId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Team not found.');
    }
    const updated = { ...existing, ...patch };
    this.store.teams.set(teamId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async deleteTeam(eventId: string, teamId: string): Promise<void> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    this.store.teams.delete(teamId);
    for (const [legId, leg] of this.store.legs.entries()) {
      if (leg.teamId === teamId) this.store.legs.delete(legId);
    }
    for (const participant of this.store.participants.values()) {
      if (participant.teamId === teamId) participant.teamId = null;
    }
    this.store.notify(eventId);
  }

  async leaveTeam(participantId: string): Promise<void> {
    const participant = this.store.participants.get(participantId);
    if (!participant) {
      throw new EventAccessError('NOT_FOUND', 'Participant not found.');
    }
    this.requireGrant(participant.eventId, ['participant', 'organizer']);
    const oldTeamId = participant.teamId;
    if (!oldTeamId) return;

    participant.teamId = null;

    for (const leg of this.store.legs.values()) {
      if (
        leg.teamId === oldTeamId &&
        leg.runnerId === participantId &&
        leg.status === 'scheduled'
      ) {
        leg.runnerId = null;
      }
    }

    const remainingParticipants = Array.from(this.store.participants.values()).filter(
      (p) => p.teamId === oldTeamId,
    ).length;
    const completedLegs = Array.from(this.store.legs.values()).filter(
      (l) => l.teamId === oldTeamId && l.status === 'completed',
    ).length;

    if (remainingParticipants === 0 && completedLegs === 0) {
      this.store.teams.delete(oldTeamId);
      for (const [legId, leg] of this.store.legs.entries()) {
        if (leg.teamId === oldTeamId) {
          this.store.legs.delete(legId);
        }
      }
    }

    this.store.notify(participant.eventId);
  }

  async updateLeg(
    eventId: string,
    legId: string,
    patch: Partial<Omit<Leg, 'id' | 'eventId' | 'teamId' | 'roundNumber'>>,
  ): Promise<Leg> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    validateHttpsUrl(patch.externalActivityUrl, 'externalActivityUrl');
    const existing = this.store.legs.get(legId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Leg not found.');
    }
    if (patch.durationSeconds !== undefined && patch.durationSeconds !== null && patch.durationSeconds <= 0) {
      throw new EventAccessError('VALIDATION_ERROR', 'durationSeconds must be positive.');
    }
    const updated: Leg = { ...existing, ...patch };
    this.store.legs.set(legId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async applyLegMutation(input: ApplyLegMutationInput): Promise<ApplyLegMutationResult> {
    this.requireGrant(input.eventId, ['participant', 'organizer']);
    validateHttpsUrl(input.externalActivityUrl, 'externalActivityUrl');
    if (input.durationSeconds !== null && input.durationSeconds <= 0) {
      throw new EventAccessError('VALIDATION_ERROR', 'durationSeconds must be positive.');
    }

    const current = this.store.legs.get(input.legId);
    if (!current || current.eventId !== input.eventId) {
      throw new EventAccessError('NOT_FOUND', 'Leg not found.');
    }

    const isOrganizer = this.store.hasGrant(this.authUid, input.eventId, ['organizer']);

    // 1. Idempotency
    if (current.lastMutationId && current.lastMutationId === input.mutationId) {
      return { applied: true, reason: 'duplicate', leg: { ...current } };
    }

    const incomingMs = Date.parse(input.clientUpdatedAt);
    const currentMs = Date.parse(current.clientUpdatedAt);

    // 2. Organizer precedence
    if (!isOrganizer && current.updatedByOrganizer && incomingMs <= currentMs) {
      return { applied: false, reason: 'stale_or_overridden', leg: { ...current } };
    }

    // 3. Participant vs Participant
    if (!isOrganizer) {
      if (incomingMs < currentMs) {
        return { applied: false, reason: 'stale_or_overridden', leg: { ...current } };
      }
      if (
        current.status === 'completed' &&
        input.status === 'out_on_course' &&
        !input.isExplicitRevert
      ) {
        return { applied: false, reason: 'stale_or_overridden', leg: { ...current } };
      }
    }

    const updated: Leg = {
      ...current,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationSeconds: input.durationSeconds,
      courseId: input.courseId ?? current.courseId,
      externalActivityUrl: input.externalActivityUrl,
      clientUpdatedAt: input.clientUpdatedAt,
      lastMutationId: input.mutationId,
      updatedByOrganizer: isOrganizer,
    };

    this.store.legs.set(updated.id, updated);
    this.store.notify(input.eventId);
    return { applied: true, reason: 'applied', leg: { ...updated } };
  }

  async startRound(
    eventId: string,
    roundNumber: number,
    excludeLegIds: string[] = [],
    startedAt: string = new Date().toISOString(),
  ): Promise<number> {
    this.requireGrant(eventId, ['organizer']);
    const excluded = new Set(excludeLegIds);

    for (const round of this.store.rounds.values()) {
      if (round.eventId === eventId && round.roundNumber === roundNumber) {
        round.startedAt = startedAt;
      }
    }

    let startedCount = 0;
    for (const leg of this.store.legs.values()) {
      if (
        leg.eventId === eventId &&
        leg.roundNumber === roundNumber &&
        leg.status === 'scheduled' &&
        leg.runnerId !== null &&
        !excluded.has(leg.id)
      ) {
        leg.status = 'out_on_course';
        leg.startedAt = startedAt;
        leg.clientUpdatedAt = startedAt;
        leg.updatedByOrganizer = true;
        startedCount += 1;
      }
    }

    this.store.notify(eventId);
    return startedCount;
  }

  async createSupplyItem(
    eventId: string,
    data: Omit<SupplyItem, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<SupplyItem> {
    const isOrganizer = this.store.hasGrant(this.authUid, eventId, ['organizer']);
    if (data.isWishlist) {
      if (!isOrganizer) {
        throw new EventAccessError('FORBIDDEN', 'Only Organizers can create wish-list Supplies.');
      }
    } else {
      this.requireGrant(eventId, ['participant', 'organizer']);
    }

    if (
      data.targetSlots !== null &&
      (!Number.isInteger(data.targetSlots) || data.targetSlots < 1)
    ) {
      throw new EventAccessError(
        'VALIDATION_ERROR',
        'targetSlots must be null or an integer of at least 1.',
      );
    }

    const record: SupplyItem = {
      id: generateId(),
      eventId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.store.supplyItems.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async updateSupplyItem(
    eventId: string,
    supplyItemId: string,
    patch: Partial<Omit<SupplyItem, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<SupplyItem> {
    const existing = this.store.supplyItems.get(supplyItemId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Supply item not found.');
    }
    const isOrganizer = this.store.hasGrant(this.authUid, eventId, ['organizer']);
    const nextIsWishlist = patch.isWishlist ?? existing.isWishlist;
    if (existing.isWishlist || nextIsWishlist) {
      if (!isOrganizer) {
        throw new EventAccessError('FORBIDDEN', 'Only Organizers can edit wish-list Supplies.');
      }
    } else {
      this.requireGrant(eventId, ['participant', 'organizer']);
    }

    const updated: SupplyItem = { ...existing, ...patch };
    if (
      updated.targetSlots !== null &&
      (!Number.isInteger(updated.targetSlots) || updated.targetSlots < 1)
    ) {
      throw new EventAccessError(
        'VALIDATION_ERROR',
        'targetSlots must be null or an integer of at least 1.',
      );
    }
    this.store.supplyItems.set(supplyItemId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async deleteSupplyItem(eventId: string, supplyItemId: string): Promise<void> {
    const existing = this.store.supplyItems.get(supplyItemId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Supply item not found.');
    }
    const isOrganizer = this.store.hasGrant(this.authUid, eventId, ['organizer']);
    if (existing.isWishlist) {
      if (!isOrganizer) {
        throw new EventAccessError('FORBIDDEN', 'Only Organizers can delete wish-list Supplies.');
      }
    } else {
      this.requireGrant(eventId, ['participant', 'organizer']);
    }

    this.store.supplyItems.delete(supplyItemId);
    for (const [claimId, claim] of this.store.supplyClaims.entries()) {
      if (claim.supplyItemId === supplyItemId) {
        this.store.supplyClaims.delete(claimId);
      }
    }
    this.store.notify(eventId);
  }

  async createSupplyClaim(
    eventId: string,
    data: Omit<SupplyClaim, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<SupplyClaim> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    const record: SupplyClaim = {
      id: generateId(),
      eventId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.store.supplyClaims.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async deleteSupplyClaim(eventId: string, supplyClaimId: string): Promise<void> {
    this.requireGrant(eventId, ['participant', 'organizer']);
    this.store.supplyClaims.delete(supplyClaimId);
    this.store.notify(eventId);
  }

  async createChipIn(
    eventId: string,
    data: Omit<ChipIn, 'id' | 'eventId' | 'recordedAt'>,
  ): Promise<ChipIn> {
    this.requireGrant(eventId, ['organizer']);
    if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
      throw new EventAccessError('VALIDATION_ERROR', 'amountCents must be a positive integer.');
    }
    const record: ChipIn = {
      id: generateId(),
      eventId,
      ...data,
      recordedAt: new Date().toISOString(),
    };
    this.store.chipIns.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async updateChipIn(
    eventId: string,
    chipInId: string,
    patch: Partial<Omit<ChipIn, 'id' | 'eventId' | 'recordedAt'>>,
  ): Promise<ChipIn> {
    this.requireGrant(eventId, ['organizer']);
    const existing = this.store.chipIns.get(chipInId);
    if (!existing || existing.eventId !== eventId) {
      throw new EventAccessError('NOT_FOUND', 'Chip-in entry not found.');
    }
    if (
      patch.amountCents !== undefined &&
      (!Number.isInteger(patch.amountCents) || patch.amountCents <= 0)
    ) {
      throw new EventAccessError('VALIDATION_ERROR', 'amountCents must be a positive integer.');
    }
    const updated: ChipIn = { ...existing, ...patch };
    this.store.chipIns.set(chipInId, updated);
    this.store.notify(eventId);
    return { ...updated };
  }

  async deleteChipIn(eventId: string, chipInId: string): Promise<void> {
    this.requireGrant(eventId, ['organizer']);
    const existing = this.store.chipIns.get(chipInId);
    if (existing && existing.eventId === eventId) {
      this.store.chipIns.delete(chipInId);
      this.store.notify(eventId);
    }
  }

  async createBadgeDefinition(
    eventId: string,
    data: Omit<BadgeDefinition, 'id' | 'eventId'>,
  ): Promise<BadgeDefinition> {
    this.requireGrant(eventId, ['organizer']);
    const record: BadgeDefinition = {
      id: generateId(),
      eventId,
      ...data,
    };
    this.store.badgeDefinitions.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async deleteBadgeDefinition(eventId: string, badgeDefinitionId: string): Promise<void> {
    this.requireGrant(eventId, ['organizer']);
    this.store.badgeDefinitions.delete(badgeDefinitionId);
    this.store.notify(eventId);
  }

  async createBadgeAward(
    eventId: string,
    data: Omit<BadgeAward, 'id' | 'eventId' | 'awardedAt'>,
  ): Promise<BadgeAward> {
    this.requireGrant(eventId, ['organizer']);
    const hasParticipant = data.participantId !== null;
    const hasTeam = data.teamId !== null;
    if (hasParticipant === hasTeam) {
      throw new EventAccessError(
        'VALIDATION_ERROR',
        'Badge award must target either a Participant or a Team, not both or neither.',
      );
    }
    const record: BadgeAward = {
      id: generateId(),
      eventId,
      ...data,
      awardedAt: new Date().toISOString(),
    };
    this.store.badgeAwards.set(record.id, record);
    this.store.notify(eventId);
    return { ...record };
  }

  async deleteBadgeAward(eventId: string, badgeAwardId: string): Promise<void> {
    this.requireGrant(eventId, ['organizer']);
    this.store.badgeAwards.delete(badgeAwardId);
    this.store.notify(eventId);
  }

  subscribeToEvent(eventId: string, onChange: () => void): Unsubscribe {
    return this.store.subscribe(eventId, onChange);
  }
}

export function createSeededInMemoryEventApi(): {
  store: InMemoryEventStore;
  api: InMemoryEventApi;
  eventId: string;
} {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'WINTER50K',
    organizerPasscode: 'ORGANIZER50K',
    dashboardToken: 'basecamp-dashboard-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
    basecampAddress: '100 Basecamp Trail, Frost Harbor',
    parkingAmenitiesNotes: 'Free parking beside Basecamp; heated restrooms and hot water kettle inside.',
    coldWeatherTips: 'Dress for 15 degrees warmer than the thermometer, bring dry socks for between Rounds.',
    safetyFirstAidNotes: 'First-aid kit and hand warmers live at the Basecamp table.',
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
  });

  const api = new InMemoryEventApi(store);
  return { store, api, eventId };
}
