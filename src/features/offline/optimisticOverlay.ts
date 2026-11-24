import type { EventSnapshot, Leg } from '../../types/domain';
import type { QueuedLegMutation } from './offlineDb';

export function applyQueuedMutationToLeg(leg: Leg, mutation: QueuedLegMutation): Leg {
  return {
    ...leg,
    status: mutation.payload.status,
    startedAt: mutation.payload.started_at,
    finishedAt: mutation.payload.finished_at,
    durationSeconds: mutation.payload.duration_seconds,
    courseId: mutation.payload.course_id,
    externalActivityUrl: mutation.payload.external_activity_url,
    clientUpdatedAt: mutation.client_updated_at,
    lastMutationId: mutation.mutation_id,
  };
}

/**
 * Pure deterministic FIFO overlay of pending `leg_mutation_queue` items onto an `EventSnapshot`.
 * Never mutates the input snapshot or its Leg objects.
 */
export function applyPendingMutationsToSnapshot(
  snapshot: EventSnapshot,
  queueItems: readonly QueuedLegMutation[],
): EventSnapshot {
  const applicable = queueItems
    .filter((item) => item.event_id === snapshot.event.id)
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.queued_at.localeCompare(b.item.queued_at) || a.index - b.index,
    );

  if (applicable.length === 0) {
    return snapshot;
  }

  const legsById = new Map<string, Leg>(snapshot.legs.map((leg) => [leg.id, leg]));
  let mutatedAny = false;

  for (const { item } of applicable) {
    const existing = legsById.get(item.leg_id);
    if (!existing) continue;
    legsById.set(item.leg_id, applyQueuedMutationToLeg(existing, item));
    mutatedAny = true;
  }

  if (!mutatedAny) {
    return snapshot;
  }

  return {
    ...snapshot,
    legs: snapshot.legs.map((leg) => legsById.get(leg.id) ?? leg),
  };
}
