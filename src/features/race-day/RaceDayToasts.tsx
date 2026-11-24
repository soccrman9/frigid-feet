import { useEffect, useId, useRef, useState } from 'react';
import { RotateCcw, Sparkles, X } from 'lucide-react';
import type { Leg } from '../../types/domain';

export interface UndoToastState {
  id: string;
  message: string;
  previousLegSnapshot: Leg;
}

export interface MilestoneToastState {
  id: string;
  message: string;
}

export interface RaceDayToastsProps {
  undoToast: UndoToastState | null;
  milestoneToast: MilestoneToastState | null;
  statusNotice: string | null;
  hasThumbDock: boolean;
  modalOpen: boolean;
  undoing: boolean;
  onUndo: (undoState: UndoToastState) => void;
  onDismissUndo: () => void;
  onDismissMilestone: () => void;
  onDismissStatusNotice: () => void;
}

export const UNDO_TOAST_DURATION_MS = 8_000;
export const MILESTONE_TOAST_DURATION_MS = 5_000;

function announceToScreenReader(message: string) {
  const doc = document as Document & { ariaNotify?: (text: string) => void };
  if (typeof doc.ariaNotify === 'function') {
    try {
      doc.ariaNotify(message);
    } catch {
      // Fallback live region below still announces cleanly.
    }
  }
}

export function RaceDayToasts({
  undoToast,
  milestoneToast,
  statusNotice,
  hasThumbDock,
  modalOpen,
  undoing,
  onUndo,
  onDismissUndo,
  onDismissMilestone,
  onDismissStatusNotice,
}: RaceDayToastsProps) {
  const popoverId = useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const [focusPaused, setFocusPaused] = useState(false);

  // Strict display priority: Undo > Status notice > Collective milestone (suppressed while a modal dialog is open)
  const activeToastKind = modalOpen
    ? null
    : undoToast
      ? 'undo'
      : statusNotice
        ? 'notice'
        : milestoneToast
          ? 'milestone'
          : null;

  const activeToastId = undoToast?.id ?? statusNotice ?? milestoneToast?.id ?? null;

  // Capture trigger focus when a toast opens and toggle Top-Layer popover="manual"
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;

    if (activeToastKind) {
      if (document.activeElement instanceof HTMLElement && !el.contains(document.activeElement)) {
        priorFocusRef.current = document.activeElement;
      }

      if (typeof el.showPopover === 'function') {
        try {
          if (!el.matches(':popover-open')) {
            el.showPopover();
          }
        } catch {
          el.classList.add(':popover-open');
        }
      } else {
        el.classList.add(':popover-open');
      }
    } else {
      if (typeof el.hidePopover === 'function') {
        try {
          if (el.matches(':popover-open')) {
            el.hidePopover();
          }
        } catch {
          el.classList.remove(':popover-open');
        }
      } else {
        el.classList.remove(':popover-open');
      }
    }
  }, [activeToastKind, activeToastId]);

  // Announce visible toast text (appending "Actions available" when Undo is active)
  const announcementText = undoToast
    ? `${undoToast.message}. Actions available.`
    : statusNotice
      ? statusNotice
      : milestoneToast
        ? milestoneToast.message
        : '';

  useEffect(() => {
    if (announcementText) {
      announceToScreenReader(announcementText);
    }
  }, [announcementText, activeToastId]);

  const onDismissUndoRef = useRef(onDismissUndo);
  const onDismissMilestoneRef = useRef(onDismissMilestone);
  const onDismissStatusNoticeRef = useRef(onDismissStatusNotice);
  onDismissUndoRef.current = onDismissUndo;
  onDismissMilestoneRef.current = onDismissMilestone;
  onDismissStatusNoticeRef.current = onDismissStatusNotice;

  // Auto-dismiss timer (paused whenever keyboard focus is inside the toast)
  useEffect(() => {
    if (!activeToastKind || focusPaused) return;

    const durationMs =
      activeToastKind === 'undo' ? UNDO_TOAST_DURATION_MS : MILESTONE_TOAST_DURATION_MS;

    const timer = window.setTimeout(() => {
      if (activeToastKind === 'undo') {
        onDismissUndoRef.current();
      } else if (activeToastKind === 'notice') {
        onDismissStatusNoticeRef.current();
      } else {
        onDismissMilestoneRef.current();
      }
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [activeToastKind, activeToastId, focusPaused]);

  const restoreFocusIfNeeded = () => {
    const el = popoverRef.current;
    if (el && document.activeElement && el.contains(document.activeElement)) {
      const prior = priorFocusRef.current;
      if (prior && prior.isConnected) {
        prior.focus();
      }
    }
    setFocusPaused(false);
  };

  const bottomOffsetPx = hasThumbDock ? 164 : 68;

  return (
    <div role="region" aria-label="Race Day notifications">
      {/* Pre-populated hidden ARIA live region fallback for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcementText}
      </div>

      <div
        id={popoverId}
        ref={popoverRef}
        {...({ popover: 'manual' } as React.HTMLAttributes<HTMLDivElement>)}
        data-testid="race-day-toast-popover"
        onFocusCapture={() => setFocusPaused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFocusPaused(false);
          }
        }}
        className="pfl-toast-popover fixed inset-x-3 mx-auto w-[calc(100%-24px)] max-w-2xl"
        style={{
          bottom: `${bottomOffsetPx}px`,
          top: 'auto',
          zIndex: 60,
        }}
      >
        {activeToastKind === 'undo' && undoToast && (
          <div
            data-testid="undo-toast"
            className="flex items-center justify-between gap-2 rounded-[8px] border-[1.5px] px-3 py-2 shadow-lg"
            style={{
              backgroundColor: 'var(--shell-dock)',
              borderColor: 'var(--accent-amber-cta)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <span className="min-w-0 flex-1 text-sm font-semibold">{undoToast.message}</span>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={undoing}
                onClick={() => {
                  restoreFocusIfNeeded();
                  onUndo(undoToast);
                }}
                className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-0 px-3.5 text-sm font-bold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--accent-amber-cta)',
                  color: '#0C1E30',
                }}
              >
                <RotateCcw size={15} strokeWidth={2.5} aria-hidden="true" />
                <span>{undoing ? 'Undoing…' : 'Undo'}</span>
              </button>

              <button
                type="button"
                aria-label="Dismiss notification"
                popoverTarget={popoverId}
                popoverTargetAction="hide"
                onClick={() => {
                  restoreFocusIfNeeded();
                  onDismissUndo();
                }}
                className="pfl-focus-ring flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent"
                style={{ color: 'var(--ink-on-shell-muted)' }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {activeToastKind === 'notice' && statusNotice && (
          <button
            type="button"
            data-testid="status-notice-toast"
            onClick={() => {
              restoreFocusIfNeeded();
              onDismissStatusNotice();
            }}
            className="pfl-focus-ring flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] border-[1.5px] px-3.5 py-2.5 text-left shadow-lg"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <span className="text-sm font-semibold">{statusNotice}</span>
            <span className="shrink-0 text-xs font-semibold" style={{ color: '#CFE1F0' }}>
              Tap to dismiss
            </span>
          </button>
        )}

        {activeToastKind === 'milestone' && milestoneToast && (
          <button
            type="button"
            data-testid="milestone-toast"
            onClick={() => {
              restoreFocusIfNeeded();
              onDismissMilestone();
            }}
            className="pfl-focus-ring flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] border-[1.5px] px-3.5 py-2.5 text-left shadow-lg"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--accent-glacier)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Sparkles
                size={16}
                aria-hidden="true"
                className="shrink-0"
                style={{ color: 'var(--accent-glacier)' }}
              />
              <span>{milestoneToast.message}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold" style={{ color: '#CFE1F0' }}>
              Tap to dismiss
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
