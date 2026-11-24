import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { Leg, Round } from '../../types/domain';
import { getRoundPillState, type RoundPillState } from './raceDayUtils';

export interface RoundPillRailProps {
  rounds: Round[];
  legs: Leg[];
  activeRoundNumber: number;
  selectedRoundNumber: number;
  onSelectRound: (roundNumber: number) => void;
}

const ROUND_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function getPillAriaLabel(roundNumber: number, state: RoundPillState): string {
  if (state === 'active') return `Round ${roundNumber} — active Round`;
  if (state === 'completed') return `Round ${roundNumber} — completed`;
  return `Round ${roundNumber} — upcoming`;
}

export function RoundPillRail({
  rounds,
  legs,
  activeRoundNumber,
  selectedRoundNumber,
  onSelectRound,
}: RoundPillRailProps) {
  const pillRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Auto-center active Round on initial mount and when active Round changes
  useEffect(() => {
    const activePill = pillRefs.current[activeRoundNumber];
    if (activePill && typeof activePill.scrollIntoView === 'function') {
      activePill.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeRoundNumber]);

  return (
    <section
      aria-label="Rounds 1 to 10"
      className="shrink-0 border-b"
      style={{
        backgroundColor: 'var(--bg-rail-subtle)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="mx-auto flex w-full max-w-2xl gap-1.5 overflow-x-auto px-3 py-2">
        {ROUND_NUMBERS.map((roundNumber) => {
          const state = getRoundPillState(roundNumber, activeRoundNumber, rounds, legs);
          const isSelected = roundNumber === selectedRoundNumber;

          const baseStyle: React.CSSProperties =
            state === 'active'
              ? {
                  backgroundColor: 'var(--shell-dock)',
                  borderColor: 'var(--shell-dock)',
                  color: 'var(--ink-on-shell)',
                  boxShadow: 'inset 0 -4px 0 var(--accent-amber-cta)',
                }
              : state === 'completed'
                ? {
                    backgroundColor: 'var(--accent-spruce)',
                    borderColor: 'var(--accent-spruce-border)',
                    color: 'var(--ink-on-shell)',
                  }
                : {
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  };

          const selectedStyle: React.CSSProperties =
            isSelected && state !== 'active'
              ? {
                  outline: '2px solid var(--shell-header)',
                  outlineOffset: '1px',
                }
              : {};

          return (
            <button
              key={roundNumber}
              ref={(el) => {
                pillRefs.current[roundNumber] = el;
              }}
              type="button"
              onClick={() => onSelectRound(roundNumber)}
              aria-pressed={isSelected}
              aria-label={getPillAriaLabel(roundNumber, state)}
              data-round-state={state}
              className="pfl-focus-ring font-telemetry flex h-[44px] min-w-[48px] shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-[6px] border-[1.5px] px-2 text-sm font-bold transition-colors"
              style={{ ...baseStyle, ...selectedStyle }}
            >
              <span>R{roundNumber}</span>
              {state === 'completed' && (
                <Check size={12} strokeWidth={3} aria-hidden="true" className="shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
