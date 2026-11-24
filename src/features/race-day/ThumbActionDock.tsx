import { Award, Check, Play } from 'lucide-react';
import type { Leg } from '../../types/domain';
import {
  formatCountdown,
  formatElapsedSeconds,
  type ThumbDockState,
} from './raceDayUtils';

export interface ThumbActionDockProps {
  dockState: ThumbDockState;
  busy: boolean;
  onStartLeg: (leg: Leg) => void;
  onFinishLeg: (leg: Leg) => void;
  onViewRecap: () => void;
}

export function ThumbActionDock({
  dockState,
  busy,
  onStartLeg,
  onFinishLeg,
  onViewRecap,
}: ThumbActionDockProps) {
  if (dockState.kind === 'hidden') {
    return null;
  }

  return (
    <section
      aria-label="My Race Day Action"
      data-testid="thumb-action-dock"
      className="shrink-0 border-t-2 px-3 pt-2 pb-2.5"
      style={{
        backgroundColor: 'var(--shell-dock)',
        borderColor: 'var(--border-strong)',
        color: 'var(--ink-on-shell)',
      }}
    >
      <div className="mx-auto w-full max-w-2xl">
        {dockState.kind === 'upcoming' && (
          <>
            <div
              className="font-telemetry mb-1.5 flex items-center justify-between gap-2 text-xs font-bold"
              style={{ color: 'var(--ink-on-shell-muted)' }}
            >
              <span className="truncate">
                NEXT LEG · R{dockState.leg.roundNumber}
                {dockState.course ? ` ${dockState.course.name.toUpperCase()}` : ''}
              </span>
              <span className="shrink-0">{formatCountdown(dockState.countdownSeconds)}</span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onStartLeg(dockState.leg)}
              className="pfl-focus-ring flex h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border-0 px-4 text-[18px] font-bold transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <Play size={20} strokeWidth={2.75} aria-hidden="true" />
              <span>{dockState.countdownSeconds > 0 ? 'Start Early' : 'Start My 5K Leg'}</span>
            </button>
          </>
        )}

        {dockState.kind === 'out_on_course' && (
          <>
            <div
              className="font-telemetry mb-1.5 flex items-center justify-between gap-2 text-xs font-bold"
              style={{ color: 'var(--ink-on-shell-muted)' }}
            >
              <span className="truncate">
                YOUR LEG · R{dockState.leg.roundNumber}
                {dockState.course ? ` ${dockState.course.name.toUpperCase()}` : ''}
              </span>
              <span className="shrink-0">
                OUT {formatElapsedSeconds(dockState.elapsedSeconds)}
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onFinishLeg(dockState.leg)}
              className="pfl-focus-ring flex h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border-0 px-4 text-[18px] font-bold transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <Check size={20} strokeWidth={2.75} aria-hidden="true" />
              <span>Finish My 5K Leg</span>
            </button>
          </>
        )}

        {dockState.kind === 'all_done' && (
          <>
            <div
              className="font-telemetry mb-1.5 flex items-center justify-between gap-2 text-xs font-bold"
              style={{ color: 'var(--ink-on-shell-muted)' }}
            >
              <span>
                ALL ASSIGNED LEGS COMPLETE · {dockState.totalKm} KM
              </span>
              <span>
                {dockState.completedCount} {dockState.completedCount === 1 ? 'LEG' : 'LEGS'}
              </span>
            </div>
            <button
              type="button"
              onClick={onViewRecap}
              className="pfl-focus-ring flex h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border-0 px-4 text-[17px] font-bold transition-opacity hover:opacity-95"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <Award size={20} strokeWidth={2.5} aria-hidden="true" />
              <span>All Done Today — View Event Recap</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
