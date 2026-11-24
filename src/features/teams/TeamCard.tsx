import {
  AlertTriangle,
  CalendarDays,
  Lock,
  LogOut,
  Unlock,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Leg, Participant, Team } from '../../types/domain';
import {
  ALL_ROUND_NUMBERS,
  getTeamCoverage,
  sanitizeColorHex,
} from './teamScheduleWarnings';

interface TeamCardProps {
  team: Team;
  teamMembers: readonly Participant[];
  legs: readonly Leg[];
  isUsersTeam: boolean;
  canJoin: boolean;
  isRunnerOnAnotherTeam: boolean;
  isOnline: boolean;
  busy: boolean;
  confirmingLeave: boolean;
  onOpenSchedule: (teamId: string) => void;
  onJoinTeam: (teamId: string) => void;
  onRequestLeave: (teamId: string) => void;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
}

export function TeamCard({
  team,
  teamMembers,
  legs,
  isUsersTeam,
  canJoin,
  isRunnerOnAnotherTeam,
  isOnline,
  busy,
  confirmingLeave,
  onOpenSchedule,
  onJoinTeam,
  onRequestLeave,
  onConfirmLeave,
  onCancelLeave,
}: TeamCardProps) {
  const coverage = getTeamCoverage(team.id, legs);
  const accentColor = sanitizeColorHex(team.colorHex);
  const legsByRound = new Map<number, Leg>();
  for (const leg of legs) {
    if (leg.teamId === team.id) {
      legsByRound.set(leg.roundNumber, leg);
    }
  }

  const willAutoDeleteOnLeave =
    isUsersTeam && teamMembers.length <= 1 && coverage.completedCount === 0;

  return (
    <article
      className="overflow-hidden rounded-md border-[1.5px]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: isUsersTeam ? 'var(--shell-header)' : 'var(--border-strong)',
      }}
    >
      {/* Optional crisp geometric top accent bar using Team color */}
      {accentColor && (
        <div
          aria-hidden="true"
          className="h-1.5 w-full"
          style={{ backgroundColor: accentColor }}
        />
      )}

      <div className="p-3.5">
        {/* Header row: Team name/emoji + Open/Closed badge */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {accentColor && (
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 shrink-0 rounded-full border"
                  style={{
                    backgroundColor: accentColor,
                    borderColor: 'var(--border-strong)',
                  }}
                />
              )}
              <h3
                className="truncate text-base font-bold leading-snug"
                style={{ color: 'var(--ink-primary)' }}
              >
                {team.emoji ? `${team.emoji} ` : ''}
                {team.name}
              </h3>
              {isUsersTeam && (
                <span
                  className="inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase"
                  style={{
                    backgroundColor: 'var(--shell-header)',
                    borderColor: 'var(--shell-header)',
                    color: 'var(--ink-on-shell)',
                  }}
                >
                  Your Team
                </span>
              )}
            </div>
            {team.tagline && (
              <p className="mt-0.5 text-sm leading-snug" style={{ color: 'var(--ink-muted)' }}>
                {team.tagline}
              </p>
            )}
          </div>

          {/* Non-color-only Open / Closed badge */}
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
            style={
              team.isOpen
                ? {
                    backgroundColor: 'var(--accent-spruce-soft)',
                    borderColor: 'var(--accent-spruce)',
                    color: 'var(--accent-spruce)',
                  }
                : {
                    backgroundColor: 'var(--bg-rail)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-secondary)',
                  }
            }
          >
            {team.isOpen ? (
              <>
                <Unlock size={12} strokeWidth={2.4} aria-hidden="true" />
                <span>Open</span>
              </>
            ) : (
              <>
                <Lock size={12} strokeWidth={2.4} aria-hidden="true" />
                <span>Closed</span>
              </>
            )}
          </span>
        </div>

        {/* Optional looking-for note */}
        {team.lookingNote && (
          <p
            className="mt-2 rounded border px-2.5 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--ink-muted)',
            }}
          >
            <strong style={{ color: 'var(--ink-primary)' }}>Looking for:</strong>{' '}
            {team.lookingNote}
          </p>
        )}

        {/* Roster summary */}
        <div
          className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--ink-secondary)' }}
        >
          <Users size={13} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
          <span className="truncate">
            {teamMembers.length > 0
              ? `${teamMembers.length} ${teamMembers.length === 1 ? 'Runner' : 'Runners'}: ${teamMembers
                  .map((m) => m.displayName)
                  .join(', ')}`
              : 'No Runners currently on roster'}
          </span>
        </div>

        {/* 10-Round Coverage Bar & Summary */}
        <div
          className="mt-3 border-t pt-2.5"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-bold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
              {coverage.coveredCount} of 10 Rounds covered
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{
                color:
                  coverage.uncoveredRounds.length === 0
                    ? 'var(--accent-spruce)'
                    : 'var(--ink-secondary)',
              }}
            >
              {coverage.uncoveredSummary}
            </span>
          </div>

          {/* Polar Field Log 10-segment hairline coverage strip */}
          <div
            aria-hidden="true"
            className="mt-1.5 grid grid-cols-10 gap-1"
          >
            {ALL_ROUND_NUMBERS.map((roundNumber) => {
              const leg = legsByRound.get(roundNumber);
              let bg = 'var(--bg-ground)';
              let border = 'var(--border-structural)';
              if (leg?.status === 'completed') {
                bg = 'var(--accent-spruce)';
                border = 'var(--accent-spruce-border)';
              } else if (leg?.status === 'out_on_course') {
                bg = 'var(--accent-amber-cta)';
                border = 'var(--accent-amber)';
              } else if (leg?.runnerId) {
                bg = 'var(--shell-header)';
                border = 'var(--shell-header)';
              }
              return (
                <span
                  key={roundNumber}
                  className="h-2 rounded-[2px] border"
                  style={{ backgroundColor: bg, borderColor: border }}
                />
              );
            })}
          </div>

          {/* Explicit uncovered Round chips */}
          {coverage.uncoveredRounds.length > 0 && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1"
              aria-label={`Open Rounds for ${team.name}`}
            >
              {coverage.uncoveredRounds.map((roundNum) => (
                <span
                  key={roundNum}
                  aria-label={`Round ${roundNum} open`}
                  className="inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                  style={{
                    backgroundColor: 'var(--bg-ground)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  R{roundNum}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Inline Leave Team confirmation prompt */}
        {confirmingLeave && isUsersTeam && (
          <div
            role="alert"
            className="mt-3 rounded-md border-[1.5px] p-3"
            style={{
              backgroundColor: 'var(--accent-amber-soft)',
              borderColor: 'var(--accent-amber)',
              color: 'var(--ink-primary)',
            }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={18}
                strokeWidth={2.2}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--accent-amber-ink)' }}
              />
              <div className="text-sm">
                <p className="font-bold">Leave Team &ldquo;{team.name}&rdquo;?</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  You&apos;ll return to Free Agents. Your future scheduled Legs will be unassigned
                  while any completed Legs stay preserved.
                  {willAutoDeleteOnLeave
                    ? ' Because no other Runners or completed Legs remain, this empty Team will be removed automatically.'
                    : ''}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !isOnline}
                onClick={onConfirmLeave}
                className="pfl-focus-ring min-h-[44px] flex-1 cursor-pointer rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
                style={{
                  backgroundColor: 'var(--accent-amber-cta)',
                  color: '#0C1E30',
                }}
              >
                {!isOnline ? 'Requires connection' : busy ? 'Leaving…' : 'Confirm & Leave Team'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onCancelLeave}
                className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3 text-sm font-bold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                Stay on Team
              </button>
            </div>
          </div>
        )}

        {/* Action row (44px+ gloved-thumb touch targets) */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenSchedule(team.id)}
            className="pfl-focus-ring flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-sm font-bold"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--shell-header)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <CalendarDays size={15} strokeWidth={2.2} aria-hidden="true" />
            <span>Open 10-Round Schedule</span>
          </button>

          {canJoin && team.isOpen && (
            <button
              type="button"
              disabled={busy || !isOnline}
              onClick={() => onJoinTeam(team.id)}
              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <UserPlus size={15} strokeWidth={2.3} aria-hidden="true" />
              <span>{!isOnline ? 'Requires connection' : 'Join Team'}</span>
            </button>
          )}

          {isUsersTeam && !confirmingLeave && (
            <button
              type="button"
              disabled={busy || !isOnline}
              onClick={() => onRequestLeave(team.id)}
              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            >
              <LogOut size={15} strokeWidth={2.2} aria-hidden="true" />
              <span>{!isOnline ? 'Requires connection' : 'Leave Team'}</span>
            </button>
          )}
        </div>

        {isRunnerOnAnotherTeam && team.isOpen && !isUsersTeam && (
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            Leave your current Team first if you&apos;d like to join {team.name}.
          </p>
        )}
      </div>
    </article>
  );
}
