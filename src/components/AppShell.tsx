import { useEffect, useState } from 'react';
import { Backpack, Flag, Home, RefreshCw, Users, WifiOff } from 'lucide-react';
import { useEventData } from '../state/EventDataContext';
import { HomeTab } from '../features/home/HomeTab';
import { TeamsTab } from '../features/teams/TeamsTab';
import { RaceDayTab } from '../features/race-day/RaceDayTab';
import { SuppliesTab } from '../features/supplies/SuppliesTab';
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

function formatLiveClock(date: Date, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }
}

export function AppShell({ initialTab = 'home' }: { initialTab?: ShellTabId }) {
  const { snapshot, realtimeStatus, headerRoundSlot, headerStatusSlot } = useEventData();
  const [activeTab, setActiveTab] = useState<ShellTabId>(initialTab);
  const [showEventRecap, setShowEventRecap] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const clockLabel = formatLiveClock(now, snapshot.event.timezone);

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
          {(realtimeStatus === 'reconnecting' || realtimeStatus === 'disconnected') && (
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
