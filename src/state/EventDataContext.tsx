import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { EventApi } from '../lib/eventApi';
import type {
  ApplyLegMutationInput,
  ApplyLegMutationResult,
  EventSnapshot,
  GrantScope,
  Leg,
  Participant,
} from '../types/domain';
import {
  clearSavedParticipantId,
  getSavedParticipantId,
  saveParticipantId,
} from '../features/participant/participantStorage';
import { applyRealtimeChangeToSnapshot, dedupeSnapshot } from '../features/realtime/realtimeMerge';
import type {
  RealtimeChangeEvent,
  RealtimeConnectionStatus,
} from '../features/realtime/realtimeTypes';
import { useEventRealtime } from '../features/realtime/useEventRealtime';
import {
  createLegMutationQueueEngine,
  type LegMutationQueueEngine,
  type UndoLegMutationOutcome,
} from '../features/offline/legMutationQueueEngine';
import {
  saveEventSnapshot,
  type OfflineLegMutationActionType,
  type QueuedLegMutation,
} from '../features/offline/offlineDb';
import { applyPendingMutationsToSnapshot } from '../features/offline/optimisticOverlay';
import type { SwUpdateAdapter } from '../features/offline/useSwUpdatePrompt';
import { generateMutationId } from '../features/race-day/raceDayUtils';

export type LegMutationActionType = OfflineLegMutationActionType;

export interface SubmitLegMutationMeta {
  actionType: LegMutationActionType;
  previousLegSnapshot: Leg;
}

export interface SubmitLegMutationOutcome {
  result: ApplyLegMutationResult;
  queuedOffline: boolean;
}

export type LegMutationHandler = (
  input: ApplyLegMutationInput,
  meta?: SubmitLegMutationMeta,
) => Promise<SubmitLegMutationOutcome>;

export interface StaleOverrideToastState {
  id: string;
  message: string;
}

export interface EventDataContextValue {
  eventApi: EventApi;
  eventId: string;
  snapshot: EventSnapshot;
  grants: GrantScope[];
  isOrganizer: boolean;
  organizerUnlocked: boolean;
  unlockOrganizer: (passcode: string) => Promise<boolean>;
  lockOrganizer: () => void;
  isOnline: boolean;
  isOfflineSnapshot: boolean;
  realtimeStatus: RealtimeConnectionStatus;
  refreshing: boolean;
  lastSyncedAt: string | null;
  pendingQueueCount: number;
  pendingQueueSyncing: boolean;
  staleOverrideToast: StaleOverrideToastState | null;
  dismissStaleOverrideToast: () => void;
  sessionNeedsReunlock: boolean;
  reunlockEvent: (inviteCode: string) => Promise<void>;
  swUpdateAdapter?: SwUpdateAdapter;
  activeParticipantId: string | null;
  activeParticipant: Participant | null;
  selectParticipant: (participantId: string) => void;
  clearParticipant: () => void;
  headerRoundSlot: ReactNode;
  headerStatusSlot: ReactNode;
  setHeaderRoundSlot: (node: ReactNode) => void;
  setHeaderStatusSlot: (node: ReactNode) => void;
  refreshSnapshot: () => Promise<EventSnapshot>;
  refreshGrants: () => Promise<GrantScope[]>;
  setSnapshot: Dispatch<SetStateAction<EventSnapshot>>;
  submitLegMutation: LegMutationHandler;
  enqueueLegMutation: LegMutationHandler;
  undoLegMutation: (
    mutationId: string,
    previousLegSnapshot: Leg,
  ) => Promise<UndoLegMutationOutcome>;
  flushLegQueueNow: () => Promise<void>;
}

const EventDataContext = createContext<EventDataContextValue | null>(null);

interface EventDataProviderProps {
  eventApi: EventApi;
  eventId: string;
  initialSnapshot: EventSnapshot;
  initialGrants: GrantScope[];
  initialLastSyncedAt?: string | null;
  initialIsOfflineSnapshot?: boolean;
  initialPendingQueue?: QueuedLegMutation[];
  queueBaseBackoffMs?: number;
  swUpdateAdapter?: SwUpdateAdapter;
  legMutationHandler?: LegMutationHandler;
  pauseRealtimeOnBackground?: boolean;
  realtimeBackgroundTimeoutMs?: number;
  children: ReactNode;
}

export function EventDataProvider({
  eventApi,
  eventId,
  initialSnapshot,
  initialGrants,
  initialLastSyncedAt,
  initialIsOfflineSnapshot = false,
  initialPendingQueue = [],
  queueBaseBackoffMs,
  swUpdateAdapter,
  legMutationHandler,
  pauseRealtimeOnBackground = true,
  realtimeBackgroundTimeoutMs,
  children,
}: EventDataProviderProps) {
  const [baseSnapshot, setBaseSnapshotRaw] = useState<EventSnapshot>(() =>
    dedupeSnapshot(initialSnapshot),
  );
  const [pendingQueue, setPendingQueue] = useState<QueuedLegMutation[]>(initialPendingQueue);
  const [grants, setGrants] = useState<GrantScope[]>(initialGrants);
  const [organizerUiLocked, setOrganizerUiLocked] = useState(false);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(() =>
    getSavedParticipantId(eventId),
  );
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isOfflineSnapshot, setIsOfflineSnapshot] = useState<boolean>(initialIsOfflineSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => initialLastSyncedAt ?? new Date().toISOString(),
  );
  const [staleOverrideToast, setStaleOverrideToast] = useState<StaleOverrideToastState | null>(
    null,
  );
  const [sessionNeedsReunlock, setSessionNeedsReunlock] = useState(false);
  const [headerRoundSlot, setHeaderRoundSlot] = useState<ReactNode>(null);
  const [headerStatusSlot, setHeaderStatusSlot] = useState<ReactNode>(null);

  const engineRef = useRef<LegMutationQueueEngine | null>(null);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const persistSnapshotToIdb = useCallback((next: EventSnapshot, syncedAt: string) => {
    void saveEventSnapshot(next, syncedAt).catch(() => undefined);
  }, []);

  const setSnapshot = useCallback<Dispatch<SetStateAction<EventSnapshot>>>(
    (updater) => {
      setBaseSnapshotRaw((prev) => {
        const next = dedupeSnapshot(typeof updater === 'function' ? updater(prev) : updater);
        const nowIso = new Date().toISOString();
        persistSnapshotToIdb(next, nowIso);
        return next;
      });
    },
    [persistSnapshotToIdb],
  );

  // Sync prop updates from parent routes
  useEffect(() => {
    const deduped = dedupeSnapshot(initialSnapshot);
    setBaseSnapshotRaw(deduped);
    if (!initialIsOfflineSnapshot) {
      const syncedAt = initialLastSyncedAt ?? new Date().toISOString();
      persistSnapshotToIdb(deduped, syncedAt);
    }
  }, [initialSnapshot, initialIsOfflineSnapshot, initialLastSyncedAt, persistSnapshotToIdb]);

  useEffect(() => {
    setGrants(initialGrants);
  }, [initialGrants]);

  useEffect(() => {
    setIsOfflineSnapshot(initialIsOfflineSnapshot);
  }, [initialIsOfflineSnapshot]);

  useEffect(() => {
    setOrganizerUiLocked(false);
    setActiveParticipantId(getSavedParticipantId(eventId));
    setSessionNeedsReunlock(false);
  }, [eventId]);

  // Derived snapshot overlays pending IndexedDB Leg mutations deterministically in FIFO order
  const snapshot = useMemo(
    () => applyPendingMutationsToSnapshot(baseSnapshot, pendingQueue),
    [baseSnapshot, pendingQueue],
  );

  const activeParticipant = useMemo(
    () =>
      activeParticipantId
        ? (snapshot.participants.find((participant) => participant.id === activeParticipantId) ??
          null)
        : null,
    [activeParticipantId, snapshot.participants],
  );

  // If a saved participant_id no longer exists on the server, clear it and fall back cleanly.
  useEffect(() => {
    if (activeParticipantId && !activeParticipant) {
      clearSavedParticipantId(eventId);
      setActiveParticipantId(null);
    }
  }, [activeParticipantId, activeParticipant, eventId]);

  const selectParticipant = useCallback(
    (participantId: string) => {
      saveParticipantId(eventId, participantId);
      setActiveParticipantId(participantId);
    },
    [eventId],
  );

  const clearParticipant = useCallback(() => {
    clearSavedParticipantId(eventId);
    setActiveParticipantId(null);
  }, [eventId]);

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
      const next = dedupeSnapshot(await eventApi.getEventSnapshot(eventId));
      const syncedAt = new Date().toISOString();
      setBaseSnapshotRaw(next);
      setLastSyncedAt(syncedAt);
      setIsOfflineSnapshot(false);
      persistSnapshotToIdb(next, syncedAt);
      return next;
    } finally {
      setRefreshing(false);
    }
  }, [eventApi, eventId, persistSnapshotToIdb]);

  // When returning online after an offline cold launch, calmly resync fresh Event data
  useEffect(() => {
    if (isOnline && isOfflineSnapshot && !sessionNeedsReunlock) {
      void refreshSnapshot().catch(() => undefined);
    }
  }, [isOnline, isOfflineSnapshot, sessionNeedsReunlock, refreshSnapshot]);

  const handleRealtimeChange = useCallback(
    (change: RealtimeChangeEvent) => {
      const syncedAt = new Date().toISOString();
      setBaseSnapshotRaw((prev) => {
        const next = dedupeSnapshot(applyRealtimeChangeToSnapshot(prev, change));
        persistSnapshotToIdb(next, syncedAt);
        return next;
      });
      setLastSyncedAt(syncedAt);
      setIsOfflineSnapshot(false);
    },
    [persistSnapshotToIdb],
  );

  const { status: realtimeStatus } = useEventRealtime({
    eventApi,
    eventId,
    enabled: isOnline && !sessionNeedsReunlock,
    pauseOnBackground: pauseRealtimeOnBackground,
    backgroundTimeoutMs: realtimeBackgroundTimeoutMs,
    onChange: handleRealtimeChange,
    onResync: refreshSnapshot,
  });

  const initialPendingQueueRef = useRef(initialPendingQueue);
  initialPendingQueueRef.current = initialPendingQueue;

  // Wire IndexedDB FIFO Leg mutation queue engine for this Event
  useEffect(() => {
    const applyServerLeg = (leg: Leg) => {
      const syncedAt = new Date().toISOString();
      setBaseSnapshotRaw((prev) => {
        const next: EventSnapshot = {
          ...prev,
          legs: prev.legs.map((existing) => (existing.id === leg.id ? leg : existing)),
        };
        persistSnapshotToIdb(next, syncedAt);
        return next;
      });
      setLastSyncedAt(syncedAt);
      setIsOfflineSnapshot(false);
    };

    const engine = createLegMutationQueueEngine({
      eventId,
      eventApi,
      initialQueue: initialPendingQueueRef.current,
      baseBackoffMs: queueBaseBackoffMs,
      isOnline: () => (typeof navigator !== 'undefined' ? navigator.onLine : isOnlineRef.current),
      onQueueChanged: (items) => {
        setPendingQueue(items);
      },
      onLegConfirmed: (leg) => {
        setSessionNeedsReunlock(false);
        applyServerLeg(leg);
      },
      onStaleOverride: (leg, message) => {
        setSessionNeedsReunlock(false);
        applyServerLeg(leg);
        setStaleOverrideToast({ id: generateMutationId(), message });
      },
      onAuthRequired: () => {
        setSessionNeedsReunlock(true);
      },
    });

    engineRef.current = engine;
    engine.start();
    void engine.hydrate();

    return () => {
      engine.stop();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [eventApi, eventId, queueBaseBackoffMs, persistSnapshotToIdb]);

  const refreshGrants = useCallback(async () => {
    const nextGrants = await eventApi.getSessionGrants(eventId);
    setGrants(nextGrants);
    return nextGrants;
  }, [eventApi, eventId]);

  const submitLegMutation = useCallback<LegMutationHandler>(
    async (input, meta) => {
      if (legMutationHandler) {
        return legMutationHandler(input, meta);
      }

      const engine = engineRef.current;
      if (engine) {
        const fallbackLeg =
          meta?.previousLegSnapshot ??
          snapshot.legs.find((l) => l.id === input.legId) ?? {
            id: input.legId,
            eventId: input.eventId,
            teamId: '',
            roundNumber: 1,
            runnerId: null,
            courseId: input.courseId,
            status: 'scheduled' as const,
            startedAt: null,
            finishedAt: null,
            durationSeconds: null,
            externalActivityUrl: null,
            clientUpdatedAt: input.clientUpdatedAt,
            lastMutationId: null,
            updatedByOrganizer: false,
          };

        const outcome = await engine.enqueue(input, {
          actionType: meta?.actionType ?? (input.isExplicitRevert ? 'revert' : 'edit'),
          previousLegSnapshot: fallbackLeg,
        });

        return {
          result: outcome.result,
          queuedOffline: outcome.queuedOffline,
        };
      }

      const result = await eventApi.applyLegMutation(input);
      setSnapshot((prev) => ({
        ...prev,
        legs: prev.legs.map((leg) => (leg.id === result.leg.id ? result.leg : leg)),
      }));
      return { result, queuedOffline: false };
    },
    [eventApi, legMutationHandler, setSnapshot, snapshot.legs],
  );

  const undoLegMutation = useCallback(
    async (mutationId: string, previousLegSnapshot: Leg): Promise<UndoLegMutationOutcome> => {
      if (legMutationHandler) {
        const { result, queuedOffline } = await legMutationHandler(
          {
            eventId,
            legId: previousLegSnapshot.id,
            mutationId: generateMutationId(),
            status: previousLegSnapshot.status,
            startedAt: previousLegSnapshot.startedAt,
            finishedAt: previousLegSnapshot.finishedAt,
            durationSeconds: previousLegSnapshot.durationSeconds,
            courseId: previousLegSnapshot.courseId,
            externalActivityUrl: previousLegSnapshot.externalActivityUrl,
            isExplicitRevert: true,
            clientUpdatedAt: new Date(Date.now()).toISOString(),
          },
          { actionType: 'revert', previousLegSnapshot },
        );
        return {
          mode: queuedOffline ? 'queued_revert_offline' : 'reverted_online',
          restoredLeg: result.leg,
          result,
        };
      }

      const engine = engineRef.current;
      if (engine) {
        return engine.undoLegMutation(mutationId, previousLegSnapshot);
      }

      const result = await eventApi.applyLegMutation({
        eventId,
        legId: previousLegSnapshot.id,
        mutationId: generateMutationId(),
        status: previousLegSnapshot.status,
        startedAt: previousLegSnapshot.startedAt,
        finishedAt: previousLegSnapshot.finishedAt,
        durationSeconds: previousLegSnapshot.durationSeconds,
        courseId: previousLegSnapshot.courseId,
        externalActivityUrl: previousLegSnapshot.externalActivityUrl,
        isExplicitRevert: true,
        clientUpdatedAt: new Date(Date.now()).toISOString(),
      });
      setSnapshot((prev) => ({
        ...prev,
        legs: prev.legs.map((leg) => (leg.id === result.leg.id ? result.leg : leg)),
      }));
      return { mode: 'reverted_online', restoredLeg: result.leg, result };
    },
    [eventApi, eventId, legMutationHandler, setSnapshot],
  );

  const flushLegQueueNow = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      await engine.flushNow();
    }
  }, []);

  const dismissStaleOverrideToast = useCallback(() => {
    setStaleOverrideToast(null);
  }, []);

  const reunlockEvent = useCallback(
    async (inviteCode: string) => {
      await eventApi.ensureSession();
      await eventApi.unlockEvent(baseSnapshot.event.slug, inviteCode);
      setSessionNeedsReunlock(false);
      await refreshGrants();
      if (engineRef.current) {
        await engineRef.current.resumeAfterUnlock();
      }
      await refreshSnapshot();
    },
    [baseSnapshot.event.slug, eventApi, refreshGrants, refreshSnapshot],
  );

  const unlockOrganizer = useCallback(
    async (passcode: string): Promise<boolean> => {
      const ok = await eventApi.unlockOrganizer(eventId, passcode);
      if (!ok) {
        return false;
      }
      setOrganizerUiLocked(false);
      await refreshGrants();
      await refreshSnapshot();
      return true;
    },
    [eventApi, eventId, refreshGrants, refreshSnapshot],
  );

  const lockOrganizer = useCallback(() => {
    setOrganizerUiLocked(true);
  }, []);

  const organizerUnlocked = grants.includes('organizer') && !organizerUiLocked;
  const pendingQueueCount = pendingQueue.length;
  const pendingQueueSyncing = pendingQueue.some((item) => item.sync_state === 'syncing');

  const value = useMemo<EventDataContextValue>(
    () => ({
      eventApi,
      eventId,
      snapshot,
      grants,
      isOrganizer: organizerUnlocked,
      organizerUnlocked,
      unlockOrganizer,
      lockOrganizer,
      isOnline,
      isOfflineSnapshot,
      realtimeStatus,
      refreshing,
      lastSyncedAt,
      pendingQueueCount,
      pendingQueueSyncing,
      staleOverrideToast,
      dismissStaleOverrideToast,
      sessionNeedsReunlock,
      reunlockEvent,
      swUpdateAdapter,
      activeParticipantId: activeParticipant ? activeParticipant.id : null,
      activeParticipant,
      selectParticipant,
      clearParticipant,
      headerRoundSlot,
      headerStatusSlot,
      setHeaderRoundSlot,
      setHeaderStatusSlot,
      refreshSnapshot,
      refreshGrants,
      setSnapshot,
      submitLegMutation,
      enqueueLegMutation: submitLegMutation,
      undoLegMutation,
      flushLegQueueNow,
    }),
    [
      eventApi,
      eventId,
      snapshot,
      grants,
      organizerUnlocked,
      unlockOrganizer,
      lockOrganizer,
      isOnline,
      isOfflineSnapshot,
      realtimeStatus,
      refreshing,
      lastSyncedAt,
      pendingQueueCount,
      pendingQueueSyncing,
      staleOverrideToast,
      dismissStaleOverrideToast,
      sessionNeedsReunlock,
      reunlockEvent,
      swUpdateAdapter,
      activeParticipant,
      selectParticipant,
      clearParticipant,
      headerRoundSlot,
      headerStatusSlot,
      refreshSnapshot,
      refreshGrants,
      setSnapshot,
      submitLegMutation,
      undoLegMutation,
      flushLegQueueNow,
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
