import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Course, Leg, LegStatus, Participant, Team } from '../../types/domain';
import { toSafeHttpsUrl } from '../home/urlSafety';
import {
  formatElapsedSeconds,
  getPrimaryCourse,
  parseDurationInput,
} from './raceDayUtils';

export interface LegEditorSavePayload {
  status: LegStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  courseId: string | null;
  externalActivityUrl: string | null;
  isExplicitRevert: boolean;
}

export interface LegEditorDialogProps {
  leg: Leg | null;
  runner: Participant | null;
  team: Team | null;
  courses: Course[];
  nowMs: number;
  saving: boolean;
  onClose: () => void;
  onSave: (leg: Leg, payload: LegEditorSavePayload) => Promise<void>;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: LegStatus; label: string }> = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'out_on_course', label: 'Out on Course' },
  { value: 'completed', label: 'Completed' },
];

function computeInitialDurationText(leg: Leg, targetStatus: LegStatus, nowMs: number): string {
  if (leg.durationSeconds !== null) {
    return formatElapsedSeconds(leg.durationSeconds);
  }
  if (targetStatus === 'completed' && leg.startedAt) {
    const startedMs = Date.parse(leg.startedAt);
    if (!Number.isNaN(startedMs)) {
      const elapsed = Math.max(1, Math.round((nowMs - startedMs) / 1000));
      return formatElapsedSeconds(elapsed);
    }
  }
  return '';
}

export function LegEditorDialog({
  leg,
  runner,
  team,
  courses,
  nowMs,
  saving,
  onClose,
  onSave,
}: LegEditorDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const primaryCourse = getPrimaryCourse(courses);

  const [status, setStatus] = useState<LegStatus>(leg?.status ?? 'scheduled');
  const [courseId, setCourseId] = useState<string>(
    leg?.courseId ?? primaryCourse?.id ?? '',
  );
  const [durationText, setDurationText] = useState<string>(
    leg ? computeInitialDurationText(leg, leg.status, nowMs) : '',
  );
  const [activityUrl, setActivityUrl] = useState<string>(leg?.externalActivityUrl ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const nowMsRef = useRef(nowMs);
  nowMsRef.current = nowMs;

  const legId = leg?.id ?? null;

  useEffect(() => {
    if (!leg) return;
    setStatus(leg.status);
    setCourseId(leg.courseId ?? primaryCourse?.id ?? '');
    setDurationText(computeInitialDurationText(leg, leg.status, nowMsRef.current));
    setActivityUrl(leg.externalActivityUrl ?? '');
    setErrorMessage(null);
    // Re-initialize form only when opening a different Leg
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (leg) {
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
  }, [leg]);

  if (!leg) {
    return null;
  }

  const handleStatusChange = (nextStatus: LegStatus) => {
    setStatus(nextStatus);
    setErrorMessage(null);
    if (nextStatus === 'completed' && !durationText.trim() && leg.startedAt) {
      const startedMs = Date.parse(leg.startedAt);
      if (!Number.isNaN(startedMs)) {
        const elapsed = Math.max(1, Math.round((nowMs - startedMs) / 1000));
        setDurationText(formatElapsedSeconds(elapsed));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent, forceStatus?: LegStatus) => {
    e.preventDefault();
    setErrorMessage(null);

    const targetStatus = forceStatus ?? status;
    const nowIso = new Date(nowMs).toISOString();

    let safeUrl: string | null = null;
    if (activityUrl.trim()) {
      const validated = toSafeHttpsUrl(activityUrl);
      if (!validated) {
        setErrorMessage('Activity link must be a valid https:// URL (up to 500 characters).');
        return;
      }
      safeUrl = validated;
    }

    let durationSeconds: number | null = null;
    if (targetStatus === 'completed') {
      const parsed = parseDurationInput(durationText);
      if (!parsed.valid) {
        setErrorMessage('Enter duration as MM:SS (e.g. 27:30), H:MM:SS, minutes, or leave blank.');
        return;
      }
      durationSeconds = parsed.seconds;
    }

    let startedAt: string | null = leg.startedAt;
    let finishedAt: string | null = leg.finishedAt;

    if (targetStatus === 'scheduled') {
      startedAt = null;
      finishedAt = null;
      durationSeconds = null;
    } else if (targetStatus === 'out_on_course') {
      startedAt = leg.startedAt ?? nowIso;
      finishedAt = null;
      durationSeconds = null;
    } else if (targetStatus === 'completed') {
      finishedAt = leg.finishedAt ?? nowIso;
      if (!startedAt && durationSeconds !== null) {
        const finishedMs = Date.parse(finishedAt);
        startedAt = new Date(finishedMs - durationSeconds * 1000).toISOString();
      }
    }

    const isExplicitRevert =
      (leg.status === 'completed' && targetStatus !== 'completed') ||
      (leg.status === 'out_on_course' && targetStatus === 'scheduled');

    await onSave(leg, {
      status: targetStatus,
      startedAt,
      finishedAt,
      durationSeconds,
      courseId: courseId || primaryCourse?.id || null,
      externalActivityUrl: safeUrl,
      isExplicitRevert,
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-x-3 bottom-3 top-auto mx-auto w-[calc(100%-24px)] max-w-lg rounded-lg border-[1.5px] p-0 shadow-xl"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
        color: 'var(--ink-primary)',
      }}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 id={titleId} className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
              Edit Round {leg.roundNumber} Leg
            </h1>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
              {runner ? runner.displayName : 'Unassigned Runner'}
              {team ? ` · ${team.name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Leg editor"
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

        {/* Status selector (supports Mark Completed or Revert anytime) */}
        <fieldset className="m-0 border-0 p-0">
          <legend
            className="mb-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Leg Status
          </legend>
          <div className="grid grid-cols-3 gap-1.5">
            {STATUS_OPTIONS.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleStatusChange(option.value)}
                  aria-pressed={active}
                  className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-2 text-xs font-bold transition-colors"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--shell-header)',
                          borderColor: 'var(--shell-header)',
                          color: 'var(--ink-on-shell)',
                        }
                      : {
                          backgroundColor: 'var(--bg-ground)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Course picker */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="leg-editor-course"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Course
          </label>
          <select
            id="leg-editor-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="pfl-focus-ring min-h-[44px] rounded-md border-[1.5px] px-3 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            {courses.length === 0 ? (
              <option value="">Default 5K Course</option>
            ) : (
              courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                  {course.isPrimary ? ' (Primary)' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Optional watch duration (editable or blank) when completed */}
        {status === 'completed' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="leg-editor-duration"
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Watch Time (optional)
              </label>
              {durationText.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => setDurationText('')}
                  className="pfl-focus-ring min-h-[36px] cursor-pointer rounded border px-2.5 text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--bg-rail-subtle)',
                    borderColor: 'var(--border-structural)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  Clear time
                </button>
              )}
            </div>
            <input
              id="leg-editor-duration"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 27:30 (or leave blank)"
              value={durationText}
              onChange={(e) => setDurationText(e.target.value)}
              className="pfl-focus-ring font-telemetry min-h-[44px] rounded-md border-[1.5px] px-3 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
            <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
              {runner?.showTimesOnLeaderboard
                ? 'Speed Leaderboard is ON for this Runner — time is visible to friends.'
                : 'Private by default — only this Runner sees their 5K time.'}
            </p>
          </div>
        )}

        {/* Optional external https:// activity link */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="leg-editor-activity-url"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            External Activity Link (optional)
          </label>
          <input
            id="leg-editor-activity-url"
            type="url"
            placeholder="https://www.strava.com/activities/..."
            value={activityUrl}
            onChange={(e) => setActivityUrl(e.target.value)}
            className="pfl-focus-ring min-h-[44px] rounded-md border-[1.5px] px-3 text-sm"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          />
        </div>

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

        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {leg.status === 'scheduled' && status === 'scheduled' && (
            <button
              type="button"
              disabled={saving}
              onClick={(e) => void handleSubmit(e, 'completed')}
              className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3.5 text-sm font-bold disabled:opacity-60"
              style={{
                backgroundColor: 'var(--accent-spruce)',
                borderColor: 'var(--accent-spruce-border)',
                color: 'var(--ink-on-shell)',
              }}
            >
              Mark Completed
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-4 text-sm font-bold"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-0 px-4 text-sm font-bold disabled:opacity-60"
            style={{
              backgroundColor: 'var(--shell-header)',
              color: 'var(--ink-on-shell)',
            }}
          >
            {saving ? 'Saving…' : 'Save Leg'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
