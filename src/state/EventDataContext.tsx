import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { EventApi } from '../lib/eventApi';
import type { EventSnapshot, GrantScope } from '../types/domain';

export interface EventDataContextValue {
  eventApi: EventApi;
  eventId: string;
  snapshot: EventSnapshot;
  grants: GrantScope[];
  isOrganizer: boolean;
  isOnline: boolean;
  refreshing: boolean;
  lastSyncedAt: string | null;
  headerRoundSlot: ReactNode;
  headerStatusSlot: ReactNode;
  setHeaderRoundSlot: (node: ReactNode) => void;
  setHeaderStatusSlot: (node: ReactNode) => void;
  refreshSnapshot: () => Promise<EventSnapshot>;
  refreshGrants: () => Promise<GrantScope[]>;
  setSnapshot: Dispatch<SetStateAction<EventSnapshot>>;
}

const EventDataContext = createContext<EventDataContextValue | null>(null);

interface EventDataProviderProps {
  eventApi: EventApi;
  eventId: string;
  initialSnapshot: EventSnapshot;
  initialGrants: GrantScope[];
  children: ReactNode;
}

export function EventDataProvider({
  eventApi,
  eventId,
  initialSnapshot,
  initialGrants,
  children,
}: EventDataProviderProps) {
  const [snapshot, setSnapshot] = useState<EventSnapshot>(initialSnapshot);
  const [grants, setGrants] = useState<GrantScope[]>(initialGrants);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => new Date().toISOString());
  const [headerRoundSlot, setHeaderRoundSlot] = useState<ReactNode>(null);
  const [headerStatusSlot, setHeaderStatusSlot] = useState<ReactNode>(null);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    setGrants(initialGrants);
  }, [initialGrants]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await eventApi.getEventSnapshot(eventId);
      setSnapshot(next);
      setLastSyncedAt(new Date().toISOString());
      return next;
    } finally {
      setRefreshing(false);
    }
  }, [eventApi, eventId]);

  const refreshGrants = useCallback(async () => {
    const nextGrants = await eventApi.getSessionGrants(eventId);
    setGrants(nextGrants);
    return nextGrants;
  }, [eventApi, eventId]);

  const value = useMemo<EventDataContextValue>(
    () => ({
      eventApi,
      eventId,
      snapshot,
      grants,
      isOrganizer: grants.includes('organizer'),
      isOnline,
      refreshing,
      lastSyncedAt,
      headerRoundSlot,
      headerStatusSlot,
      setHeaderRoundSlot,
      setHeaderStatusSlot,
      refreshSnapshot,
      refreshGrants,
      setSnapshot,
    }),
    [
      eventApi,
      eventId,
      snapshot,
      grants,
      isOnline,
      refreshing,
      lastSyncedAt,
      headerRoundSlot,
      headerStatusSlot,
      refreshSnapshot,
      refreshGrants,
    ],
  );

  return <EventDataContext.Provider value={value}>{children}</EventDataContext.Provider>;
}

export function useEventData(): EventDataContextValue {
  const ctx = useContext(EventDataContext);
  if (!ctx) {
    throw new Error('useEventData must be used inside an EventDataProvider.');
  }
  return ctx;
}
