export type GrantScope = 'participant' | 'organizer' | 'dashboard';

export type RsvpStatus = 'going_runner' | 'going_supporter' | 'maybe' | 'cant_make_it';

export type LegStatus = 'scheduled' | 'out_on_course' | 'completed';

export type SupplyCategory = 'food' | 'drinks' | 'gear_first_aid';

export type SecretType = 'invite_code' | 'organizer_passcode' | 'dashboard_token';

export interface ChipInBreakdownItem {
  label: string;
  amountCents: number;
}

export interface EventRecord {
  id: string;
  slug: string;
  name: string;
  eventDate: string | null;
  startTime: string | null;
  timezone: string | null;
  isActive: boolean;
  basecampName: string | null;
  basecampAddress: string | null;
  basecampMapsUrl: string | null;
  parkingAmenitiesNotes: string | null;
  coldWeatherTips: string | null;
  safetyFirstAidNotes: string | null;
  stravaClubUrl: string | null;
  recapNote: string | null;
  chipInTargetCents: number;
  chipInSuggestedCents: number | null;
  chipInBreakdown: ChipInBreakdownItem[];
  venmoHandle: string | null;
  zelleHandle: string | null;
  createdAt: string;
}

export interface SessionGrant {
  authUid: string;
  eventId: string;
  scope: GrantScope;
  grantedAt: string;
}

export interface Course {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  distanceKm: number;
  isPrimary: boolean;
  gpxXml: string | null;
  externalRouteUrl: string | null;
  sortOrder: number;
}

export interface Announcement {
  id: string;
  eventId: string;
  title: string | null;
  body: string;
  isPinned: boolean;
  createdAt: string;
}

export interface Round {
  id: string;
  eventId: string;
  roundNumber: number;
  scheduledStartAt: string;
  startedAt: string | null;
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  tagline: string | null;
  colorHex: string | null;
  emoji: string | null;
  isOpen: boolean;
  lookingNote: string | null;
  createdAt: string;
}

export interface Participant {
  id: string;
  eventId: string;
  displayName: string;
  rsvpStatus: RsvpStatus;
  teamId: string | null;
  availableFromRound: number;
  availableToRound: number;
  rough5kMinutes: number | null;
  isFirst5k: boolean;
  dietaryNotes: string | null;
  showTimesOnLeaderboard: boolean;
  createdAt: string;
}

export interface Leg {
  id: string;
  eventId: string;
  teamId: string;
  roundNumber: number;
  runnerId: string | null;
  courseId: string | null;
  status: LegStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  externalActivityUrl: string | null;
  clientUpdatedAt: string;
  lastMutationId: string | null;
  updatedByOrganizer: boolean;
}

export interface SupplyItem {
  id: string;
  eventId: string;
  category: SupplyCategory;
  name: string;
  isWishlist: boolean;
  targetSlots: number | null;
  createdByParticipantId: string | null;
  createdAt: string;
}

export interface SupplyClaim {
  id: string;
  eventId: string;
  supplyItemId: string;
  participantId: string;
  note: string | null;
  createdAt: string;
}

export interface ChipIn {
  id: string;
  eventId: string;
  participantId: string | null;
  amountCents: number;
  note: string | null;
  recordedAt: string;
}

export interface BadgeDefinition {
  id: string;
  eventId: string;
  name: string;
  emoji: string;
  description: string | null;
  isPreset: boolean;
}

export interface BadgeAward {
  id: string;
  eventId: string;
  badgeDefinitionId: string;
  participantId: string | null;
  teamId: string | null;
  note: string | null;
  awardedAt: string;
}

export interface EventSnapshot {
  event: EventRecord;
  courses: Course[];
  announcements: Announcement[];
  rounds: Round[];
  teams: Team[];
  participants: Participant[];
  legs: Leg[];
  supplyItems: SupplyItem[];
  supplyClaims: SupplyClaim[];
  badgeDefinitions: BadgeDefinition[];
  badgeAwards: BadgeAward[];
  chipInTotalCents: number;
  chipIns: ChipIn[];
}

export interface ApplyLegMutationInput {
  eventId: string;
  legId: string;
  mutationId: string;
  status: LegStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  courseId: string | null;
  externalActivityUrl: string | null;
  isExplicitRevert: boolean;
  clientUpdatedAt: string;
}

export interface ApplyLegMutationResult {
  applied: boolean;
  reason: 'applied' | 'duplicate' | 'stale_or_overridden';
  leg: Leg;
}

export interface CreateEventInput {
  slug: string;
  name: string;
  eventDate: string | null;
  startTime: string;
  timezone: string;
  inviteCode: string;
  organizerPasscode: string;
  dashboardToken: string;
  isActive?: boolean;
  basecampName?: string | null;
  basecampAddress?: string | null;
  basecampMapsUrl?: string | null;
  parkingAmenitiesNotes?: string | null;
  coldWeatherTips?: string | null;
  safetyFirstAidNotes?: string | null;
  stravaClubUrl?: string | null;
  chipInTargetCents?: number;
  chipInSuggestedCents?: number | null;
  chipInBreakdown?: ChipInBreakdownItem[];
  venmoHandle?: string | null;
  zelleHandle?: string | null;
}

export type EventAccessErrorCode =
  | 'INVALID_INVITE_CODE'
  | 'INVALID_PASSCODE'
  | 'INVALID_DASHBOARD_TOKEN'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR';

export class EventAccessError extends Error {
  readonly code: EventAccessErrorCode;

  constructor(code: EventAccessErrorCode, message: string) {
    super(message);
    this.name = 'EventAccessError';
    this.code = code;
  }
}

export const PRESET_BADGE_DEFINITIONS: ReadonlyArray<Omit<BadgeDefinition, 'id' | 'eventId'>> = [
  {
    name: 'Best Cold-Weather Outfit',
    emoji: '🧣',
    description: 'Most iconic winter running kit on the Course.',
    isPreset: true,
  },
  {
    name: 'Cheer Squad MVP',
    emoji: '📣',
    description: 'Brought unmatched energy and encouragement at Basecamp.',
    isPreset: true,
  },
  {
    name: 'Best Snack Contributor',
    emoji: '🥨',
    description: 'Kept Basecamp fueled with top-tier Supplies.',
    isPreset: true,
  },
  {
    name: 'Most Encouraging',
    emoji: '💛',
    description: 'Lifted up Runners all day across every Round.',
    isPreset: true,
  },
  {
    name: 'Best Vibes at Basecamp',
    emoji: '🔥',
    description: 'Made Basecamp the warmest place to hang out between Rounds.',
    isPreset: true,
  },
];
