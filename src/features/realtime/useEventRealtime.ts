import { useEffect, useRef, useState } from 'react';
import type { EventApi, Unsubscribe } from '../../lib/eventApi';
import type { RealtimeChangeEvent, RealtimeConnectionStatus } from './realtimeTypes';

export const DEFAULT_BACKGROUND_PAUSE_MS = 30_000;

export interface UseEventRealtimeOptions {
  eventApi: EventApi;
  eventId: string;
  enabled?: boolean;
  /**
   * Mobile tabs default to true: unsubscribe after ~30s hidden to conserve battery
   * and stay well within Supabase Free's 200 concurrent connection cap.
   * Basecamp Dashboard sets this to false to stay connected continuously.
   */
  pauseOnBackground?: boolean;
  /** Delay before unsubscribing while hidden (default 30_000 ms). */
  backgroundTimeoutMs?: number;
  onChange: (event: RealtimeChangeEvent) => void;
  onResync: () => void | Promise<unknown>;
}

export interface UseEventRealtimeResult {
  status: RealtimeConnectionStatus;
}

export function useEventRealtime({
  eventApi,
  eventId,
  enabled = true,
  pauseOnBackground = true,
  backgroundTimeoutMs = DEFAULT_BACKGROUND_PAUSE_MS,
  onChange,
  onResync,
}: UseEventRealtimeOptions): UseEventRealtimeResult {
  const [status, setStatus] = useState<RealtimeConnectionStatus>('idle');

  const onChangeRef = useRef(onChange);
  const onResyncRef = useRef(onResync);
  onChangeRef.current = onChange;
  onResyncRef.current = onResync;

  useEffect(() => {
    const subscribe = eventApi.subscribeToEvent?.bind(eventApi);
    if (!enabled || !eventId || !subscribe) {
      setStatus('idle');
      return;
    }

    let disposed = false;
    let activeUnsubscribe: Unsubscribe | null = null;
    let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    let pausedForBackground = false;
    let needsResyncOnReconnect = false;

    const triggerResync = () => {
      try {
        const result = onResyncRef.current();
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          void (result as Promise<unknown>).catch(() => undefined);
        }
      } catch {
        // Calmly swallow transient sync errors; next reconnect or manual refresh will retry.
      }
    };

    const clearBackgroundTimer = () => {
      if (backgroundTimer !== null) {
        clearTimeout(backgroundTimer);
        backgroundTimer = null;
      }
    };

    const teardownSubscription = () => {
      if (activeUnsubscribe) {
        const unsub = activeUnsubscribe;
        activeUnsubscribe = null;
        unsub();
      }
    };

    const openSubscription = () => {
      if (disposed || activeUnsubscribe) return;
      setStatus('connecting');
      activeUnsubscribe = subscribe(eventId, {
        onChange: (event) => {
          if (disposed) return;
          onChangeRef.current(event);
        },
        onStatusChange: (nextStatus) => {
          if (disposed || pausedForBackground) return;
          setStatus(nextStatus);
          if (nextStatus === 'reconnecting' || nextStatus === 'disconnected') {
            needsResyncOnReconnect = true;
          } else if (nextStatus === 'connected' && needsResyncOnReconnect) {
            needsResyncOnReconnect = false;
            triggerResync();
          }
        },
      });
    };

    const scheduleBackgroundPause = () => {
      if (backgroundTimer !== null || pausedForBackground) return;
      backgroundTimer = setTimeout(() => {
        backgroundTimer = null;
        if (disposed) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          pausedForBackground = true;
          needsResyncOnReconnect = false;
          teardownSubscription();
          setStatus('paused');
        }
      }, backgroundTimeoutMs);
    };

    const handleVisibilityChange = () => {
      if (disposed || typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        scheduleBackgroundPause();
      } else {
        clearBackgroundTimer();
        if (pausedForBackground) {
          pausedForBackground = false;
          needsResyncOnReconnect = false;
          openSubscription();
          triggerResync();
        }
      }
    };

    openSubscription();

    if (pauseOnBackground && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      if (document.visibilityState === 'hidden') {
        scheduleBackgroundPause();
      }
    }

    return () => {
      disposed = true;
      clearBackgroundTimer();
      if (pauseOnBackground && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      teardownSubscription();
    };
  }, [eventApi, eventId, enabled, pauseOnBackground, backgroundTimeoutMs]);

  return { status };
}
