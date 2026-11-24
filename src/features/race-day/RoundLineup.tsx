import type { ReactNode } from 'react';
import { Check, Clock, ExternalLink, Pencil, Play } from 'lucide-react';
import type { Course, Leg, Participant, Round, Team } from '../../types/domain';
import { toSafeHttpsUrl } from '../home/urlSafety';
import {
  canActOnLeg,
  canViewLegDuration,
  computeLegEta,
  formatClockTime,
  formatElapsedSeconds,
  getPrimaryCourse,
} from './raceDayUtils';

export interface RoundLineupProps {
  roundNumber: number;
  round: Round | null;
  legs: Leg[];
  participants: Participant[];
  teams: Team[];
  courses: Course[];
  timezone: string | null;
  activeParticipant: Participant | null;
  isOrganizer: boolean;
  nowMs: number;
  busyLegId: string | null;
  headerAction?: ReactNode;
  onStartLeg: (leg: Leg) => void;
  onFinishLeg: (leg: Leg) => void;
  onEditLeg: (leg: Leg) => void;
}

const STATUS_SORT_ORDER: Record<Leg['status'], number> = {
  out_on_course: 0,
  completed: 1,
  scheduled: 2,
};

export function RoundLineup({
  roundNumber,
  round,
  legs,
  participants,
  teams,
  courses,
  timezone,
  activeParticipant,
  isOrganizer,
  nowMs,
  busyLegId,
  headerAction,
  onStartLeg,
  onFinishLeg,
  onEditLeg,
}: RoundLineupProps) {
  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const primaryCourse = getPrimaryCourse(courses);

  const roundLegs = legs.filter((leg) => leg.roundNumber === roundNumber);
  const assignedLegs = roundLegs
    .filter((leg) => leg.runnerId !== null)
    .sort((a, b) => {
      const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      const nameA = participantMap.get(a.runnerId!)?.displayName ?? '';
      const nameB = participantMap.get(b.runnerId!)?.displayName ?? '';
      return nameA.localeCompare(nameB);
    });

  const unassignedLegs = roundLegs
    .filter((leg) => leg.runnerId === null)
    .sort((a, b) => {
      const teamA = teamMap.get(a.teamId)?.name ?? '';
      const teamB = teamMap.get(b.teamId)?.name ?? '';
      return teamA.localeCompare(teamB);
    });

  const outCount = assignedLegs.filter((l) => l.status === 'out_on_course').length;
  const doneCount = assignedLegs.filter((l) => l.status === 'completed').length;
  const waitingCount = assignedLegs.filter((l) => l.status === 'scheduled').length;

  const scheduledTimeLabel = round ? formatClockTime(round.scheduledStartAt, timezone) : '';

  return (
    <section aria-label={`Round ${roundNumber} Lineup`} className="flex flex-col">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2
            className="text-xs font-bold tracking-[0.05em] uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Round {roundNumber} Lineup
          </h2>
          {scheduledTimeLabel && (
            <span
              className="font-telemetry text-xs font-semibold"
              style={{ color: 'var(--ink-muted)' }}
            >
              {scheduledTimeLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="font-telemetry text-xs font-bold"
            style={{ color: 'var(--accent-amber-ink)' }}
          >
            {outCount} Out · {doneCount} Done · {waitingCount} Waiting
          </span>
          {headerAction}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[6px] border-[1.5px]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {assignedLegs.length === 0 && unassignedLegs.length === 0 ? (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            No Legs scheduled for Round {roundNumber} yet. Assign Runners on the Teams tab.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {assignedLegs.map((leg, idx) => {
              const runner = leg.runnerId ? (participantMap.get(leg.runnerId) ?? null) : null;
              const team = teamMap.get(leg.teamId) ?? null;
              const course = (leg.courseId ? courseMap.get(leg.courseId) : null) ?? primaryCourse;
              const canAct = canActOnLeg(leg, activeParticipant, isOrganizer);
              const showDuration = canViewLegDuration(
                leg,
                runner,
                activeParticipant?.id ?? null,
              );
              const eta = computeLegEta(leg, runner, nowMs);
              const safeActivityUrl = toSafeHttpsUrl(leg.externalActivityUrl);
              const isBusy = busyLegId === leg.id;
              const hasNextDivider =
                idx < assignedLegs.length - 1 || unassignedLegs.length > 0;

              return (
                <li
                  key={leg.id}
                  data-testid={`leg-row-${leg.id}`}
                  data-leg-status={leg.status}
                  className="relative px-3 py-2.5"
                  style={{
                    backgroundColor:
                      leg.status === 'out_on_course' ? 'var(--bg-out-row)' : 'transparent',
                    paddingBottom: leg.status === 'out_on_course' ? '14px' : undefined,
                    borderBottom: hasNextDivider
                      ? '1px solid var(--border-hairline)'
                      : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="truncate text-[15px] font-bold"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          {runner?.displayName ?? 'Runner'}
                        </span>

                        {leg.status === 'out_on_course' && (
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.03em] uppercase"
                            style={{
                              backgroundColor: 'var(--accent-amber-soft)',
                              color: 'var(--accent-amber-ink)',
                              border: '1px solid var(--accent-amber)',
                            }}
                          >
                            <Play size={10} strokeWidth={2.75} aria-hidden="true" />
                            Out
                          </span>
                        )}

                        {leg.status === 'completed' && (
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.03em] uppercase"
                            style={{
                              backgroundColor: 'var(--accent-spruce-soft)',
                              color: 'var(--accent-spruce-border)',
                              border: '1px solid var(--accent-spruce)',
                            }}
                          >
                            <Check size={10} strokeWidth={3} aria-hidden="true" />
                            Done
                          </span>
                        )}

                        {leg.status === 'scheduled' && (
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.03em] uppercase"
                            style={{
                              backgroundColor: 'var(--bg-rail-subtle)',
                              color: 'var(--ink-muted)',
                              border: '1px solid var(--border-strong)',
                            }}
                          >
                            <Clock size={10} strokeWidth={2.5} aria-hidden="true" />
                            Waiting
                          </span>
                        )}
                      </div>

                      <p
                        className="mt-0.5 truncate text-[13px] font-medium"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        {team?.name ?? 'Team'}
                        {course ? ` · ${course.name}` : ''}
                      </p>

                      {safeActivityUrl && (
                        <div className="mt-1.5">
                          <a
                            href={safeActivityUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pfl-focus-ring inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold no-underline"
                            style={{
                              backgroundColor: 'var(--bg-rail-subtle)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--ink-primary)',
                            }}
                          >
                            <span>View activity</span>
                            <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Right-side telemetry and role-scoped 44px controls */}
                    <div className="flex shrink-0 items-center gap-2">
                      {leg.status === 'out_on_course' && eta && (
                        <div className="text-right">
                          <div
                            data-testid={`leg-elapsed-${leg.id}`}
                            className="font-telemetry text-[16px] leading-tight font-bold"
                            style={{ color: 'var(--accent-amber-ink)' }}
                          >
                            {formatElapsedSeconds(eta.elapsedSeconds)}
                          </div>
                          <div
                            className="font-telemetry mt-0.5 text-[12px] font-semibold"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            {eta.etaMs !== null
                              ? `ETA ${formatClockTime(eta.etaMs, timezone)}`
                              : 'On course'}
                          </div>
                        </div>
                      )}

                      {leg.status === 'completed' && (
                        <div className="text-right">
                          <div
                            data-testid={`leg-result-${leg.id}`}
                            className="font-telemetry text-[16px] leading-tight font-bold"
                            style={{ color: 'var(--accent-spruce)' }}
                          >
                            {showDuration && leg.durationSeconds !== null
                              ? formatElapsedSeconds(leg.durationSeconds)
                              : '5K ✓'}
                          </div>
                          {leg.finishedAt && (
                            <div
                              className="font-telemetry mt-0.5 text-[12px] font-semibold"
                              style={{ color: 'var(--ink-muted)' }}
                            >
                              {formatClockTime(leg.finishedAt, timezone)}
                            </div>
                          )}
                        </div>
                      )}

                      {canAct && leg.status === 'scheduled' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onStartLeg(leg)}
                          aria-label={`Start ${runner?.displayName ?? 'Runner'} Round ${roundNumber} Leg`}
                          className="pfl-focus-ring flex min-h-[44px] min-w-[82px] cursor-pointer items-center justify-center rounded-[6px] border-0 px-3.5 text-sm font-bold disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--shell-header)',
                            color: 'var(--ink-on-shell)',
                          }}
                        >
                          Start
                        </button>
                      )}

                      {canAct && leg.status === 'out_on_course' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onFinishLeg(leg)}
                          aria-label={`Finish ${runner?.displayName ?? 'Runner'} Round ${roundNumber} Leg`}
                          className="pfl-focus-ring flex min-h-[44px] min-w-[82px] cursor-pointer items-center justify-center rounded-[6px] border-0 px-3.5 text-sm font-bold disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--shell-header)',
                            color: 'var(--ink-on-shell)',
                          }}
                        >
                          Finish
                        </button>
                      )}

                      {canAct && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onEditLeg(leg)}
                          aria-label={`Edit ${runner?.displayName ?? 'Runner'} Round ${roundNumber} Leg`}
                          className="pfl-focus-ring flex h-[44px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border"
                          style={{
                            backgroundColor: 'var(--bg-rail-subtle)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Calm, neutral >60-minute check-in prompt (ZERO red/alarm styling) */}
                  {leg.status === 'out_on_course' && eta?.isOver60Min && canAct && (
                    <div
                      data-testid={`calm-nudge-${leg.id}`}
                      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2"
                      style={{
                        backgroundColor: 'var(--bg-rail-subtle)',
                        borderColor: 'var(--border-structural)',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                        <Clock size={14} aria-hidden="true" />
                        Forgot to check in?
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditLeg(leg)}
                        className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border px-3 text-xs font-bold"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        Log Finish Time
                      </button>
                    </div>
                  )}

                  {/* Flush 4px bottom proportional ETA progress bar */}
                  {leg.status === 'out_on_course' && eta && (
                    <div
                      aria-hidden="true"
                      className="absolute right-0 bottom-0 left-0 h-1"
                      style={{ backgroundColor: 'var(--bg-rail)' }}
                    >
                      <div
                        data-testid={`eta-bar-${leg.id}`}
                        className="h-full transition-[width] duration-300"
                        style={{
                          width: `${eta.progressPercent}%`,
                          backgroundColor: 'var(--accent-amber)',
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}

            {unassignedLegs.map((leg, idx) => {
              const team = teamMap.get(leg.teamId) ?? null;
              const course = (leg.courseId ? courseMap.get(leg.courseId) : null) ?? primaryCourse;
              return (
                <li
                  key={leg.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                  style={
                    idx < unassignedLegs.length - 1
                      ? { borderBottom: '1px solid var(--border-hairline)' }
                      : undefined
                  }
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                      Open slot · {team?.name ?? 'Team'}
                    </div>
                    {course && (
                      <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                        {course.name}
                      </div>
                    )}
                  </div>
                  <span
                    className="rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      backgroundColor: 'var(--bg-ground)',
                      borderColor: 'var(--border-structural)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    Unassigned
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
