import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface SwUpdateAdapter {
  subscribe(handlers: {
    onNeedRefresh: (needRefresh: boolean) => void;
    onOfflineReady?: (offlineReady: boolean) => void;
  }): {
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
    unsubscribe?: () => void;
  };
}

export interface UseSwUpdatePromptOptions {
  pendingQueueCount: number;
  adapter?: SwUpdateAdapter;
}

export interface UseSwUpdatePromptResult {
  updateAvailable: boolean;
  offlineReady: boolean;
  /** True only when a Service Worker update is waiting AND `leg_mutation_queue` is empty. */
  showUpdatePrompt: boolean;
  reloading: boolean;
  reloadForUpdate: () => Promise<boolean>;
  dismissPrompt: () => void;
}

function createBrowserSwUpdateAdapter(): SwUpdateAdapter {
  return {
    subscribe({ onNeedRefresh, onOfflineReady }) {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return {
          updateServiceWorker: async () => {},
        };
      }

      const updateServiceWorker = registerSW({
        immediate: false,
        onNeedRefresh() {
          onNeedRefresh(true);
        },
        onOfflineReady() {
          onOfflineReady?.(true);
        },
      });

      return {
        updateServiceWorker,
      };
    },
  };
}

const defaultBrowserAdapter = createBrowserSwUpdateAdapter();

/**
 * Helper for tests & controlled environments to simulate Service Worker update availability.
 */
export function createManualSwUpdateController(
  onUpdateServiceWorker: (reloadPage?: boolean) => Promise<void> = async () => {},
): {
  adapter: SwUpdateAdapter;
  setNeedRefresh: (value: boolean) => void;
  setOfflineReady: (value: boolean) => void;
} {
  let needRefreshState = false;
  let offlineReadyState = false;
  const listeners = new Set<{
    onNeedRefresh: (needRefresh: boolean) => void;
    onOfflineReady?: (offlineReady: boolean) => void;
  }>();

  const adapter: SwUpdateAdapter = {
    subscribe(handlers) {
      listeners.add(handlers);
      if (needRefreshState) {
        handlers.onNeedRefresh(true);
      }
      if (offlineReadyState) {
        handlers.onOfflineReady?.(true);
      }
      return {
        updateServiceWorker: onUpdateServiceWorker,
        unsubscribe: () => {
          listeners.delete(handlers);
        },
      };
    },
  };

  return {
    adapter,
    setNeedRefresh(value: boolean) {
      needRefreshState = value;
      for (const listener of listeners) {
        listener.onNeedRefresh(value);
      }
    },
    setOfflineReady(value: boolean) {
      offlineReadyState = value;
      for (const listener of listeners) {
        listener.onOfflineReady?.(value);
      }
    },
  };
}

/**
 * Wraps PWA Service Worker update notification, strictly deferring any update prompt or reload
 * whenever `leg_mutation_queue` is non-empty (`pendingQueueCount > 0`).
 */
export function useSwUpdatePrompt({
  pendingQueueCount,
  adapter = defaultBrowserAdapter,
}: UseSwUpdatePromptOptions): UseSwUpdatePromptResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const updateSwRef = useRef<(reloadPage?: boolean) => Promise<void>>(async () => {});
  const pendingCountRef = useRef(pendingQueueCount);
  pendingCountRef.current = pendingQueueCount;

  useEffect(() => {
    const registration = adapter.subscribe({
      onNeedRefresh(next) {
        setUpdateAvailable(next);
        if (next) {
          setDismissed(false);
        }
      },
      onOfflineReady(next) {
        setOfflineReady(next);
      },
    });
    updateSwRef.current = registration.updateServiceWorker;

    return () => {
      registration.unsubscribe?.();
    };
  }, [adapter]);

  const showUpdatePrompt = updateAvailable && !dismissed && pendingQueueCount === 0;

  const reloadForUpdate = useCallback(async (): Promise<boolean> => {
    // Never force-reload while offline Leg mutations are queued locally!
    if (pendingCountRef.current > 0) {
      return false;
    }
    setReloading(true);
    try {
      await updateSwRef.current(true);
      return true;
    } finally {
      setReloading(false);
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    updateAvailable,
    offlineReady,
    showUpdatePrompt,
    reloading,
    reloadForUpdate,
    dismissPrompt,
  };
}
