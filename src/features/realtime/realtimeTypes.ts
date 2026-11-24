import type {
  Announcement,
  BadgeAward,
  BadgeDefinition,
  Course,
  EventRecord,
  Leg,
  Participant,
  Round,
  SupplyClaim,
  SupplyItem,
  Team,
} from '../../types/domain';

export const REALTIME_TABLES = [
  'legs',
  'rounds',
  'teams',
  'participants',
  'announcements',
  'badge_awards',
  'badge_definitions',
  'supply_items',
  'supply_claims',
  'events',
  'courses',
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeTableRowMap {
  legs: Leg;
  rounds: Round;
  teams: Team;
  participants: Participant;
  announcements: Announcement;
  badge_awards: BadgeAward;
  badge_definitions: BadgeDefinition;
  supply_items: SupplyItem;
  supply_claims: SupplyClaim;
  events: EventRecord;
  courses: Course;
}

export type RealtimeOldRow<T extends RealtimeTable> = Partial<RealtimeTableRowMap[T]> & {
  id: string;
};

export interface RealtimeChangeEventFor<T extends RealtimeTable = RealtimeTable> {
  table: T;
  eventType: RealtimeEventType;
  newRow: RealtimeTableRowMap[T] | null;
  oldRow: RealtimeOldRow<T> | null;
}

export type RealtimeChangeEvent = {
  [K in RealtimeTable]: RealtimeChangeEventFor<K>;
}[RealtimeTable];

export type RealtimeConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'paused'
  | 'reconnecting'
  | 'disconnected';

export interface RealtimeSubscriptionHandlers {
  onChange: (event: RealtimeChangeEvent) => void;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
}
