import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Bell,
  Clock,
  Footprints,
  Moon,
  Radio,
  Sun,
  Timer,
  Trophy,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { EventApi } from '../../lib/eventApi';
import { EventAccessError, type EventSnapshot } from '../../types/domain';
import { formatClockTime } from '../race-day/raceDayUtils';
import { applyRealtimeChangeToSnapshot, dedupeSnapshot } from '../realtime/realtimeMerge';
import type { RealtimeChangeEvent } from '../realtime/realtimeTypes';
import { useEventRealtime } from '../realtime/useEventRealtime';
import {
  evaluateChimeTriggers,
  getOrCreateAudioContext,
  playDashboardChime,
  type ChimeKind,
} from './dashboardChime';
import {
  selectActiveRoundNumber,
  selectCollectiveKm,
  selectDashboardTeams,
  selectLiveBadgeTickerItems,
  selectOnDeckSummary,
  selectOutOnCourseRunners,
} from './dashboardData';

export const DASHBOARD_FALLBACK_POLL_MS = 60_000;

const DASHBOARD_THEME_STORAGE_KEY = 'wg50k_dashboard_theme';

type DashboardTheme = 'dark' | 'light';

export interface DashboardPageProps {
  eventApi: EventApi;
  /** Optional audio sink override for tests; defaults to synthesized Web Audio harmonic chime. */
  onPlayChime?: (kind: ChimeKind) => void;
}

function resolveInitialDashboardTheme(): DashboardTheme {
  try {
    const saved = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  // Default to dark chalet mode for indoor Basecamp TVs & laptops
  return 'dark';
}

export function DashboardPage({ eventApi, onPlayChime }: DashboardPageProps) {
  const { token } = useParams<{ token: string }>();

  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [unlockedEventId, setUnlockedEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dashboardTheme, setDashboardTheme] = useState<DashboardTheme>(resolveInitialDashboardTheme);
  const [showBadges, setShowBadges] = useState(true);
  const [chimeEnabled, setChimeEnabled] = useState(false); // Muted by default
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [realtimeSessionGen, setRealtimeSessionGen] = useState(0);

  const activeRef = useRef(true);
  const resyncInFlightRef = useRef(false);
  const firedChimeKeysRef = useRef<Set<string>>(new Set());
  const playChimeRef = useRef<(kind: ChimeKind) => void>(
    onPlayChime ?? ((kind) => void playDashboardChime(kind)),
  );
  playChimeRef.current = onPlayChime ?? ((kind) => void playDashboardChime(kind));

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  // Initial unlock & snapshot load
  useEffect(() => {
    let mounted = true;
    firedChimeKeysRef.current = new Set();

    async function load() {
      if (!token || !token.trim()) {
        setUnlockedEventId(null);
        setSnapshot(null);
        setError('Invalid Basecamp Dashboard link.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await eventApi.ensureSession();
        const eventId = await eventApi.unlockDashboard(token);
        const snap = await eventApi.getEventSnapshot(eventId);
        if (mounted) {
          setUnlockedEventId(eventId);
          setSnapshot(dedupeSnapshot(snap));
        }
      } catch (err) {
        if (mounted) {
          setUnlockedEventId(null);
          setSnapshot(null);
          setError(
            err instanceof Error
              ? err.message
              : 'This Basecamp Dashboard link is invalid or no longer active.',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [eventApi, token]);

  // 1-second live tabular clock & elapsed timer tick
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Resilient full snapshot resync + silent Anonymous Auth re-unlock on expiry
  const resyncDashboardSnapshot = useCallback(async () => {
    if (!unlockedEventId || resyncInFlightRef.current) return;
    resyncInFlightRef.current = true;
    try {
      const fresh = await eventApi.getEventSnapshot(unlockedEventId);
      if (activeRef.current) {
        setSnapshot(dedupeSnapshot(fresh));
      }
    } catch (err) {
      if (
        err instanceof EventAccessError &&
        (err.code === 'UNAUTHORIZED' || err.code === 'FORBIDDEN') &&
        token
      ) {
        try {
          await eventApi.ensureSession();
          const reUnlockedId = await eventApi.unlockDashboard(token);
          const fresh = await eventApi.getEventSnapshot(reUnlockedId);
          if (activeRef.current) {
            setUnlockedEventId(reUnlockedId);
            setSnapshot(dedupeSnapshot(fresh));
            // Force clean channel teardown + resubscribe under refreshed session
            setRealtimeSessionGen((gen) => gen + 1);
          }
        } catch (reAuthErr) {
          if (
            activeRef.current &&
            reAuthErr instanceof EventAccessError &&
            reAuthErr.code === 'INVALID_DASHBOARD_TOKEN'
          ) {
            setUnlockedEventId(null);
            setSnapshot(null);
            setError('This Basecamp Dashboard link is invalid or has been rotated.');
          }
        }
      }
      // Transient network errors remain calm; next 60s poll or reconnect will retry.
    } finally {
      resyncInFlightRef.current = false;
    }
  }, [eventApi, token, unlockedEventId]);

  const handleRealtimeChange = useCallback((change: RealtimeChangeEvent) => {
    setSnapshot((prev) => (prev ? dedupeSnapshot(applyRealtimeChangeToSnapshot(prev, change)) : prev));
  }, []);

  // Stable EventApi wrapper whose identity rotates ONLY when realtimeSessionGen bumps after re-auth
  const realtimeEventApi = useMemo<EventApi>(
    () => ({
      ...eventApi,
      subscribeToEvent: eventApi.subscribeToEvent
        ? (id, handlers) => eventApi.subscribeToEvent!(id, handlers)
        : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventApi, realtimeSessionGen],
  );

  // Continuous subscription (pauseOnBackground: false — never pauses after 30s!)
  const { status: realtimeStatus } = useEventRealtime({
    eventApi: realtimeEventApi,
    eventId: unlockedEventId ?? '',
    enabled: Boolean(unlockedEventId),
    pauseOnBackground: false,
    onChange: handleRealtimeChange,
    onResync: resyncDashboardSnapshot,
  });

  // Degraded-mode 60-second fallback poll STRICTLY while disconnected or reconnecting
  const isDegraded = realtimeStatus === 'disconnected' || realtimeStatus === 'reconnecting';
  useEffect(() => {
    if (!unlockedEventId || !isDegraded) return;
    const pollId = window.setInterval(() => {
      void resyncDashboardSnapshot();
    }, DASHBOARD_FALLBACK_POLL_MS);
    const handleOnline = () => {
      void resyncDashboardSnapshot();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('online', handleOnline);
    };
  }, [unlockedEventId, isDegraded, resyncDashboardSnapshot]);

  // Trigger gentle T-5 min and T-0 chimes when unmuted (deduplicated via firedChimeKeysRef)
  useEffect(() => {
    if (!chimeEnabled || !snapshot) return;
    const triggers = evaluateChimeTriggers(snapshot.rounds, nowMs, firedChimeKeysRef.current);
    for (const trigger of triggers) {
      firedChimeKeysRef.current.add(trigger.key);
      playChimeRef.current(trigger.kind);
    }
  }, [chimeEnabled, snapshot, nowMs]);

  const toggleDashboardTheme = useCallback(() => {
    setDashboardTheme((current) => {
      const next: DashboardTheme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const toggleChime = useCallback(() => {
    setNowMs(Date.now());
    setChimeEnabled((current) => {
      const next = !current;
      if (next) {
        // Unlock browser AudioContext inside user gesture
        getOrCreateAudioContext();
      }
      return next;
    });
  }, []);

  const collectiveKm = useMemo(
    () => (snapshot ? selectCollectiveKm(snapshot) : 0),
    [snapshot],
  );

  const activeRoundNumber = useMemo(
    () => (snapshot ? selectActiveRoundNumber(snapshot, nowMs) : 1),
    [snapshot, nowMs],
  );

  const outOnCourse = useMemo(
    () => (snapshot ? selectOutOnCourseRunners(snapshot, nowMs) : []),
    [snapshot, nowMs],
  );

  const onDeck = useMemo(
    () => (snapshot ? selectOnDeckSummary(snapshot, nowMs) : null),
    [snapshot, nowMs],
  );

  const teamRows = useMemo(
    () => (snapshot ? selectDashboardTeams(snapshot) : []),
    [snapshot],
  );

  const badgeTickerItems = useMemo(
    () => (snapshot ? selectLiveBadgeTickerItems(snapshot) : []),
    [snapshot],
  );

  const liveClockLabel = useMemo(
    () => formatClockTime(nowMs, snapshot?.event.timezone),
    [nowMs, snapshot?.event.timezone],
  );

  if (loading) {
    return (
      <div
        data-theme={dashboardTheme}
        data-testid="dashboard-root"
        className="flex min-h-dvh items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <p className="text-lg font-semibold">Connecting to Basecamp Dashboard…</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div
        data-theme={dashboardTheme}
        data-testid="dashboard-root"
        className="flex min-h-dvh items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <div
          role="alert"
          className="w-full max-w-lg rounded-lg border-2 p-8"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <h1 className="text-xl font-bold">Basecamp Dashboard Unavailable</h1>
          <p className="mt-3 text-base" style={{ color: 'var(--ink-secondary)' }}>
            {error ?? 'This Basecamp Dashboard link is invalid or no longer active.'}
          </p>
          <p className="mt-3 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            Ask your Organizer for the current Basecamp Dashboard URL.
          </p>
        </div>
      </div>
    );
  }

  const isDark = dashboardTheme === 'dark';

  return (
    <div
      data-theme={dashboardTheme}
      data-testid="dashboard-root"
      className="flex min-h-dvh flex-col"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      {/* Full-Width Variant A Airport-Board Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b-2 px-5 py-3.5"
        style={{
          backgroundColor: 'var(--shell-header)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="flex flex-wrap items-center gap-2.5 text-xl font-extrabold tracking-tight sm:text-2xl">
            <span>{snapshot.event.name}</span>
            <span
              className="font-telemetry rounded border px-2 py-0.5 text-xs font-bold tracking-wider uppercase"
              style={{
                backgroundColor: 'var(--shell-dock)',
                borderColor: 'var(--border-strong)',
                color: 'var(--accent-glacier)',
              }}
            >
              Basecamp Dashboard
            </span>
          </h1>

          <p
            data-testid="dashboard-collective-km"
            className="font-telemetry text-base font-bold sm:text-lg"
            style={{ color: 'var(--accent-glacier)' }}
          >
            {collectiveKm} km together
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active Round Pill */}
          <span
            data-testid="dashboard-round-pill"
            className="font-telemetry inline-flex min-h-[44px] items-center rounded-md border px-3 text-sm font-bold"
            style={{
              backgroundColor: 'var(--shell-dock)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-on-shell)',
            }}
          >
            Round {activeRoundNumber} of 10
          </span>

          {/* Live Tabular Clock */}
          <span
            data-testid="dashboard-clock"
            className="font-telemetry inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 text-base font-bold"
            style={{
              backgroundColor: 'var(--shell-dock)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <Clock size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>{liveClockLabel}</span>
          </span>

          {/* Subtle Connection Status Indicator */}
          <span
            data-testid="dashboard-sync-status"
            role="status"
            aria-live="polite"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 text-xs font-bold"
            style={
              isDegraded
                ? {
                    backgroundColor: 'var(--accent-amber-soft)',
                    borderColor: 'var(--accent-amber)',
                    color: 'var(--accent-amber-ink)',
                  }
                : {
                    backgroundColor: 'var(--shell-dock)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-on-shell-muted)',
                  }
            }
          >
            {isDegraded ? (
              <>
                <WifiOff size={15} strokeWidth={2.2} aria-hidden="true" />
                <span>
                  {realtimeStatus === 'reconnecting'
                    ? 'Reconnecting · 60s poll'
                    : 'Offline · 60s poll'}
                </span>
              </>
            ) : (
              <>
                <Radio
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={{ color: 'var(--accent-spruce)' }}
                />
                <span>Live</span>
              </>
            )}
          </span>

          {/* Badges Ticker Toggle */}
          <button
            type="button"
            aria-pressed={showBadges}
            onClick={() => setShowBadges((prev) => !prev)}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-bold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: showBadges ? 'var(--accent-spruce)' : 'var(--shell-dock)',
              borderColor: showBadges ? 'var(--accent-spruce-border)' : 'var(--border-strong)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <Award size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>Badges: {showBadges ? 'ON' : 'OFF'}</span>
          </button>

          {/* Muted-by-Default Chime Toggle */}
          <button
            type="button"
            aria-pressed={chimeEnabled}
            onClick={toggleChime}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-bold transition-opacity hover:opacity-90"
            style={
              chimeEnabled
                ? {
                    backgroundColor: 'var(--accent-amber-cta)',
                    borderColor: 'var(--accent-amber)',
                    color: '#0c1e30',
                  }
                : {
                    backgroundColor: 'var(--shell-dock)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-on-shell)',
                  }
            }
          >
            {chimeEnabled ? (
              <Bell size={16} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
            <span>{chimeEnabled ? 'Chime: ON' : 'Chime: Muted'}</span>
          </button>

          {/* Light / Dark Theme Toggle (Dark Chalet default; High-Contrast Daylight option) */}
          <button
            type="button"
            onClick={toggleDashboardTheme}
            aria-label={isDark ? 'Switch to daylight light theme' : 'Switch to dark chalet theme'}
            title={isDark ? 'Switch to daylight light theme' : 'Switch to dark chalet theme'}
            className="pfl-focus-ring inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-bold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--shell-dock)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-on-shell)',
            }}
          >
            {isDark ? (
              <>
                <Sun size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>Daylight</span>
              </>
            ) : (
              <>
                <Moon size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>Dark Chalet</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main 50/50 Airport-Board Split */}
      <main className="grid flex-1 grid-cols-1 gap-5 p-5 lg:grid-cols-2">
        {/* Left 50% Column: Out on Course + Amber On Deck Banner */}
        <div className="flex flex-col gap-5">
          {/* Out on Course Panel */}
          <section
            aria-label="Out on Course"
            className="flex flex-1 flex-col rounded-xl border-2 p-5"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-structural)',
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2
                className="flex items-center gap-2 text-base font-extrabold tracking-[0.06em] uppercase"
                style={{ color: isDark ? 'var(--accent-glacier)' : 'var(--shell-header)' }}
              >
                <Footprints size={20} strokeWidth={2.3} aria-hidden="true" />
                <span>Out on Course</span>
              </h2>
              <span
                className="font-telemetry rounded-full border px-3 py-0.5 text-sm font-bold"
                style={{
                  backgroundColor: 'var(--bg-rail)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                {outOnCourse.length} active
              </span>
            </div>

            {outOnCourse.length === 0 ? (
              <div
                className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
                style={{
                  backgroundColor: 'var(--bg-rail-subtle)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <p className="text-lg font-bold" style={{ color: 'var(--ink-primary)' }}>
                  Everyone is warming up at Basecamp!
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                  Runners will appear here automatically as soon as their 5K Leg starts.
                </p>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {outOnCourse.map((item) => (
                  <li
                    key={item.legId}
                    data-testid="out-on-course-card"
                    className="overflow-hidden rounded-lg border"
                    style={{
                      backgroundColor: 'var(--bg-out-row)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="font-telemetry rounded px-2 py-0.5 text-xs font-extrabold uppercase"
                            style={{
                              backgroundColor: 'var(--accent-amber-cta)',
                              color: '#0c1e30',
                            }}
                          >
                            OUT · R{item.roundNumber}
                          </span>
                          <span className="truncate text-xl font-extrabold">
                            {item.runnerName}
                          </span>
                        </div>
                        <p
                          className="mt-1 truncate text-sm font-semibold"
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          {item.teamEmoji ? `${item.teamEmoji} ` : ''}
                          {item.teamName} · {item.courseName}
                        </p>
                      </div>

                      <div className="text-right">
                        <div
                          className="font-telemetry text-2xl font-extrabold"
                          style={{
                            color: isDark ? 'var(--accent-glacier)' : 'var(--ink-primary)',
                          }}
                        >
                          {item.elapsedLabel}
                        </div>
                        <div
                          className="text-sm font-semibold"
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          {item.etaLabel}
                        </div>
                      </div>
                    </div>

                    {/* Calm proportional progress bar (never red even past 60 min) */}
                    <div
                      className="h-1.5 w-full"
                      style={{ backgroundColor: 'var(--bg-rail)' }}
                      aria-hidden="true"
                    >
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${item.progressPercent}%`,
                          backgroundColor: item.isOver60Min
                            ? 'var(--accent-glacier)'
                            : 'var(--accent-amber-cta)',
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Amber On Deck Next-Round Countdown Banner */}
          <section
            aria-label="On Deck"
            className="rounded-xl border-2 p-5"
            style={{
              backgroundColor: 'var(--accent-amber-soft)',
              borderColor: 'var(--accent-amber)',
            }}
          >
            {onDeck ? (
              <>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2
                      className="flex items-center gap-2 text-base font-extrabold tracking-[0.06em] uppercase"
                      style={{ color: 'var(--accent-amber-ink)' }}
                    >
                      <Timer size={20} strokeWidth={2.3} aria-hidden="true" />
                      <span>
                        On Deck · Round {onDeck.roundNumber}
                        {onDeck.scheduledStartLabel ? ` (${onDeck.scheduledStartLabel})` : ''}
                      </span>
                    </h2>
                  </div>

                  <div
                    data-testid="ondeck-countdown"
                    className="font-telemetry text-2xl font-black sm:text-3xl"
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    {onDeck.isReadyNow ? 'READY NOW' : `T-${onDeck.countdownLabel}`}
                  </div>
                </div>

                {onDeck.runners.length === 0 ? (
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                    No Runners scheduled yet for Round {onDeck.roundNumber} — check the Teams tab to
                    claim a Leg.
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {onDeck.runners.map((runner) => (
                      <li
                        key={runner.legId}
                        className="rounded-md border px-3 py-1.5 text-sm font-bold sm:text-base"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--accent-amber)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <span>{runner.runnerName}</span>{' '}
                        <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>
                          ({runner.teamEmoji ? `${runner.teamEmoji} ` : ''}
                          {runner.teamName})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                  className="flex items-center gap-2 text-base font-extrabold tracking-[0.06em] uppercase"
                  style={{ color: 'var(--accent-amber-ink)' }}
                >
                  <Trophy size={20} strokeWidth={2.3} aria-hidden="true" />
                  <span>All 10 Rounds Underway</span>
                </h2>
                <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                  Final stretch — cheer every Runner home to 50K!
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Right 50% Column: Alphabetical Teams with Large 10-Segment 50K Progress Bars */}
        <section
          aria-label="Teams 50K Progress"
          className="flex flex-col rounded-xl border-2 p-5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-structural)',
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2
              className="flex items-center gap-2 text-base font-extrabold tracking-[0.06em] uppercase"
              style={{ color: isDark ? 'var(--accent-glacier)' : 'var(--shell-header)' }}
            >
              <Trophy size={20} strokeWidth={2.3} aria-hidden="true" />
              <span>Teams · 50K Progress</span>
            </h2>
            <span
              className="font-telemetry rounded-full border px-3 py-0.5 text-xs font-bold uppercase"
              style={{
                backgroundColor: 'var(--bg-rail)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-secondary)',
              }}
            >
              A–Z · 10 × 5K
            </span>
          </div>

          {teamRows.length === 0 ? (
            <div
              className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
              style={{
                backgroundColor: 'var(--bg-rail-subtle)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <p className="text-lg font-bold" style={{ color: 'var(--ink-primary)' }}>
                No Teams formed yet
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                Teams will show up here alphabetically as Runners join.
              </p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {teamRows.map((row) => (
                <li
                  key={row.team.id}
                  data-testid="dashboard-team-card"
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: 'var(--bg-rail-subtle)',
                    borderColor: 'var(--border-hairline)',
                  }}
                >
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                    <span
                      data-testid="dashboard-team-name"
                      className="text-lg font-extrabold sm:text-xl"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      {row.team.emoji ? `${row.team.emoji} ` : ''}
                      {row.team.name}
                    </span>
                    <span
                      className="font-telemetry text-base font-extrabold"
                      style={{
                        color:
                          row.completedLegsCount >= 10
                            ? 'var(--accent-spruce)'
                            : 'var(--ink-secondary)',
                      }}
                    >
                      {row.completedKm} / 50 km · {row.completedLegsCount}/10 Rounds
                    </span>
                  </div>

                  {/* Large 10-Segment 50K Progress Bar */}
                  <div
                    role="img"
                    aria-label={`${row.team.name}: ${row.completedLegsCount} completed, ${row.outOnCourseCount} out on course, ${row.openCount} open out of 10 Rounds`}
                    className="grid grid-cols-10 gap-1.5"
                  >
                    {row.segments.map((seg) => {
                      const segStyle: React.CSSProperties =
                        seg.status === 'completed'
                          ? {
                              backgroundColor: 'var(--accent-spruce)',
                              borderColor: 'var(--accent-spruce-border)',
                              borderStyle: 'solid',
                            }
                          : seg.status === 'out_on_course'
                            ? {
                                backgroundColor: 'var(--accent-amber-cta)',
                                backgroundImage:
                                  'repeating-linear-gradient(-45deg, transparent 0 4px, rgba(12, 30, 48, 0.25) 4px 6px)',
                                borderColor: 'var(--accent-amber)',
                                borderStyle: 'solid',
                              }
                            : {
                                backgroundColor: 'var(--bg-ground)',
                                borderColor: 'var(--border-strong)',
                                borderStyle: 'dashed',
                              };

                      return (
                        <div
                          key={seg.roundNumber}
                          data-segment-status={seg.status}
                          title={`Round ${seg.roundNumber}: ${
                            seg.status === 'completed'
                              ? 'Completed'
                              : seg.status === 'out_on_course'
                                ? 'Out on Course'
                                : 'Open'
                          }`}
                          className="h-4 rounded-[3px] border"
                          style={segStyle}
                        />
                      );
                    })}
                  </div>

                  {row.milestone && (
                    <div
                      data-testid="dashboard-team-milestone"
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-extrabold"
                      style={
                        row.milestone.kind === '50k_finisher'
                          ? {
                              backgroundColor: 'var(--accent-spruce-soft)',
                              borderColor: 'var(--accent-spruce)',
                              color: 'var(--accent-spruce)',
                            }
                          : {
                              backgroundColor: 'var(--accent-amber-soft)',
                              borderColor: 'var(--accent-amber)',
                              color: 'var(--accent-amber-ink)',
                            }
                      }
                    >
                      <span aria-hidden="true">{row.milestone.emoji}</span>
                      <span>{row.milestone.label}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Optional Toggleable Live Badges Ticker */}
      {showBadges && (
        <section
          aria-label="Live Badges"
          className="border-t-2 px-5 py-3.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-extrabold tracking-[0.06em] uppercase"
              style={{
                backgroundColor: 'var(--shell-header)',
                borderColor: 'var(--shell-header-border)',
                color: 'var(--ink-on-shell)',
              }}
            >
              <Award size={15} strokeWidth={2.2} aria-hidden="true" />
              <span>Live Badges</span>
            </span>

            {badgeTickerItems.length === 0 ? (
              <p className="text-sm font-medium" style={{ color: 'var(--ink-secondary)' }}>
                Badges will light up here as Teams and Runners hit milestones and Organizers hand
                out superlatives!
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-wrap items-center gap-2.5 p-0">
                {badgeTickerItems.map((item) => (
                  <li
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
                    style={{
                      backgroundColor:
                        item.source === 'organizer'
                          ? 'var(--accent-amber-soft)'
                          : 'var(--bg-rail-subtle)',
                      borderColor:
                        item.source === 'organizer'
                          ? 'var(--accent-amber)'
                          : 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <span aria-hidden="true">{item.emoji}</span>
                    <strong className="font-bold">{item.title}</strong>
                    <span style={{ color: 'var(--ink-secondary)' }}>— {item.recipientName}</span>
                    {item.note && (
                      <span className="text-xs italic" style={{ color: 'var(--ink-secondary)' }}>
                        “{item.note}”
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
