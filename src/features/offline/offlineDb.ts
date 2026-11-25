import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EventSnapshot, Leg, LegStatus } from '../../types/domain';

export type OfflineLegMutationActionType =
  | 'start'
  | 'finish'
  | 'mark_completed'
  | 'edit'
  | 'revert';

export type QueuedLegSyncState = 'pending' | 'syncing';

export interface StoredEventSnapshotRecord {
  event_id: string;
  slug: string;
  data: EventSnapshot;
  last_synced_at: string;
}

export interface QueuedLegMutationPayload {
  status: LegStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  course_id: string | null;
  external_activity_url: string | null;
}

export interface QueuedLegMutation {
  mutation_id: string;
  event_id: string;
  leg_id: string;
  action_type: OfflineLegMutationActionType;
  payload: QueuedLegMutationPayload;
  is_explicit_revert: boolean;
  client_updated_at: string;
  previous_leg_snapshot: Leg;
  queued_at: string;
  retry_count: number;
  sync_state: QueuedLegSyncState;
}

interface WinterGrindOfflineSchema extends DBSchema {
  event_snapshot: {
    key: string;
    value: StoredEventSnapshotRecord;
    indexes: {
      by_slug: string;
      by_last_synced_at: string;
    };
  };
  leg_mutation_queue: {
    key: string;
    value: QueuedLegMutation;
    indexes: {
      by_queued_at: string;
      by_event_id: string;
    };
  };
}

export const OFFLINE_DB_NAME = 'winter-grind-50k-offline';
export const OFFLINE_DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<WinterGrindOfflineSchema>> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function enqueueDbWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.catch(() => undefined).then(task);
  writeChain = next.catch(() => undefined);
  return next;
}

export async function waitForPendingOfflineDbWrites(): Promise<void> {
  await writeChain.catch(() => undefined);
}

export async function getOfflineDb(): Promise<IDBPDatabase<WinterGrindOfflineSchema> | null> {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB<WinterGrindOfflineSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('event_snapshot')) {
          const snapshotStore = db.createObjectStore('event_snapshot', {
            keyPath: 'event_id',
          });
          snapshotStore.createIndex('by_slug', 'slug', { unique: false });
          snapshotStore.createIndex('by_last_synced_at', 'last_synced_at', { unique: false });
        }

        if (!db.objectStoreNames.contains('leg_mutation_queue')) {
          const queueStore = db.createObjectStore('leg_mutation_queue', {
            keyPath: 'mutation_id',
          });
          queueStore.createIndex('by_queued_at', 'queued_at', { unique: false });
          queueStore.createIndex('by_event_id', 'event_id', { unique: false });
        }
      },
      terminated() {
        dbPromise = null;
      },
    });
  }

  return dbPromise;
}

export function saveEventSnapshot(
  snapshot: EventSnapshot,
  lastSyncedAt: string = new Date().toISOString(),
): Promise<StoredEventSnapshotRecord | null> {
  return enqueueDbWrite(async () => {
    const db = await getOfflineDb();
    if (!db) return null;

    const sanitizedSnapshot: EventSnapshot = {
      ...snapshot,
      chipIns: [],
    };

    const record: StoredEventSnapshotRecord = {
      event_id: sanitizedSnapshot.event.id,
      slug: sanitizedSnapshot.event.slug,
      data: sanitizedSnapshot,
      last_synced_at: lastSyncedAt,
    };
    await db.put('event_snapshot', record);
    return record;
  });
}

export async function getEventSnapshotByEventId(
  eventId: string,
): Promise<StoredEventSnapshotRecord | null> {
  await waitForPendingOfflineDbWrites();
  const db = await getOfflineDb();
  if (!db) return null;
  return (await db.get('event_snapshot', eventId)) ?? null;
}

export async function getEventSnapshotBySlug(
  slug: string,
): Promise<StoredEventSnapshotRecord | null> {
  await waitForPendingOfflineDbWrites();
  const db = await getOfflineDb();
  if (!db) return null;
  const matches = await db.getAllFromIndex('event_snapshot', 'by_slug', slug);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.last_synced_at.localeCompare(a.last_synced_at));
  return matches[0];
}

export async function getLatestEventSnapshot(): Promise<StoredEventSnapshotRecord | null> {
  await waitForPendingOfflineDbWrites();
  const db = await getOfflineDb();
  if (!db) return null;
  const all = await db.getAll('event_snapshot');
  if (all.length === 0) return null;
  all.sort((a, b) => b.last_synced_at.localeCompare(a.last_synced_at));
  return all[0];
}

export function putQueuedLegMutation(item: QueuedLegMutation): Promise<void> {
  return enqueueDbWrite(async () => {
    const db = await getOfflineDb();
    if (!db) return;
    await db.put('leg_mutation_queue', item);
  });
}

export async function getQueuedLegMutation(
  mutationId: string,
): Promise<QueuedLegMutation | null> {
  await waitForPendingOfflineDbWrites();
  const db = await getOfflineDb();
  if (!db) return null;
  return (await db.get('leg_mutation_queue', mutationId)) ?? null;
}

export async function getQueuedLegMutations(eventId?: string): Promise<QueuedLegMutation[]> {
  await waitForPendingOfflineDbWrites();
  const db = await getOfflineDb();
  if (!db) return [];

  const allInFifoOrder = await db.getAllFromIndex('leg_mutation_queue', 'by_queued_at');
  if (!eventId) {
    return allInFifoOrder;
  }
  return allInFifoOrder.filter((item) => item.event_id === eventId);
}

export function deleteQueuedLegMutation(mutationId: string): Promise<void> {
  return enqueueDbWrite(async () => {
    const db = await getOfflineDb();
    if (!db) return;
    await db.delete('leg_mutation_queue', mutationId);
  });
}

export function clearOfflineDb(): Promise<void> {
  return enqueueDbWrite(async () => {
    const db = await getOfflineDb();
    if (!db) return;
    const tx = db.transaction(['event_snapshot', 'leg_mutation_queue'], 'readwrite');
    await Promise.all([
      tx.objectStore('event_snapshot').clear(),
      tx.objectStore('leg_mutation_queue').clear(),
      tx.done,
    ]);
  });
}
