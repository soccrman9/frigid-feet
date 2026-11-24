import type { EventApi } from '../../lib/eventApi';
import {
  EventAccessError,
  type ApplyLegMutationInput,
  type ApplyLegMutationResult,
  type Leg,
} from '../../types/domain';
import { generateMutationId } from '../race-day/raceDayUtils';
import {
  deleteQueuedLegMutation,
  getQueuedLegMutations,
  putQueuedLegMutation,
  waitForPendingOfflineDbWrites,
  type OfflineLegMutationActionType,
  type QueuedLegMutation,
} from './offlineDb';
import { applyQueuedMutationToLeg } from './optimisticOverlay';

export const STALE_OVERRIDE_TOAST_MESSAGE = 'Updated to latest Basecamp status';
export const DEFAULT_QUEUE_BASE_BACKOFF_MS = 15_000;
export const DEFAULT_QUEUE_MAX_BACKOFF_MS = 300_000; // 5 minutes

export interface EnqueueLegMutationMeta {
  actionType: OfflineLegMutationActionType;
  previousLegSnapshot: Leg;
}

export interface EnqueueLegMutationOutcome {
  mutationId: string;
  queuedItem: QueuedLegMutation;
  result: ApplyLegMutationResult;
  queuedOffline: boolean;
}

export interface UndoLegMutationOutcome {
  mode: 'deleted_locally' | 'reverted_online' | 'queued_revert_offline';
  restoredLeg: Leg;
  result?: ApplyLegMutationResult;
}

export interface LegMutationQueueEngineOptions {
  eventId: string;
  eventApi: EventApi;
  initialQueue?: QueuedLegMutation[];
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  isOnline?: () => boolean;
  now?: () => number;
  onQueueChanged?: (items: QueuedLegMutation[]) => void;
  onLegConfirmed?: (leg: Leg, result: ApplyLegMutationResult) => void;
  onStaleOverride?: (leg: Leg, message: string) => void;
  onAuthRequired?: (error: EventAccessError) => void;
}

export interface LegMutationQueueEngine {
  start(): void;
  stop(): void;
  hydrate(): Promise<QueuedLegMutation[]>;
  getQueue(): Promise<QueuedLegMutation[]>;
  enqueue(
    input: ApplyLegMutationInput,
    meta: EnqueueLegMutationMeta,
  ): Promise<EnqueueLegMutationOutcome>;
  flushNow(): Promise<void>;
  resumeAfterUnlock(): Promise<void>;
  undoLegMutation(mutationId: string, previousLegSnapshot: Leg): Promise<UndoLegMutationOutcome>;
  waitForIdle(): Promise<void>;
}

function isAuthError(err: unknown): err is EventAccessError {
  return (
    err instanceof EventAccessError &&
    (err.code === 'UNAUTHORIZED' || err.code === 'FORBIDDEN')
  );
}

function toApplyLegMutationInput(item: QueuedLegMutation): ApplyLegMutationInput {
  return {
    eventId: item.event_id,
    legId: item.leg_id,
    mutationId: item.mutation_id,
    status: item.payload.status,
    startedAt: item.payload.started_at,
    finishedAt: item.payload.finished_at,
    durationSeconds: item.payload.duration_seconds,
    courseId: item.payload.course_id,
    externalActivityUrl: item.payload.external_activity_url,
    isExplicitRevert: item.is_explicit_revert,
    clientUpdatedAt: item.client_updated_at,
  };
}

function sortFifo(items: QueuedLegMutation[]): QueuedLegMutation[] {
  return [...items].sort((a, b) => a.queued_at.localeCompare(b.queued_at));
}

export function createLegMutationQueueEngine({
  eventId,
  eventApi,
  initialQueue = [],
  baseBackoffMs = DEFAULT_QUEUE_BASE_BACKOFF_MS,
  maxBackoffMs = DEFAULT_QUEUE_MAX_BACKOFF_MS,
  isOnline = () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
  now = () => Date.now(),
  onQueueChanged,
  onLegConfirmed,
  onStaleOverride,
  onAuthRequired,
}: LegMutationQueueEngineOptions): LegMutationQueueEngine {
  let started = false;
  let disposed = false;
  let authPaused = false;
  let backoffStep = 0;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let flushingPromise: Promise<void> | null = null;
  let flushRequestedAgain = false;
  let lastQueuedAtMs = 0;

  // Authoritative in-memory FIFO mirror synchronized durably with IndexedDB `leg_mutation_queue`
  let memoryQueue: QueuedLegMutation[] = sortFifo(
    initialQueue.map((item) =>
      item.sync_state === 'syncing' ? { ...item, sync_state: 'pending' } : { ...item },
    ),
  );
  for (const item of memoryQueue) {
    const queuedMs = Date.parse(item.queued_at);
    if (!Number.isNaN(queuedMs) && queuedMs > lastQueuedAtMs) {
      lastQueuedAtMs = queuedMs;
    }
  }

  // Tracks mutations explicitly deleted locally so late hydration reads never resurrect them
  const deletedLocallyIds = new Set<string>();

  // Stores outcomes and client timestamps for mutations resolved during a flush
  const resolvedOutcomes = new Map<string, ApplyLegMutationResult>();
  const resolvedClientUpdatedMs = new Map<string, number>();

  const clearBackoffTimer = () => {
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  };

  const emitMemoryQueue = () => {
    if (!disposed) {
      onQueueChanged?.([...memoryQueue]);
    }
  };

  const scheduleBackoff = () => {
    if (disposed || authPaused || backoffTimer !== null) return;
    const delayMs = Math.min(maxBackoffMs, baseBackoffMs * 2 ** backoffStep);
    backoffStep += 1;
    backoffTimer = setTimeout(() => {
      backoffTimer = null;
      if (disposed || authPaused) return;
      void runFlush(false);
    }, delayMs);
  };

  const nextMonotonicQueuedAtIso = (): string => {
    const currentMs = now();
    const nextMs = currentMs > lastQueuedAtMs ? currentMs : lastQueuedAtMs + 1;
    lastQueuedAtMs = nextMs;
    return new Date(nextMs).toISOString();
  };

  const replaceInMemoryQueue = (updated: QueuedLegMutation) => {
    memoryQueue = memoryQueue.map((item) =>
      item.mutation_id === updated.mutation_id ? updated : item,
    );
  };

  const removeFromMemoryQueue = (mutationId: string) => {
    memoryQueue = memoryQueue.filter((item) => item.mutation_id !== mutationId);
  };

  const runFlush = (allowWhenAuthPaused: boolean): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }
    if (authPaused && !allowWhenAuthPaused) {
      return Promise.resolve();
    }

    if (flushingPromise) {
      flushRequestedAgain = true;
      return flushingPromise;
    }

    if (allowWhenAuthPaused) {
      authPaused = false;
    }

    const execute = async () => {
      clearBackoffTimer();

      while (!disposed) {
        if (memoryQueue.length === 0) {
          backoffStep = 0;
          emitMemoryQueue();
          break;
        }

        if (!isOnline()) {
          emitMemoryQueue();
          scheduleBackoff();
          break;
        }

        let stoppedEarly = false;
        const snapshotIds = memoryQueue.map((item) => item.mutation_id);

        for (const mutationId of snapshotIds) {
          if (disposed) {
            stoppedEarly = true;
            break;
          }

          const currentItem = memoryQueue.find((i) => i.mutation_id === mutationId);
          if (!currentItem) {
            continue;
          }

          const syncingItem: QueuedLegMutation = {
            ...currentItem,
            sync_state: 'syncing',
          };
          replaceInMemoryQueue(syncingItem);
          void putQueuedLegMutation(syncingItem).catch(() => undefined);
          emitMemoryQueue();

          try {
            const result = await eventApi.applyLegMutation(toApplyLegMutationInput(syncingItem));
            resolvedOutcomes.set(syncingItem.mutation_id, result);
            const confirmedMs = Date.parse(result.leg.clientUpdatedAt);
            const sentMs = Date.parse(syncingItem.client_updated_at);
            const maxMs = Math.max(
              Number.isNaN(confirmedMs) ? 0 : confirmedMs,
              Number.isNaN(sentMs) ? 0 : sentMs,
            );
            if (maxMs > 0) {
              resolvedClientUpdatedMs.set(syncingItem.mutation_id, maxMs);
            }

            deletedLocallyIds.add(syncingItem.mutation_id);
            removeFromMemoryQueue(syncingItem.mutation_id);
            void deleteQueuedLegMutation(syncingItem.mutation_id).catch(() => undefined);
            backoffStep = 0;
            authPaused = false;

            if (!disposed) {
              if (!result.applied && result.reason === 'stale_or_overridden') {
                onStaleOverride?.(result.leg, STALE_OVERRIDE_TOAST_MESSAGE);
              } else {
                onLegConfirmed?.(result.leg, result);
              }
            }
            emitMemoryQueue();
          } catch (err) {
            if (isAuthError(err)) {
              // Preserve ALL queued items intact until the Participant re-unlocks the Event
              const pendingAgain: QueuedLegMutation = {
                ...currentItem,
                sync_state: 'pending',
              };
              replaceInMemoryQueue(pendingAgain);
              void putQueuedLegMutation(pendingAgain).catch(() => undefined);
              authPaused = true;
              clearBackoffTimer();
              emitMemoryQueue();
              if (!disposed) {
                onAuthRequired?.(err);
              }
              stoppedEarly = true;
              break;
            }

            // Transient / network error: preserve item at FIFO head and back off exponentially
            const retryItem: QueuedLegMutation = {
              ...currentItem,
              retry_count: currentItem.retry_count + 1,
              sync_state: 'pending',
            };
            replaceInMemoryQueue(retryItem);
            void putQueuedLegMutation(retryItem).catch(() => undefined);
            emitMemoryQueue();
            scheduleBackoff();
            stoppedEarly = true;
            break;
          }
        }

        if (stoppedEarly) {
          break;
        }

        if (!flushRequestedAgain && memoryQueue.length === 0) {
          break;
        }
        flushRequestedAgain = false;
      }
    };

    const current = execute().finally(() => {
      if (flushingPromise === current) {
        flushingPromise = null;
      }
      if (flushRequestedAgain && !disposed && !authPaused) {
        flushRequestedAgain = false;
        void runFlush(false);
      }
    });

    flushingPromise = current;
    return current;
  };

  const handleOnline = () => {
    if (disposed || authPaused) return;
    backoffStep = 0;
    clearBackoffTimer();
    void runFlush(false);
  };

  const handleFocus = () => {
    if (disposed || authPaused) return;
    void runFlush(false);
  };

  const handleVisibilityChange = () => {
    if (disposed || authPaused) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void runFlush(false);
    }
  };

  const hydrate = async (): Promise<QueuedLegMutation[]> => {
    const existing = await getQueuedLegMutations(eventId);
    const byId = new Map<string, QueuedLegMutation>(
      memoryQueue.map((item) => [item.mutation_id, item]),
    );

    for (const item of existing) {
      if (deletedLocallyIds.has(item.mutation_id)) {
        continue;
      }
      if (!byId.has(item.mutation_id)) {
        const normalizedItem: QueuedLegMutation =
          item.sync_state === 'syncing' ? { ...item, sync_state: 'pending' } : item;
        if (item.sync_state === 'syncing') {
          void putQueuedLegMutation(normalizedItem).catch(() => undefined);
        }
        byId.set(normalizedItem.mutation_id, normalizedItem);
      }
      const queuedMs = Date.parse(item.queued_at);
      if (!Number.isNaN(queuedMs) && queuedMs > lastQueuedAtMs) {
        lastQueuedAtMs = queuedMs;
      }
    }

    const merged = sortFifo(Array.from(byId.values()));
    const changed =
      merged.length !== memoryQueue.length ||
      merged.some((item, idx) => item.mutation_id !== memoryQueue[idx]?.mutation_id);
    memoryQueue = merged;

    if (changed) {
      emitMemoryQueue();
    }

    if (memoryQueue.length > 0 && !authPaused) {
      if (isOnline()) {
        void runFlush(false);
      } else {
        scheduleBackoff();
      }
    }
    return [...memoryQueue];
  };

  const enqueue = async (
    input: ApplyLegMutationInput,
    meta: EnqueueLegMutationMeta,
  ): Promise<EnqueueLegMutationOutcome> => {
    const queuedItem: QueuedLegMutation = {
      mutation_id: input.mutationId,
      event_id: input.eventId,
      leg_id: input.legId,
      action_type: meta.actionType,
      payload: {
        status: input.status,
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        duration_seconds: input.durationSeconds,
        course_id: input.courseId,
        external_activity_url: input.externalActivityUrl,
      },
      is_explicit_revert: input.isExplicitRevert,
      client_updated_at: input.clientUpdatedAt,
      previous_leg_snapshot: { ...meta.previousLegSnapshot },
      queued_at: nextMonotonicQueuedAtIso(),
      retry_count: 0,
      sync_state: 'pending',
    };

    deletedLocallyIds.delete(queuedItem.mutation_id);
    resolvedOutcomes.delete(queuedItem.mutation_id);

    // Update in-memory queue & UI immediately, and persist durably to IndexedDB in order
    memoryQueue = sortFifo([
      ...memoryQueue.filter((item) => item.mutation_id !== queuedItem.mutation_id),
      queuedItem,
    ]);
    void putQueuedLegMutation(queuedItem).catch(() => undefined);
    emitMemoryQueue();

    const optimisticLeg = applyQueuedMutationToLeg(meta.previousLegSnapshot, queuedItem);

    if (!isOnline() || authPaused) {
      if (!authPaused) {
        scheduleBackoff();
      }
      return {
        mutationId: queuedItem.mutation_id,
        queuedItem,
        result: {
          applied: true,
          reason: 'applied',
          leg: optimisticLeg,
        },
        queuedOffline: true,
      };
    }

    await runFlush(false);

    const serverResult = resolvedOutcomes.get(queuedItem.mutation_id);
    resolvedOutcomes.delete(queuedItem.mutation_id);

    if (serverResult) {
      return {
        mutationId: queuedItem.mutation_id,
        queuedItem,
        result: serverResult,
        queuedOffline: false,
      };
    }

    return {
      mutationId: queuedItem.mutation_id,
      queuedItem,
      result: {
        applied: true,
        reason: 'applied',
        leg: optimisticLeg,
      },
      queuedOffline: true,
    };
  };

  const undoLegMutation = async (
    mutationId: string,
    previousLegSnapshot: Leg,
  ): Promise<UndoLegMutationOutcome> => {
    const existing = memoryQueue.find((item) => item.mutation_id === mutationId);
    if (existing && existing.sync_state === 'pending') {
      deletedLocallyIds.add(mutationId);
      removeFromMemoryQueue(mutationId);
      void deleteQueuedLegMutation(mutationId).catch(() => undefined);
      emitMemoryQueue();
      if (memoryQueue.length === 0) {
        clearBackoffTimer();
        backoffStep = 0;
      }
      return {
        mode: 'deleted_locally',
        restoredLeg: { ...previousLegSnapshot },
      };
    }

    // Wait for any in-flight flush to finish before sending compensating revert
    if (flushingPromise) {
      await flushingPromise;
    }

    // Re-check in case a flush failed and moved the item back to 'pending' while we waited
    const stillPending = memoryQueue.find((item) => item.mutation_id === mutationId);
    if (stillPending && stillPending.sync_state === 'pending') {
      deletedLocallyIds.add(mutationId);
      removeFromMemoryQueue(mutationId);
      void deleteQueuedLegMutation(mutationId).catch(() => undefined);
      emitMemoryQueue();
      if (memoryQueue.length === 0) {
        clearBackoffTimer();
        backoffStep = 0;
      }
      return {
        mode: 'deleted_locally',
        restoredLeg: { ...previousLegSnapshot },
      };
    }

    // Already flushed to the server -> enqueue compensating revert with is_explicit_revert = true
    const priorMutationMs = resolvedClientUpdatedMs.get(mutationId) ?? 0;
    const prevSnapshotMs = Date.parse(previousLegSnapshot.clientUpdatedAt);
    const minNextMs = Math.max(
      now(),
      priorMutationMs + 1,
      Number.isNaN(prevSnapshotMs) ? 0 : prevSnapshotMs + 1,
    );
    const revertOutcome = await enqueue(
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
        clientUpdatedAt: new Date(minNextMs).toISOString(),
      },
      {
        actionType: 'revert',
        previousLegSnapshot: { ...previousLegSnapshot },
      },
    );

    return {
      mode: revertOutcome.queuedOffline ? 'queued_revert_offline' : 'reverted_online',
      restoredLeg: revertOutcome.result.leg,
      result: revertOutcome.result,
    };
  };

  return {
    start() {
      if (started || disposed) return;
      started = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('focus', handleFocus);
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }
    },
    stop() {
      disposed = true;
      clearBackoffTimer();
      if (started) {
        started = false;
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('focus', handleFocus);
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      }
    },
    hydrate,
    getQueue: () => getQueuedLegMutations(eventId),
    enqueue,
    flushNow: async () => {
      backoffStep = 0;
      clearBackoffTimer();
      await runFlush(true);
    },
    resumeAfterUnlock: async () => {
      authPaused = false;
      backoffStep = 0;
      clearBackoffTimer();
      await runFlush(true);
    },
    undoLegMutation,
    waitForIdle: async () => {
      while (flushingPromise) {
        await flushingPromise;
      }
      await waitForPendingOfflineDbWrites();
    },
  };
}
