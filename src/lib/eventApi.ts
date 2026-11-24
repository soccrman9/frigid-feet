import type {
  Announcement,
  ApplyLegMutationInput,
  ApplyLegMutationResult,
  BadgeAward,
  BadgeDefinition,
  ChipIn,
  Course,
  EventRecord,
  EventSnapshot,
  GrantScope,
  Leg,
  Participant,
  SecretType,
  SupplyClaim,
  SupplyItem,
  Team,
} from '../types/domain';

import type { RealtimeSubscriptionHandlers } from '../features/realtime/realtimeTypes';

export type Unsubscribe = () => void;

export interface EventApi {
  // Auth & Grants
  ensureSession(): Promise<string>;
  getActiveEventSlug(): Promise<string | null>;
  getGrantedEventBySlug(slug: string): Promise<{ eventId: string; grants: GrantScope[] } | null>;
  getSessionGrants(eventId: string): Promise<GrantScope[]>;
  unlockEvent(slug: string, code: string): Promise<string>;
  unlockOrganizer(eventId: string, passcode: string): Promise<boolean>;
  unlockDashboard(token: string): Promise<string>;
  rotateEventSecret(eventId: string, secretType: SecretType, newValue: string): Promise<void>;
  pingHeartbeat(): Promise<boolean>;

  // Reads
  getEventSnapshot(eventId: string): Promise<EventSnapshot>;
  getChipInSummary(eventId: string): Promise<number>;
  getChipIns(eventId: string): Promise<ChipIn[]>;

  // Event, Courses, Announcements (Organizer writes)
  updateEvent(
    eventId: string,
    patch: Partial<Omit<EventRecord, 'id' | 'slug' | 'createdAt'>>,
  ): Promise<EventRecord>;
  upsertCourse(
    eventId: string,
    course: Omit<Course, 'id' | 'eventId'> & { id?: string },
  ): Promise<Course>;
  deleteCourse(eventId: string, courseId: string): Promise<void>;
  createAnnouncement(
    eventId: string,
    data: Pick<Announcement, 'title' | 'body' | 'isPinned'>,
  ): Promise<Announcement>;
  updateAnnouncement(
    eventId: string,
    announcementId: string,
    patch: Partial<Pick<Announcement, 'title' | 'body' | 'isPinned'>>,
  ): Promise<Announcement>;
  deleteAnnouncement(eventId: string, announcementId: string): Promise<void>;

  // Participants & Teams (Participant + Organizer writes)
  createParticipant(
    eventId: string,
    data: Omit<Participant, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<Participant>;
  updateParticipant(
    eventId: string,
    participantId: string,
    patch: Partial<Omit<Participant, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<Participant>;
  deleteParticipant(eventId: string, participantId: string): Promise<void>;
  createTeam(
    eventId: string,
    data: Omit<Team, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<Team>;
  updateTeam(
    eventId: string,
    teamId: string,
    patch: Partial<Omit<Team, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<Team>;
  deleteTeam(eventId: string, teamId: string): Promise<void>;
  leaveTeam(participantId: string): Promise<void>;

  // Legs & Rounds
  updateLeg(
    eventId: string,
    legId: string,
    patch: Partial<Omit<Leg, 'id' | 'eventId' | 'teamId' | 'roundNumber'>>,
  ): Promise<Leg>;
  applyLegMutation(input: ApplyLegMutationInput): Promise<ApplyLegMutationResult>;
  startRound(
    eventId: string,
    roundNumber: number,
    excludeLegIds?: string[],
    startedAt?: string,
  ): Promise<number>;

  // Supplies
  createSupplyItem(
    eventId: string,
    data: Omit<SupplyItem, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<SupplyItem>;
  updateSupplyItem(
    eventId: string,
    supplyItemId: string,
    patch: Partial<Omit<SupplyItem, 'id' | 'eventId' | 'createdAt'>>,
  ): Promise<SupplyItem>;
  deleteSupplyItem(eventId: string, supplyItemId: string): Promise<void>;
  createSupplyClaim(
    eventId: string,
    data: Omit<SupplyClaim, 'id' | 'eventId' | 'createdAt'>,
  ): Promise<SupplyClaim>;
  deleteSupplyClaim(eventId: string, supplyClaimId: string): Promise<void>;

  // Chip-Ins (Organizer only)
  createChipIn(
    eventId: string,
    data: Omit<ChipIn, 'id' | 'eventId' | 'recordedAt'>,
  ): Promise<ChipIn>;
  updateChipIn(
    eventId: string,
    chipInId: string,
    patch: Partial<Omit<ChipIn, 'id' | 'eventId' | 'recordedAt'>>,
  ): Promise<ChipIn>;
  deleteChipIn(eventId: string, chipInId: string): Promise<void>;

  // Badges (Organizer only)
  createBadgeDefinition(
    eventId: string,
    data: Omit<BadgeDefinition, 'id' | 'eventId'>,
  ): Promise<BadgeDefinition>;
  deleteBadgeDefinition(eventId: string, badgeDefinitionId: string): Promise<void>;
  createBadgeAward(
    eventId: string,
    data: Omit<BadgeAward, 'id' | 'eventId' | 'awardedAt'>,
  ): Promise<BadgeAward>;
  deleteBadgeAward(eventId: string, badgeAwardId: string): Promise<void>;

  // Single-channel Realtime subscription for all 11 live Event tables
  subscribeToEvent?(eventId: string, handlers: RealtimeSubscriptionHandlers): Unsubscribe;
}
