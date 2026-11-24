import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Play, WifiOff, X } from 'lucide-react';
import type { Course, Leg, Participant, Round, Team } from '../../types/domain';
import { formatClockTime, getPrimaryCourse } from './raceDayUtils';

export interface StartRoundSheetProps {
  roundNumber: number;
  round: Round | null;
  legs: Leg[];
  participants: Participant[];
  teams: Team[];
  courses: Course[];
  timezone: string | null;
  isOnline: boolean;
  onOpenChange?: (open: boolean) => void;
  onStartRound: (
    roundNumber: number,
    excludeLegIds: string[],
    startedAt: string,
  ) => Promise<number>;
}

export function StartRoundSheet({
  roundNumber,
  round,
  legs,
  participants,
  teams,
  courses,
  timezone,
  isOnline,
  onOpenChange,
  onStartRound,
}: StartRoundSheetProps) {
  const titleId = useId();
  const offlineHintId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [excludedLegIds, setExcludedLegIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const participantMap = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants],
  );
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const primaryCourse = useMemo(() => getPrimaryCourse(courses), [courses]);

  const roundLegs = useMemo(
    () => legs.filter((leg) => leg.roundNumber === roundNumber),
    [legs, roundNumber],
  );

  // Only assigned 'scheduled' Runners appear in the quick-uncheck checklist
  const scheduledLegs = useMemo(
    () =>
      roundLegs
        .filter((leg) => leg.runnerId !== null && leg.status === 'scheduled')
        .sort((a, b) => {
          const nameA = participantMap.get(a.runnerId!)?.displayName ?? '';
          const nameB = participantMap.get(b.runnerId!)?.displayName ?? '';
          return nameA.localeCompare(nameB);
        }),
    [roundLegs, participantMap],
  );

  const alreadyOutCount = useMemo(
    () => roundLegs.filter((l) => l.runnerId !== null && l.status === 'out_on_course').length,
    [roundLegs],
  );
  const alreadyDoneCount = useMemo(
    () => roundLegs.filter((l) => l.runnerId !== null && l.status === 'completed').length,
    [roundLegs],
  );
  const unassignedCount = useMemo(
    () => roundLegs.filter((l) => l.runnerId === null).length,
    [roundLegs],
  );

  const openSheet = () => {
    if (!isOnline) return;
    setExcludedLegIds(new Set());
    setErrorMessage(null);
    setIsOpen(true);
    onOpenChange?.(true);
  };

  const closeSheet = () => {
    if (submitting) return;
    setIsOpen(false);
    setErrorMessage(null);
    onOpenChange?.(false);
  };

  // Close sheet cleanly if the user switches Rounds while closed/open
  useEffect(() => {
    setExcludedLegIds(new Set());
    setErrorMessage(null);
  }, [roundNumber]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [isOpen]);

  const toggleRunner = (legId: string) => {
    setExcludedLegIds((prev) => {
      const next = new Set(prev);
      if (next.has(legId)) {
        next.delete(legId);
      } else {
        next.add(legId);
      }
      return next;
    });
  };

  const selectedCount = scheduledLegs.filter((leg) => !excludedLegIds.has(leg.id)).length;
  const scheduledTimeLabel = round ? formatClockTime(round.scheduledStartAt, timezone) : '';

  const untouchedParts: string[] = [];
  if (alreadyOutCount > 0) untouchedParts.push(`${alreadyOutCount} already out`);
  if (alreadyDoneCount > 0) untouchedParts.push(`${alreadyDoneCount} completed`);
  if (unassignedCount > 0) {
    untouchedParts.push(
      `${unassignedCount} unassigned ${unassignedCount === 1 ? 'slot' : 'slots'}`,
    );
  }

  const handleConfirm = async () => {
    if (!isOnline || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    const excludeIds = scheduledLegs
      .filter((leg) => excludedLegIds.has(leg.id))
      .map((leg) => leg.id);
    const startedAt = new Date(Date.now()).toISOString();

    try {
      await onStartRound(roundNumber, excludeIds, startedAt);
      setIsOpen(false);
      onOpenChange?.(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : `Could not start Round ${roundNumber}.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!isOnline}
        aria-describedby={!isOnline ? offlineHintId : undefined}
        onClick={openSheet}
        data-testid={`start-round-${roundNumber}-button`}
        className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-[1.5px] px-3.5 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-65"
        style={
          isOnline
            ? {
                backgroundColor: 'var(--accent-amber-cta)',
                borderColor: 'var(--accent-amber)',
                color: '#0C1E30',
              }
            : {
                backgroundColor: 'var(--bg-rail)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-secondary)',
              }
        }
      >
        {isOnline ? (
          <Play size={15} strokeWidth={2.75} aria-hidden="true" />
        ) : (
          <WifiOff size={15} strokeWidth={2.25} aria-hidden="true" />
        )}
        <span>Start Round {roundNumber}</span>
      </button>

      {!isOnline && (
        <span
          id={offlineHintId}
          className="text-xs font-semibold"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Requires connection
        </span>
      )}

      {isOpen && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onCancel={(e) => {
            e.preventDefault();
            closeSheet();
          }}
          className="fixed inset-x-3 bottom-3 top-auto mx-auto w-[calc(100%-24px)] max-w-lg rounded-lg border-[1.5px] p-0 shadow-xl"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--ink-primary)',
          }}
        >
          <div className="flex max-h-[85dvh] flex-col gap-3 p-4">
            {/* Sheet header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2
                  id={titleId}
                  className="text-base font-bold"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  Start Round {roundNumber}
                </h2>
                <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
                  {scheduledTimeLabel ? `${scheduledTimeLabel} · ` : ''}
                  {scheduledLegs.length > 0
                    ? `${selectedCount} of ${scheduledLegs.length} waiting ${
                        scheduledLegs.length === 1 ? 'Runner' : 'Runners'
                      } ready to start`
                    : `No waiting Runners assigned in Round ${roundNumber}`}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={closeSheet}
                aria-label="Close Start Round sheet"
                className="pfl-focus-ring flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border"
                style={{
                  backgroundColor: 'var(--bg-rail-subtle)',
                  borderColor: 'var(--border-structural)',
                  color: 'var(--ink-primary)',
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Guidance & individual revert note */}
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {scheduledLegs.length > 0
                ? 'Uncheck any late starters before starting. If someone is started by mistake, revert them individually right from the lineup.'
                : `Confirming will record Round ${roundNumber}'s official start time without changing existing Legs.`}
            </p>

            {/* Quick-uncheck list of assigned 'scheduled' Runners */}
            {scheduledLegs.length > 0 && (
              <div
                className="max-h-[45dvh] overflow-y-auto rounded-[6px] border"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <ul className="m-0 list-none p-0">
                  {scheduledLegs.map((leg, idx) => {
                    const runner = leg.runnerId ? (participantMap.get(leg.runnerId) ?? null) : null;
                    const team = teamMap.get(leg.teamId) ?? null;
                    const course =
                      (leg.courseId ? courseMap.get(leg.courseId) : null) ?? primaryCourse;
                    const isChecked = !excludedLegIds.has(leg.id);

                    return (
                      <li
                        key={leg.id}
                        style={
                          idx < scheduledLegs.length - 1
                            ? { borderBottom: '1px solid var(--border-hairline)' }
                            : undefined
                        }
                      >
                        <label
                          className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 px-3 py-2"
                          style={{
                            backgroundColor: isChecked ? 'var(--bg-surface)' : 'var(--bg-ground)',
                            opacity: isChecked ? 1 : 0.78,
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={submitting}
                              onChange={() => toggleRunner(leg.id)}
                              className="h-5 w-5 shrink-0 cursor-pointer accent-[#163A59]"
                            />
                            <div className="min-w-0">
                              <div
                                className="truncate text-sm font-bold"
                                style={{ color: 'var(--ink-primary)' }}
                              >
                                {runner?.displayName ?? 'Runner'}
                              </div>
                              <div
                                className="truncate text-xs font-medium"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                {team?.name ?? 'Team'}
                                {course ? ` · ${course.name}` : ''}
                              </div>
                            </div>
                          </div>

                          <span
                            className="shrink-0 rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                            style={
                              isChecked
                                ? {
                                    backgroundColor: 'var(--accent-amber-soft)',
                                    borderColor: 'var(--accent-amber)',
                                    color: 'var(--accent-amber-ink)',
                                  }
                                : {
                                    backgroundColor: 'var(--bg-rail-subtle)',
                                    borderColor: 'var(--border-strong)',
                                    color: 'var(--ink-secondary)',
                                  }
                            }
                          >
                            {isChecked ? 'Starting' : 'Skipped'}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {untouchedParts.length > 0 && (
              <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                Left untouched: {untouchedParts.join(' · ')}.
              </p>
            )}

            {!isOnline && (
              <p
                role="alert"
                className="rounded-md border px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--bg-rail-subtle)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                Requires connection to start a Round.
              </p>
            )}

            {errorMessage && (
              <p
                role="alert"
                className="rounded-md border px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--accent-error-bg)',
                  borderColor: 'var(--accent-error-border)',
                  color: 'var(--accent-error)',
                }}
              >
                {errorMessage}
              </p>
            )}

            {/* Sheet actions */}
            <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={closeSheet}
                className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-4 text-sm font-bold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!isOnline || submitting}
                onClick={() => void handleConfirm()}
                className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--accent-amber-cta)',
                  borderColor: 'var(--accent-amber)',
                  color: '#0C1E30',
                }}
              >
                <Play size={15} strokeWidth={2.75} aria-hidden="true" />
                <span>
                  {submitting
                    ? `Starting Round ${roundNumber}…`
                    : scheduledLegs.length > 0
                      ? `Confirm Start Round ${roundNumber} (${selectedCount})`
                      : `Confirm Start Round ${roundNumber}`}
                </span>
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
