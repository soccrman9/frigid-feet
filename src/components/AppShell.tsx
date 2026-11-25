import { useEffect, useState, type FormEvent } from 'react';
import {
  Backpack,
  CloudUpload,
  Download,
  Flag,
  Home,
  KeyRound,
  RefreshCw,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useEventData } from '../state/EventDataContext';
import { formatEventClock } from '../lib/dateFormatting';
import { HomeTab } from '../features/home/HomeTab';
import { TeamsTab } from '../features/teams/TeamsTab';
import { RaceDayTab } from '../features/race-day/RaceDayTab';
import { SuppliesTab } from '../features/supplies/SuppliesTab';
import { useSwUpdatePrompt } from '../features/offline/useSwUpdatePrompt';
import { EventRecapView } from '../features/recap/EventRecapView';
import { ThemeToggleButton } from './ThemeToggleButton';

export type ShellTabId = 'home' | 'teams' | 'race-day' | 'supplies';

const TABS: ReadonlyArray<{
  id: ShellTabId;
  label: string;
  Icon: typeof Home;
}> = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'teams', label: 'Teams', Icon: Users },
  { id: 'race-day', label: 'Race Day', Icon: Flag },
  { id: 'supplies', label: 'Supplies', Icon: Backpack },
];

const STALE_TOAST_DURATION_MS = 5_000;

function formatUpdatedAgo(lastSyncedAt: string | null, nowMs: number): string {
  if (!lastSyncedAt) return 'updated 0m ago';
  const syncedMs = Date.parse(lastSyncedAt);
  if (Number.isNaN(syncedMs)) return 'updated 0m ago';
  const diffMinutes = Math.max(0, Math.floor((nowMs - syncedMs) / 60_000));
  if (diffMinutes < 60) {
    return `updated ${diffMinutes}m ago`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  return remMinutes > 0
    ? `updated ${hours}h ${remMinutes}m ago`
    : `updated ${hours}h ago`;
}

export function AppShell({ initialTab = 'home' }: { initialTab?: ShellTabId }) {
  const {
    snapshot,
    isOnline,
    isOfflineSnapshot,
    lastSyncedAt,
    pendingQueueCount,
    pendingQueueSyncing,
    flushLegQueueNow,
    staleOverrideToast,
    dismissStaleOverrideToast,
    sessionNeedsReunlock,
    reunlockEvent,
    swUpdateAdapter,
    realtimeStatus,
    headerRoundSlot,
    headerStatusSlot,
  } = useEventData();

  const [activeTab, setActiveTab] = useState<ShellTabId>(initialTab);
  const [showEventRecap, setShowEventRecap] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [reunlockCode, setReunlockCode] = useState('');
  const [reunlockSubmitting, setReunlockSubmitting] = useState(false);
  const [reunlockError, setReunlockError] = useState<string | null>(null);

  const { showUpdatePrompt, reloading, reloadForUpdate, dismissPrompt } = useSwUpdatePrompt({
    pendingQueueCount,
    adapter: swUpdateAdapter,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  // Auto-dismiss the neutral stale override toast after ~5 seconds
  useEffect(() => {
    if (!staleOverrideToast) return;
    const timer = window.setTimeout(() => {
      dismissStaleOverrideToast();
    }, STALE_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [staleOverrideToast, dismissStaleOverrideToast]);

  const clockLabel = formatEventClock(now, snapshot.event.timezone);
  const showOfflineBanner = !isOnline || isOfflineSnapshot;
  const updatedAgoLabel = formatUpdatedAgo(lastSyncedAt, now.getTime());

  async function handleReunlockSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const trimmed = reunlockCode.trim();
    if (!trimmed) {
      setReunlockError(
        pendingQueueCount > 0
          ? 'Enter the Event invite code to sync your saved check-ins.'
          : 'Enter the Event invite code to reconnect to this Event.',
      );
      return;
    }
    setReunlockSubmitting(true);
    setReunlockError(null);
    try {
      await reunlockEvent(trimmed);
      setReunlockCode('');
    } catch (err) {
      setReunlockError(
        err instanceof Error ? err.message : 'That invite code did not match this Event.',
      );
    } finally {
      setReunlockSubmitting(false);
    }
  }

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      {/* Slim 48px single-line Polar Field Log header */}
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-2 border-b pl-3.5 pr-1"
        style={{
          backgroundColor: 'var(--shell-header)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-bold tracking-tight">
            {snapshot.event.name}
          </span>
          {headerRoundSlot}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {headerStatusSlot}
          {isOnline &&
            (realtimeStatus === 'reconnecting' || realtimeStatus === 'disconnected') && (
              <span
                data-testid="realtime-status-pill"
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--shell-dock)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-on-shell-muted)',
                }}
              >
                {realtimeStatus === 'reconnecting' ? (
                  <>
                    <RefreshCw size={12} aria-hidden="true" />
                    <span>Reconnecting…</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={12} aria-hidden="true" />
                    <span>Live paused</span>
                  </>
                )}
              </span>
            )}
          <time
            data-testid="live-clock"
            dateTime={now.toISOString()}
            className="font-telemetry pr-1 text-sm font-bold whitespace-nowrap"
            style={{ color: 'var(--ink-on-shell)' }}
          >
            {clockLabel}
          </time>
          <ThemeToggleButton />
        </div>
      </header>

      {/* Non-blocking offline status, local Leg queue sync pill, session re-unlock, & idle SW update chrome */}
      {(showOfflineBanner || pendingQueueCount > 0 || sessionNeedsReunlock || showUpdatePrompt) && (
        <div
          className="flex shrink-0 flex-col border-b"
          style={{
            backgroundColor: 'var(--bg-rail)',
            borderColor: 'var(--border-strong)',
          }}
        >
          {showOfflineBanner && (
            <div
              data-testid="offline-banner"
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold tabular-nums"
              style={{
                backgroundColor: 'var(--bg-rail)',
                color: 'var(--ink-primary)',
              }}
            >
              <WifiOff
                size={14}
                strokeWidth={2.3}
                aria-hidden="true"
                className="shrink-0"
                style={{ color: 'var(--ink-secondary)' }}
              />
              <span>Offline — showing last saved view ({updatedAgoLabel})</span>
            </div>
          )}

          {pendingQueueCount > 0 && (
            <div
              className="flex items-center justify-between gap-2 border-t px-3 py-1.5"
              style={{
                borderColor: showOfflineBanner ? 'var(--border-hairline)' : 'transparent',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <button
                type="button"
                data-testid="sync-queue-pill"
                onClick={() => void flushLegQueueNow()}
                disabled={pendingQueueSyncing}
                className="pfl-focus-ring inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-[1.5px] px-3.5 text-sm font-bold tabular-nums transition-opacity disabled:opacity-75"
                style={{
                  backgroundColor: 'var(--accent-amber-soft)',
                  borderColor: 'var(--accent-amber)',
                  color: 'var(--ink-primary)',
                }}
              >
                <CloudUpload
                  size={16}
                  strokeWidth={2.3}
                  aria-hidden="true"
                  style={{ color: 'var(--accent-amber-ink)' }}
                />
                <span>
                  {pendingQueueSyncing
                    ? `Syncing (${pendingQueueCount})…`
                    : `Saved locally (${pendingQueueCount}) — Sync now`}
                </span>
              </button>
            </div>
          )}

          {sessionNeedsReunlock && (
            <form
              data-testid="session-reunlock-banner"
              onSubmit={(e) => void handleReunlockSubmit(e)}
              className="flex flex-col gap-2 border-t px-3 py-2.5"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-rail-subtle)',
              }}
              noValidate
            >
              <div className="flex items-start gap-2 text-xs font-semibold">
                <KeyRound
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--shell-header)' }}
                />
                <span style={{ color: 'var(--ink-primary)' }}>
                  {pendingQueueCount > 0
                    ? `Event access expired — your ${pendingQueueCount} saved ${
                        pendingQueueCount === 1 ? 'Leg check-in is' : 'Leg check-ins are'
                      } preserved locally. Re-enter the Event invite code to sync.`
                    : 'Event access expired — re-enter the Event invite code to resume live Event updates.'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="reunlock-invite-code" className="sr-only">
                  Event invite code
                </label>
                <input
                  id="reunlock-invite-code"
                  type="text"
                  value={reunlockCode}
                  onChange={(e) => {
                    setReunlockCode(e.target.value);
                    if (reunlockError) setReunlockError(null);
                  }}
                  placeholder="Enter invite code"
                  className="pfl-focus-ring min-h-[44px] min-w-[140px] flex-1 rounded-md border-[1.5px] px-3 text-sm font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                />
                <button
                  type="submit"
                  disabled={reunlockSubmitting || !isOnline}
                  className="pfl-focus-ring inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-md border-0 px-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
                  style={{
                    backgroundColor: 'var(--shell-header)',
                    color: 'var(--ink-on-shell)',
                  }}
                >
                  {reunlockSubmitting
                    ? 'Unlocking…'
                    : pendingQueueCount > 0
                      ? 'Re-unlock & Sync'
                      : 'Re-unlock'}
                </button>
              </div>

              {reunlockError && (
                <p
                  role="alert"
                  className="text-xs font-semibold"
                  style={{ color: 'var(--accent-error)' }}
                >
                  {reunlockError}
                </p>
              )}
            </form>
          )}

          {showUpdatePrompt && (
            <div
              data-testid="sw-update-prompt"
              role="status"
              aria-live="polite"
              className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold"
                style={{ color: 'var(--ink-primary)' }}
              >
                <Download
                  size={14}
                  strokeWidth={2.3}
                  aria-hidden="true"
                  style={{ color: 'var(--shell-header)' }}
                />
                <span>Update available — Reload</span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={reloading}
                  onClick={() => void reloadForUpdate()}
                  className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border-0 px-3 text-xs font-bold disabled:opacity-65"
                  style={{
                    backgroundColor: 'var(--shell-header)',
                    color: 'var(--ink-on-shell)',
                  }}
                >
                  {reloading ? 'Reloading…' : 'Reload'}
                </button>
                <button
                  type="button"
                  aria-label="Dismiss update prompt"
                  onClick={dismissPrompt}
                  className="pfl-focus-ring flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-md border"
                  style={{
                    backgroundColor: 'var(--bg-ground)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        {showEventRecap ? (
          <EventRecapView onBack={() => setShowEventRecap(false)} />
        ) : (
          <>
            {activeTab === 'home' && <HomeTab onOpenEventRecap={() => setShowEventRecap(true)} />}
            {activeTab === 'teams' && <TeamsTab />}
            {activeTab === 'race-day' && (
              <RaceDayTab onOpenEventRecap={() => setShowEventRecap(true)} />
            )}
            {activeTab === 'supplies' && <SuppliesTab />}
          </>
        )}
      </main>

      {/* Brief neutral toast on stale/overridden offline queue reconciliation */}
      {staleOverrideToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 bottom-[72px] z-50 mx-auto w-[calc(100%-24px)] max-w-2xl"
        >
          <button
            type="button"
            data-testid="stale-override-toast"
            onClick={dismissStaleOverrideToast}
            className="pfl-focus-ring flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] border-[1.5px] px-3.5 py-2.5 text-left shadow-lg"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <span className="text-sm font-semibold">{staleOverrideToast.message}</span>
            <span className="shrink-0 text-xs font-semibold" style={{ color: '#CFE1F0' }}>
              Tap to dismiss
            </span>
          </button>
        </div>
      )}

      {/* Persistent 56px 4-tab bottom navigation bar with 3px top active indicator */}
      <nav
        aria-label="Primary"
        className="grid h-14 shrink-0 grid-cols-4 border-t"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = !showEventRecap && activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setShowEventRecap(false);
                setActiveTab(id);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`pfl-focus-ring flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-xs font-bold transition-colors ${
                isActive ? 'pfl-nav-active' : ''
              }`}
              style={!isActive ? { color: 'var(--ink-muted)' } : undefined}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
