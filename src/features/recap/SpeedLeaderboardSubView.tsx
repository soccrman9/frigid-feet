import { useMemo, useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Timer } from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import { formatElapsedSeconds } from '../race-day/raceDayUtils';
import {
  computeSpeedLeaderboard,
  type SpeedLeaderboardSort,
} from './speedLeaderboard';

export function SpeedLeaderboardSubView() {
  const { snapshot, activeParticipant } = useEventData();
  const [sortBy, setSortBy] = useState<SpeedLeaderboardSort>('fastest');

  const entries = useMemo(
    () =>
      computeSpeedLeaderboard({
        participants: snapshot.participants,
        legs: snapshot.legs,
        teams: snapshot.teams,
        courses: snapshot.courses,
        sortBy,
      }),
    [snapshot.participants, snapshot.legs, snapshot.teams, snapshot.courses, sortBy],
  );

  const isRunner = activeParticipant?.rsvpStatus === 'going_runner';
  const isOptedIn = Boolean(activeParticipant?.showTimesOnLeaderboard);

  return (
    <section aria-label="Speed Board" className="flex flex-col gap-3">
      {/* Header & gentle opt-in privacy note */}
      <div
        className="rounded-[6px] border-[1.5px] p-3.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Timer size={18} style={{ color: 'var(--ink-secondary)' }} aria-hidden="true" />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--ink-primary)' }}>
              Speed Board
            </h2>
          </div>
          <span
            className="rounded border px-2 py-0.5 text-[11px] font-bold"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-structural)',
              color: 'var(--ink-secondary)',
            }}
          >
            Individual · Opt-In Only
          </span>
        </div>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          Joining is completely optional — only Runners who turn on{' '}
          <strong style={{ color: 'var(--ink-primary)' }}>Speed Leaderboard</strong> in their{' '}
          <strong style={{ color: 'var(--ink-primary)' }}>Home</strong> profile appear here. Times
          stay private by default, and there are never Team speed rankings.
        </p>

        {activeParticipant && (
          <div
            className="mt-2.5 flex items-start gap-2 rounded-[5px] border px-2.5 py-2 text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--ink-secondary)',
            }}
          >
            {isRunner && isOptedIn ? (
              <>
                <Eye
                  size={14}
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--accent-spruce)' }}
                  aria-hidden="true"
                />
                <span>
                  Your timed 5K Legs are currently visible here. You can switch back to private
                  anytime in your <strong>Home</strong> profile.
                </span>
              </>
            ) : (
              <>
                <EyeOff
                  size={14}
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--ink-secondary)' }}
                  aria-hidden="true"
                />
                <span>
                  {isRunner
                    ? 'Your times are private (default). Toggle Speed Leaderboard on in your Home profile anytime if you want to join.'
                    : 'Viewable by all friends — cheer everyone on at Basecamp, no pressure on pace.'}
                </span>
              </>
            )}
          </div>
        )}

        {/* 44px gloved-thumb sort toggle between Fastest 5K & Average 5K */}
        <div
          role="group"
          aria-label="Sort Speed Board"
          className="mt-3 grid grid-cols-2 gap-1.5 rounded-[5px] border p-1"
          style={{
            backgroundColor: 'var(--bg-rail)',
            borderColor: 'var(--border-structural)',
          }}
        >
          <button
            type="button"
            aria-pressed={sortBy === 'fastest'}
            onClick={() => setSortBy('fastest')}
            className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-center rounded-[4px] px-2 text-xs font-bold transition-colors"
            style={
              sortBy === 'fastest'
                ? {
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--ink-primary)',
                    border: '1.5px solid var(--shell-header)',
                  }
                : {
                    backgroundColor: 'transparent',
                    color: 'var(--ink-muted)',
                    border: '1.5px solid transparent',
                  }
            }
          >
            Fastest 5K
          </button>
          <button
            type="button"
            aria-pressed={sortBy === 'average'}
            onClick={() => setSortBy('average')}
            className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-center rounded-[4px] px-2 text-xs font-bold transition-colors"
            style={
              sortBy === 'average'
                ? {
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--ink-primary)',
                    border: '1.5px solid var(--shell-header)',
                  }
                : {
                    backgroundColor: 'transparent',
                    color: 'var(--ink-muted)',
                    border: '1.5px solid transparent',
                  }
            }
          >
            Average 5K
          </button>
        </div>
      </div>

      {/* Individual rankings list */}
      <div
        className="overflow-hidden rounded-[6px] border-[1.5px]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {entries.length === 0 ? (
          <div className="flex items-start gap-2.5 px-4 py-4">
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--accent-spruce)' }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                No opted-in timed 5K Legs yet
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                Once opted-in Runners finish timed 5K Legs, their fastest single 5K and average 5K
                time will appear here. Completely optional — untimed Legs and private profiles
                never show up.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-[2.25rem_1fr_auto_auto] items-center gap-2 border-b px-3 py-2 text-[11px] font-bold tracking-wider uppercase"
              style={{
                backgroundColor: 'var(--bg-rail-subtle)',
                borderColor: 'var(--border-structural)',
                color: 'var(--ink-secondary)',
              }}
            >
              <span>Rank</span>
              <span>Runner</span>
              <span className="text-right">Fastest</span>
              <span className="min-w-[4.25rem] text-right">Avg 5K</span>
            </div>

            <ol className="m-0 list-none p-0">
              {entries.map((entry, idx) => {
                const isSelf = activeParticipant?.id === entry.participantId;
                return (
                  <li
                    key={entry.participantId}
                    data-testid="speed-leaderboard-row"
                    className="grid grid-cols-[2.25rem_1fr_auto_auto] items-center gap-2 px-3 py-2.5"
                    style={{
                      backgroundColor: isSelf ? 'var(--accent-spruce-soft)' : 'transparent',
                      ...(idx < entries.length - 1
                        ? { borderBottom: '1px solid var(--border-hairline)' }
                        : {}),
                    }}
                  >
                    <span
                      className="font-telemetry inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold"
                      style={{
                        backgroundColor:
                          entry.rank === 1 ? 'var(--accent-amber-soft)' : 'var(--bg-rail-subtle)',
                        borderColor:
                          entry.rank === 1 ? 'var(--accent-amber)' : 'var(--border-structural)',
                        color:
                          entry.rank === 1 ? 'var(--accent-amber-ink)' : 'var(--ink-primary)',
                      }}
                    >
                      #{entry.rank}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="truncate text-[15px] font-bold"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          {entry.displayName}
                        </span>
                        {isSelf && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--accent-spruce)',
                              border: '1px solid var(--accent-spruce)',
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-secondary)' }}>
                        {entry.teamName
                          ? `${entry.teamEmoji ? `${entry.teamEmoji} ` : ''}${entry.teamName} · `
                          : ''}
                        {entry.timedLegsCount} timed {entry.timedLegsCount === 1 ? 'Leg' : 'Legs'}
                        {` · Best R${entry.fastestLegRoundNumber}`}
                        {entry.fastestLegCourseName ? ` (${entry.fastestLegCourseName})` : ''}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className="font-telemetry block text-[15px] font-bold"
                        style={{
                          color:
                            sortBy === 'fastest' ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                        }}
                      >
                        {formatElapsedSeconds(entry.fastestLegSeconds)}
                      </span>
                      <span
                        className="block text-[10px] font-semibold uppercase"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        Best
                      </span>
                    </div>

                    <div className="min-w-[4.25rem] text-right">
                      <span
                        className="font-telemetry block text-[15px] font-bold"
                        style={{
                          color:
                            sortBy === 'average' ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                        }}
                      >
                        {formatElapsedSeconds(entry.averageSeconds)}
                      </span>
                      <span
                        className="block text-[10px] font-semibold uppercase"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        Avg
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
