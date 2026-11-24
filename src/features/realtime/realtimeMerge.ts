import type {
  Announcement,
  BadgeAward,
  BadgeDefinition,
  Course,
  EventSnapshot,
  Leg,
  Participant,
  Round,
  SupplyClaim,
  SupplyItem,
  Team,
} from '../../types/domain';
import type { RealtimeChangeEvent, RealtimeEventType } from './realtimeTypes';

function mergeCollection<T extends { id: string }>(
  items: readonly T[],
  eventType: RealtimeEventType,
  newRow: T | null,
  oldRow: { id: string } | null,
  sort?: (a: T, b: T) => number,
): T[] {
  let next: T[];
  if (eventType === 'DELETE') {
    const targetId = oldRow?.id ?? newRow?.id;
    if (!targetId) return [...items];
    next = items.filter((item) => item.id !== targetId);
  } else {
    if (!newRow) return [...items];
    const index = items.findIndex((item) => item.id === newRow.id);
    if (index === -1) {
      next = [...items, newRow];
    } else {
      next = [...items];
      next[index] = newRow;
    }
  }

  if (sort) {
    next.sort(sort);
  }
  return next;
}

const sortCourses = (a: Course, b: Course) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

const sortAnnouncements = (a: Announcement, b: Announcement) =>
  Number(b.isPinned) - Number(a.isPinned) || b.createdAt.localeCompare(a.createdAt);

const sortRounds = (a: Round, b: Round) => a.roundNumber - b.roundNumber;

const sortTeams = (a: Team, b: Team) => a.name.localeCompare(b.name);

const sortParticipants = (a: Participant, b: Participant) =>
  a.displayName.localeCompare(b.displayName);

const sortLegs = (a: Leg, b: Leg) =>
  a.teamId.localeCompare(b.teamId) || a.roundNumber - b.roundNumber;

const sortSupplyItems = (a: SupplyItem, b: SupplyItem) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const sortSupplyClaims = (a: SupplyClaim, b: SupplyClaim) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const sortBadgeDefinitions = (a: BadgeDefinition, b: BadgeDefinition) =>
  Number(b.isPreset) - Number(a.isPreset) || a.name.localeCompare(b.name);

const sortBadgeAwards = (a: BadgeAward, b: BadgeAward) =>
  b.awardedAt.localeCompare(a.awardedAt) || a.id.localeCompare(b.id);

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  if (items.length <= 1) return items;
  const seen = new Map<string, T>();
  let hasDuplicate = false;
  for (const item of items) {
    if (seen.has(item.id)) {
      hasDuplicate = true;
    }
    seen.set(item.id, item);
  }
  return hasDuplicate ? Array.from(seen.values()) : items;
}

/**
 * Deduplicates all keyed collections in an EventSnapshot by id (keeping the newest copy).
 * Protects local optimistic/post-await setSnapshot appends when a Realtime INSERT arrives first.
 */
export function dedupeSnapshot(snapshot: EventSnapshot): EventSnapshot {
  const courses = dedupeById(snapshot.courses);
  const announcements = dedupeById(snapshot.announcements);
  const rounds = dedupeById(snapshot.rounds);
  const teams = dedupeById(snapshot.teams);
  const participants = dedupeById(snapshot.participants);
  const legs = dedupeById(snapshot.legs);
  const supplyItems = dedupeById(snapshot.supplyItems);
  const supplyClaims = dedupeById(snapshot.supplyClaims);
  const badgeDefinitions = dedupeById(snapshot.badgeDefinitions);
  const badgeAwards = dedupeById(snapshot.badgeAwards);
  const chipIns = dedupeById(snapshot.chipIns);

  if (
    courses === snapshot.courses &&
    announcements === snapshot.announcements &&
    rounds === snapshot.rounds &&
    teams === snapshot.teams &&
    participants === snapshot.participants &&
    legs === snapshot.legs &&
    supplyItems === snapshot.supplyItems &&
    supplyClaims === snapshot.supplyClaims &&
    badgeDefinitions === snapshot.badgeDefinitions &&
    badgeAwards === snapshot.badgeAwards &&
    chipIns === snapshot.chipIns
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    courses,
    announcements,
    rounds,
    teams,
    participants,
    legs,
    supplyItems,
    supplyClaims,
    badgeDefinitions,
    badgeAwards,
    chipIns,
  };
}

export function applyRealtimeChangeToSnapshot(
  snapshot: EventSnapshot,
  change: RealtimeChangeEvent,
): EventSnapshot {
  const eventId = snapshot.event.id;

  if (change.table === 'events') {
    if (change.eventType === 'DELETE' || !change.newRow) {
      return snapshot;
    }
    if (change.newRow.id !== eventId) {
      return snapshot;
    }
    return {
      ...snapshot,
      event: change.newRow,
    };
  }

  // Guard against cross-Event payloads for all event_id-scoped tables
  if (change.newRow && change.newRow.eventId !== eventId) {
    return snapshot;
  }
  if (
    change.eventType === 'DELETE' &&
    change.oldRow &&
    'eventId' in change.oldRow &&
    change.oldRow.eventId &&
    change.oldRow.eventId !== eventId
  ) {
    return snapshot;
  }

  switch (change.table) {
    case 'legs':
      return {
        ...snapshot,
        legs: mergeCollection(snapshot.legs, change.eventType, change.newRow, change.oldRow, sortLegs),
      };
    case 'rounds':
      return {
        ...snapshot,
        rounds: mergeCollection(
          snapshot.rounds,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortRounds,
        ),
      };
    case 'teams':
      return {
        ...snapshot,
        teams: mergeCollection(
          snapshot.teams,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortTeams,
        ),
      };
    case 'participants':
      return {
        ...snapshot,
        participants: mergeCollection(
          snapshot.participants,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortParticipants,
        ),
      };
    case 'announcements':
      return {
        ...snapshot,
        announcements: mergeCollection(
          snapshot.announcements,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortAnnouncements,
        ),
      };
    case 'courses':
      return {
        ...snapshot,
        courses: mergeCollection(
          snapshot.courses,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortCourses,
        ),
      };
    case 'supply_items':
      return {
        ...snapshot,
        supplyItems: mergeCollection(
          snapshot.supplyItems,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortSupplyItems,
        ),
      };
    case 'supply_claims':
      return {
        ...snapshot,
        supplyClaims: mergeCollection(
          snapshot.supplyClaims,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortSupplyClaims,
        ),
      };
    case 'badge_definitions':
      return {
        ...snapshot,
        badgeDefinitions: mergeCollection(
          snapshot.badgeDefinitions,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortBadgeDefinitions,
        ),
      };
    case 'badge_awards':
      return {
        ...snapshot,
        badgeAwards: mergeCollection(
          snapshot.badgeAwards,
          change.eventType,
          change.newRow,
          change.oldRow,
          sortBadgeAwards,
        ),
      };
    default: {
      const _exhaustive: never = change;
      return _exhaustive;
    }
  }
}
