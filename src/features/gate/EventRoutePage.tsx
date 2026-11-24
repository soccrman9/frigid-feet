import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { EventApi } from '../../lib/eventApi';
import {
  EventAccessError,
  type EventSnapshot,
  type GrantScope,
} from '../../types/domain';
import { EventDataProvider, useEventData } from '../../state/EventDataContext';
import { AppShell } from '../../components/AppShell';
import { ParticipantPickerScreen } from '../participant/ParticipantPickerScreen';
import {
  getEventSnapshotBySlug,
  getQueuedLegMutations,
  saveEventSnapshot,
  type QueuedLegMutation,
} from '../offline/offlineDb';
import { InviteGateScreen } from './InviteGateScreen';

function UnlockedEventGate() {
  const { activeParticipant } = useEventData();
  if (!activeParticipant) {
    return <ParticipantPickerScreen />;
  }
  return <AppShell />;
}

interface UnlockedState {
  eventId: string;
  snapshot: EventSnapshot;
  grants: GrantScope[];
  lastSyncedAt: string;
  isOfflineSnapshot: boolean;
  pendingQueue: QueuedLegMutation[];
}

function stripInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code === null) return null;

  params.delete('code');
  const remainingQuery = params.toString();
  const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', cleanUrl);
  return code;
}

export function EventRoutePage({ eventApi }: { eventApi: EventApi }) {
  const { slug = '' } = useParams<{ slug: string }>();
  const [unlocked, setUnlocked] = useState<UnlockedState | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Capture any ?code= once so React StrictMode double-effects still unlock cleanly after URL stripping.
  const capturedCodeRef = useRef<{ slug: string; code: string | null } | null>(null);
  if (!capturedCodeRef.current || capturedCodeRef.current.slug !== slug) {
    const rawCode =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('code')
        : null;
    capturedCodeRef.current = { slug, code: rawCode };
  }

  const loadUnlockedEvent = useCallback(
    async (eventId: string): Promise<UnlockedState> => {
      const [snapshot, grants, pendingQueue] = await Promise.all([
        eventApi.getEventSnapshot(eventId),
        eventApi.getSessionGrants(eventId),
        getQueuedLegMutations(eventId).catch(() => [] as QueuedLegMutation[]),
      ]);
      const lastSyncedAt = new Date().toISOString();
      await saveEventSnapshot(snapshot, lastSyncedAt).catch(() => undefined);
      return {
        eventId,
        snapshot,
        grants,
        lastSyncedAt,
        isOfflineSnapshot: false,
        pendingQueue,
      };
    },
    [eventApi],
  );

  const tryHydrateOfflineSnapshot = useCallback(
    async (eventSlug: string): Promise<UnlockedState | null> => {
      try {
        const cached = await getEventSnapshotBySlug(eventSlug);
        if (!cached) return null;
        const pendingQueue = await getQueuedLegMutations(cached.event_id).catch(
          () => [] as QueuedLegMutation[],
        );
        return {
          eventId: cached.event_id,
          snapshot: cached.data,
          grants: ['participant'],
          lastSyncedAt: cached.last_synced_at,
          isOfflineSnapshot: true,
          pendingQueue,
        };
      } catch {
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setChecking(true);
      setGateError(null);
      setUnlocked(null);

      // Immediately strip ?code= from the browser URL bar before awaiting network calls
      const strippedCode = stripInviteCodeFromUrl();
      const pendingCode = strippedCode ?? capturedCodeRef.current?.code ?? null;

      // Offline cold launch: hydrate immediately from IndexedDB event_snapshot + leg_mutation_queue
      const navigatorOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (navigatorOffline && pendingCode === null) {
        const cachedState = await tryHydrateOfflineSnapshot(slug);
        if (active) {
          if (cachedState) {
            setUnlocked(cachedState);
          } else {
            setGateError('You are offline and no saved Event view was found on this device yet.');
          }
          setChecking(false);
        }
        return;
      }

      try {
        if (pendingCode !== null) {
          await eventApi.ensureSession();
          const eventId = await eventApi.unlockEvent(slug, pendingCode);
          const state = await loadUnlockedEvent(eventId);
          if (active) {
            capturedCodeRef.current = { slug, code: null };
            setUnlocked(state);
          }
          return;
        }

        const existing = await eventApi.getGrantedEventBySlug(slug);
        if (existing) {
          const state = await loadUnlockedEvent(existing.eventId);
          if (active) {
            setUnlocked(state);
          }
        }
      } catch (err) {
        // On non-auth network errors (lie-fi / captive portal), gracefully fall back to cached IndexedDB snapshot
        if (pendingCode === null && !(err instanceof EventAccessError)) {
          const cachedState = await tryHydrateOfflineSnapshot(slug);
          if (active && cachedState) {
            setUnlocked(cachedState);
            return;
          }
        }

        if (active) {
          capturedCodeRef.current = { slug, code: null };
          setGateError(
            err instanceof Error
              ? err.message
              : 'That invite code did not match this Event.',
          );
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [eventApi, slug, loadUnlockedEvent, tryHydrateOfflineSnapshot]);

  const handleManualUnlock = useCallback(
    async (code: string) => {
      setSubmitting(true);
      setGateError(null);
      try {
        await eventApi.ensureSession();
        const eventId = await eventApi.unlockEvent(slug, code);
        const state = await loadUnlockedEvent(eventId);
        setUnlocked(state);
      } catch (err) {
        setGateError(
          err instanceof Error
            ? err.message
            : 'That invite code did not match this Event.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [eventApi, slug, loadUnlockedEvent],
  );

  if (checking) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <p className="text-base font-semibold">Checking Event access…</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <InviteGateScreen
        slug={slug}
        initialError={gateError}
        submitting={submitting}
        onSubmitCode={handleManualUnlock}
      />
    );
  }

  return (
    <EventDataProvider
      key={unlocked.eventId}
      eventApi={eventApi}
      eventId={unlocked.eventId}
      initialSnapshot={unlocked.snapshot}
      initialGrants={unlocked.grants}
      initialLastSyncedAt={unlocked.lastSyncedAt}
      initialIsOfflineSnapshot={unlocked.isOfflineSnapshot}
      initialPendingQueue={unlocked.pendingQueue}
    >
      <UnlockedEventGate />
    </EventDataProvider>
  );
}
