import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  CheckCircle2,
  Hand,
  Info,
  Lock,
  LogOut,
  Pencil,
  Play,
  ShieldCheck,
  Unlock,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Course, Leg, Participant, Round, Team } from '../../types/domain';
import { TeamCreateForm, type TeamFormValues } from './TeamCreateForm';
import {
  ALL_ROUND_NUMBERS,
  formatRoundStartTime,
  formatRoundWindow,
  getLegScheduleWarnings,
  getTeamCoverage,
  sanitizeColorHex,
} from './teamScheduleWarnings';

interface RoundScheduleBuilderProps {
  team: Team;
  teamMembers: readonly Participant[];
  allParticipants: readonly Participant[];
  teamLegs: readonly Leg[];
  rounds: readonly Round[];
  courses: readonly Course[];
  timezone: string | null;
  activeParticipant: Participant | null;
  isOrganizer: boolean;
  isOnline: boolean;
  busy: boolean;
  onBack: () => void;
  onJoinTeam: (teamId: string) => void;
  onLeaveTeam: () => Promise<void>;
  onUpdateTeam: (teamId: string, values: TeamFormValues) => Promise<void>;
  onUpdateLeg: (
    legId: string,
    patch: { runnerId?: string | null; courseId?: string | null },
  ) => Promise<void>;
  onSwapLegs: (legA: Leg, legB: Leg) => Promise<void>;
}

export function RoundScheduleBuilder({
  team,
  teamMembers,
  allParticipants,
  teamLegs,
  rounds,
  courses,
  timezone,
  activeParticipant,
  isOrganizer,
  isOnline,
  busy,
  onBack,
  onJoinTeam,
  onLeaveTeam,
  onUpdateTeam,
  onUpdateLeg,
  onSwapLegs,
}: RoundScheduleBuilderProps) {
  const [editingTeamInfo, setEditingTeamInfo] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [swapSourceLegId, setSwapSourceLegId] = useState<string | null>(null);

  const isUsersTeam = activeParticipant?.teamId === team.id;
  const isFreeAgent =
    activeParticipant?.rsvpStatus === 'going_runner' && activeParticipant?.teamId === null;
  const canEditSchedule = isUsersTeam || isOrganizer;

  const coverage = useMemo(() => getTeamCoverage(team.id, teamLegs), [team.id, teamLegs]);
  const accentColor = sanitizeColorHex(team.colorHex);

  const participantsById = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of allParticipants) {
      map.set(p.id, p);
    }
    return map;
  }, [allParticipants]);

  const legsByRound = useMemo(() => {
    const map = new Map<number, Leg>();
    for (const leg of teamLegs) {
      if (leg.teamId === team.id) {
        map.set(leg.roundNumber, leg);
      }
    }
    return map;
  }, [team.id, teamLegs]);

  const roundsByNumber = useMemo(() => {
    const map = new Map<number, Round>();
    for (const r of rounds) {
      map.set(r.roundNumber, r);
    }
    return map;
  }, [rounds]);

  const coursesById = useMemo(() => {
    const map = new Map<string, Course>();
    for (const c of courses) {
      map.set(c.id, c);
    }
    return map;
  }, [courses]);

  const sortedCourses = useMemo(
    () =>
      [...courses].sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
      ),
    [courses],
  );

  const swapSourceLeg = useMemo(
    () => (swapSourceLegId ? teamLegs.find((l) => l.id === swapSourceLegId) ?? null : null),
    [swapSourceLegId, teamLegs],
  );

  const willAutoDeleteOnLeave =
    isUsersTeam && teamMembers.length <= 1 && coverage.completedCount === 0;

  async function handleSwapWith(targetLeg: Leg) {
    if (!swapSourceLeg || swapSourceLeg.id === targetLeg.id) {
      setSwapSourceLegId(null);
      return;
    }
    await onSwapLegs(swapSourceLeg, targetLeg);
    setSwapSourceLegId(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 pb-6">
      {/* Back navigation */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-[1.5px] px-3 text-sm font-bold"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--ink-primary)',
          }}
        >
          <ArrowLeft size={16} strokeWidth={2.3} aria-hidden="true" />
          <span>All Teams</span>
        </button>

        {canEditSchedule && (
          <button
            type="button"
            disabled={busy || !isOnline}
            onClick={() => setEditingTeamInfo((prev) => !prev)}
            className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-[1.5px] px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
            style={{
              backgroundColor: editingTeamInfo ? 'var(--bg-rail)' : 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>{editingTeamInfo ? 'Close Settings' : 'Team Settings'}</span>
          </button>
        )}
      </div>

      {/* Team Overview Header Card */}
      <section
        className="overflow-hidden rounded-md border-[1.5px]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {accentColor && (
          <div aria-hidden="true" className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />
        )}
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {accentColor && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border"
                    style={{ backgroundColor: accentColor, borderColor: 'var(--border-strong)' }}
                  />
                )}
                <h1 className="text-xl font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
                  {team.emoji ? `${team.emoji} ` : ''}
                  {team.name}
                </h1>
              </div>
              {team.tagline && (
                <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-muted)' }}>
                  {team.tagline}
                </p>
              )}
            </div>

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

          {team.lookingNote && (
            <p
              className="mt-2.5 rounded border px-2.5 py-1.5 text-xs font-medium"
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

          {/* Roster & Coverage summary */}
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs font-semibold tabular-nums"
            style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-secondary)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users size={13} strokeWidth={2.2} aria-hidden="true" />
              <span>
                {teamMembers.length > 0
                  ? teamMembers.map((m) => m.displayName).join(', ')
                  : 'No Runners on roster yet'}
              </span>
            </span>
            <span style={{ color: 'var(--ink-primary)' }}>
              {coverage.coveredCount} of 10 Rounds covered · {coverage.uncoveredSummary}
            </span>
          </div>

          {/* Join / Leave controls */}
          {(isFreeAgent && team.isOpen) || isUsersTeam ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {isFreeAgent && team.isOpen && (
                <button
                  type="button"
                  disabled={busy || !isOnline}
                  onClick={() => onJoinTeam(team.id)}
                  className="pfl-focus-ring flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
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
                  onClick={() => setConfirmingLeave(true)}
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
          ) : null}

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
                  onClick={() => void onLeaveTeam()}
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
                  onClick={() => setConfirmingLeave(false)}
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
        </div>
      </section>

      {/* Optional inline Team Settings editor */}
      {editingTeamInfo && canEditSchedule && (
        <TeamCreateForm
          mode="edit"
          initialValues={{
            name: team.name,
            tagline: team.tagline,
            colorHex: team.colorHex,
            emoji: team.emoji,
            isOpen: team.isOpen,
            lookingNote: team.lookingNote,
          }}
          isOnline={isOnline}
          busy={busy}
          onSubmit={async (values) => {
            await onUpdateTeam(team.id, values);
            setEditingTeamInfo(false);
          }}
          onCancel={() => setEditingTeamInfo(false)}
        />
      )}

      {/* 10-Row Round 1–10 Schedule Builder */}
      <section
        aria-labelledby="round-schedule-heading"
        className="overflow-hidden rounded-md border-[1.5px]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div
          className="border-b px-4 py-3"
          style={{
            backgroundColor: 'var(--bg-rail-subtle)',
            borderColor: 'var(--border-structural)',
          }}
        >
          <p
            className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <CalendarDays size={14} strokeWidth={2.3} aria-hidden="true" />
            <span>10 × 5K Relay Plan</span>
          </p>
          <h2
            id="round-schedule-heading"
            className="mt-0.5 text-lg font-bold"
            style={{ color: 'var(--ink-primary)' }}
          >
            Round 1–10 Schedule Builder
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
            Unlimited and back-to-back Legs are always allowed — no roster lock. Gentle heads-ups
            appear when a Round is outside a Runner&apos;s RSVP window or back-to-back.
          </p>
        </div>

        {/* Organizer Override notice when editing another Team's schedule */}
        {isOrganizer && !isUsersTeam && (
          <div
            className="flex items-start gap-2 border-b px-4 py-2.5 text-xs"
            style={{
              backgroundColor: 'var(--accent-amber-soft)',
              borderColor: 'var(--accent-amber)',
              color: 'var(--ink-primary)',
            }}
          >
            <ShieldCheck
              size={15}
              strokeWidth={2.3}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--accent-amber-ink)' }}
            />
            <span>
              <strong style={{ color: 'var(--accent-amber-ink)' }}>Organizer Override:</strong>{' '}
              You can edit {team.name}&apos;s settings and 10-Round schedule regardless of Team
              membership.
            </span>
          </div>
        )}

        {/* Read-only notice for non-teammates */}
        {!canEditSchedule && (
          <div
            className="flex items-start gap-2 border-b px-4 py-2.5 text-xs"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--ink-muted)',
            }}
          >
            <Info
              size={15}
              strokeWidth={2.2}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--shell-header)' }}
            />
            <span>
              <strong style={{ color: 'var(--ink-primary)' }}>View-only schedule.</strong>{' '}
              Teammates on {team.name} and Event Organizers can assign, claim, swap, or edit Legs.
            </span>
          </div>
        )}

        {canEditSchedule && !isOnline && (
          <div
            role="status"
            className="flex items-start gap-2 border-b px-4 py-2.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--ink-muted)',
            }}
          >
            <Info
              size={15}
              strokeWidth={2.2}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--shell-header)' }}
            />
            <span>Requires connection to edit Round assignments or Courses.</span>
          </div>
        )}

        {/* Active Swap mode banner */}
        {swapSourceLeg && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--accent-amber-soft)',
              borderColor: 'var(--accent-amber)',
              color: 'var(--ink-primary)',
            }}
          >
            <span className="flex items-center gap-1.5">
              <ArrowLeftRight size={15} aria-hidden="true" />
              <span>
                Swapping Round {swapSourceLeg.roundNumber} — choose another Round below to swap
                Runners.
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSwapSourceLegId(null)}
              className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3 text-xs font-bold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            >
              Cancel Swap
            </button>
          </div>
        )}

        {/* 10 Hairline-divided Round rows */}
        <ol className="m-0 list-none divide-y p-0" style={{ borderColor: 'var(--border-hairline)' }}>
          {ALL_ROUND_NUMBERS.map((roundNumber) => {
            const leg = legsByRound.get(roundNumber);
            const round = roundsByNumber.get(roundNumber);
            const startTimeLabel = formatRoundStartTime(round?.scheduledStartAt, timezone);
            const assignedRunner = leg?.runnerId ? participantsById.get(leg.runnerId) ?? null : null;
            const assignedCourse = leg?.courseId ? coursesById.get(leg.courseId) ?? null : null;
            const warnings = leg
              ? getLegScheduleWarnings(leg, teamLegs, participantsById)
              : [];
            const isSwapSource = Boolean(leg && swapSourceLegId === leg.id);
            const isCompleted = leg?.status === 'completed';
            const isOutOnCourse = leg?.status === 'out_on_course';
            const canModifyRunner = Boolean(
              canEditSchedule && leg && (leg.status === 'scheduled' || isOrganizer),
            );

            // Include historical runner in select if they left the Team after being assigned/completing
            const runnerOptions = [...teamMembers];
            if (assignedRunner && !runnerOptions.some((m) => m.id === assignedRunner.id)) {
              runnerOptions.push(assignedRunner);
            }

            return (
              <li
                key={roundNumber}
                className="flex flex-col gap-2 px-3.5 py-3"
                style={{
                  borderColor: 'var(--border-hairline)',
                  backgroundColor: isSwapSource
                    ? 'var(--accent-amber-soft)'
                    : isOutOnCourse
                      ? 'var(--bg-out-row)'
                      : 'var(--bg-surface)',
                }}
              >
                {/* Top row: Round label, start time, status badge, quick actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex min-w-[44px] items-center justify-center rounded border px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: isCompleted
                          ? 'var(--accent-spruce)'
                          : isOutOnCourse
                            ? 'var(--accent-amber-cta)'
                            : assignedRunner
                              ? 'var(--shell-header)'
                              : 'var(--bg-rail)',
                        borderColor: isCompleted
                          ? 'var(--accent-spruce-border)'
                          : isOutOnCourse
                            ? 'var(--accent-amber)'
                            : assignedRunner
                              ? 'var(--shell-header)'
                              : 'var(--border-strong)',
                        color: isCompleted
                          ? '#FFFFFF'
                          : isOutOnCourse
                            ? '#0C1E30'
                            : assignedRunner
                              ? 'var(--ink-on-shell)'
                              : 'var(--ink-primary)',
                      }}
                    >
                      R{roundNumber}
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
                      Round {roundNumber}
                    </span>
                    {startTimeLabel && (
                      <span
                        className="font-telemetry text-xs font-semibold"
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        {startTimeLabel}
                      </span>
                    )}
                    {isCompleted && (
                      <span
                        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold"
                        style={{
                          backgroundColor: 'var(--accent-spruce-soft)',
                          borderColor: 'var(--accent-spruce)',
                          color: 'var(--accent-spruce)',
                        }}
                      >
                        <CheckCircle2 size={12} aria-hidden="true" />
                        <span>Completed</span>
                      </span>
                    )}
                    {isOutOnCourse && (
                      <span
                        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold"
                        style={{
                          backgroundColor: 'var(--accent-amber-soft)',
                          borderColor: 'var(--accent-amber)',
                          color: 'var(--accent-amber-ink)',
                        }}
                      >
                        <Play size={11} aria-hidden="true" />
                        <span>Out on Course</span>
                      </span>
                    )}
                  </div>

                  {/* Quick Claim / Unassign / Swap buttons (44px+ touch targets) */}
                  {canEditSchedule && leg && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {swapSourceLeg ? (
                        isSwapSource ? (
                          <button
                            type="button"
                            onClick={() => setSwapSourceLegId(null)}
                            className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3 text-xs font-bold"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--ink-primary)',
                            }}
                          >
                            Cancel
                          </button>
                        ) : (
                          canModifyRunner && (
                            <button
                              type="button"
                              disabled={busy || !isOnline}
                              aria-label={`Swap with Round ${roundNumber}`}
                              onClick={() => void handleSwapWith(leg)}
                              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border-0 px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-65"
                              style={{
                                backgroundColor: 'var(--accent-amber-cta)',
                                color: '#0C1E30',
                              }}
                            >
                              <ArrowLeftRight size={13} aria-hidden="true" />
                              <span>Swap with R{roundNumber}</span>
                            </button>
                          )
                        )
                      ) : (
                        <>
                          {!leg.runnerId && isUsersTeam && activeParticipant && (
                            <button
                              type="button"
                              disabled={busy || !isOnline}
                              aria-label={`Claim Round ${roundNumber}`}
                              onClick={() =>
                                void onUpdateLeg(leg.id, { runnerId: activeParticipant.id })
                              }
                              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border-0 px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-65"
                              style={{
                                backgroundColor: 'var(--accent-amber-cta)',
                                color: '#0C1E30',
                              }}
                            >
                              <Hand size={13} aria-hidden="true" />
                              <span>Claim</span>
                            </button>
                          )}

                          {leg.runnerId && canModifyRunner && (
                            <button
                              type="button"
                              disabled={busy || !isOnline}
                              aria-label={`Unassign Round ${roundNumber}`}
                              onClick={() => void onUpdateLeg(leg.id, { runnerId: null })}
                              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border-[1.5px] px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-65"
                              style={{
                                backgroundColor: 'var(--bg-ground)',
                                borderColor: 'var(--border-strong)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              <UserMinus size={13} aria-hidden="true" />
                              <span>Unassign</span>
                            </button>
                          )}

                          {canModifyRunner && (
                            <button
                              type="button"
                              disabled={busy || !isOnline}
                              aria-label={`Swap Round ${roundNumber}`}
                              onClick={() => setSwapSourceLegId(leg.id)}
                              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border-[1.5px] px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-65"
                              style={{
                                backgroundColor: 'var(--bg-ground)',
                                borderColor: 'var(--border-strong)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              <ArrowLeftRight size={13} aria-hidden="true" />
                              <span>Swap</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Controls or read-only display */}
                {canEditSchedule && leg ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`leg-runner-${roundNumber}`}
                        className="mb-1 block text-[11px] font-bold tracking-wider uppercase"
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        Runner
                      </label>
                      <select
                        id={`leg-runner-${roundNumber}`}
                        aria-label={`Round ${roundNumber} Runner`}
                        value={leg.runnerId ?? ''}
                        disabled={busy || !isOnline || !canModifyRunner}
                        onChange={(e) => {
                          const nextRunnerId = e.target.value || null;
                          void onUpdateLeg(leg.id, { runnerId: nextRunnerId });
                        }}
                        className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
                        style={{
                          backgroundColor: 'var(--bg-ground)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <option value="">Unassigned (Open)</option>
                        {runnerOptions.map((runner) => {
                          const hasCustomWindow =
                            runner.availableFromRound !== 1 || runner.availableToRound !== 10;
                          const windowHint = hasCustomWindow
                            ? ` (${formatRoundWindow(
                                runner.availableFromRound,
                                runner.availableToRound,
                              )})`
                            : '';
                          const youHint =
                            runner.id === activeParticipant?.id ? ' (You)' : '';
                          return (
                            <option key={runner.id} value={runner.id}>
                              {runner.displayName}
                              {youHint}
                              {windowHint}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={`leg-course-${roundNumber}`}
                        className="mb-1 block text-[11px] font-bold tracking-wider uppercase"
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        Course
                      </label>
                      {sortedCourses.length > 0 ? (
                        <select
                          id={`leg-course-${roundNumber}`}
                          aria-label={`Round ${roundNumber} Course`}
                          value={leg.courseId ?? ''}
                          disabled={busy || !isOnline}
                          onChange={(e) => {
                            const nextCourseId = e.target.value || null;
                            void onUpdateLeg(leg.id, { courseId: nextCourseId });
                          }}
                          className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
                          style={{
                            backgroundColor: 'var(--bg-ground)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          {!leg.courseId && <option value="">Select Course</option>}
                          {sortedCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name}
                              {course.isPrimary ? ' (Primary)' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p
                          className="flex min-h-[44px] items-center rounded-md border px-2.5 text-xs font-medium"
                          style={{
                            backgroundColor: 'var(--bg-ground)',
                            borderColor: 'var(--border-hairline)',
                            color: 'var(--ink-secondary)',
                          }}
                        >
                          Course TBD
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span
                      className="font-semibold"
                      style={{
                        color: assignedRunner ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                      }}
                    >
                      {assignedRunner ? assignedRunner.displayName : 'Open — Unassigned'}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                      {assignedCourse ? assignedCourse.name : 'Course TBD'}
                    </span>
                  </div>
                )}

                {/* Calm, non-blocking warnings (never red!) */}
                {warnings.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {warnings.map((warning) => (
                      <div
                        key={`${roundNumber}-${warning.kind}`}
                        className="flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs font-semibold"
                        style={{
                          backgroundColor: 'var(--accent-amber-soft)',
                          borderColor: 'var(--accent-amber)',
                          color: 'var(--accent-amber-ink)',
                        }}
                      >
                        <AlertTriangle
                          size={14}
                          strokeWidth={2.2}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0"
                        />
                        <span>{warning.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
