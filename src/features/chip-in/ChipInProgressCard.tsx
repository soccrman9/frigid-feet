import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, HeartHandshake } from 'lucide-react';
import type { EventRecord } from '../../types/domain';
import { computeChipInProgress, formatUsd } from './chipInFormatting';

interface ChipInProgressCardProps {
  event: EventRecord;
  chipInTotalCents: number;
}

type PaymentMethod = 'venmo' | 'zelle';

async function copyHandleToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard API unavailable');
}

export function ChipInProgressCard({ event, chipInTotalCents }: ChipInProgressCardProps) {
  const [copiedMethod, setCopiedMethod] = useState<PaymentMethod | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const progress = computeChipInProgress(chipInTotalCents, event.chipInTargetCents);
  const totalFormatted = formatUsd(chipInTotalCents);
  const targetFormatted = formatUsd(event.chipInTargetCents);
  const venmoHandle = event.venmoHandle?.trim() || null;
  const zelleHandle = event.zelleHandle?.trim() || null;
  const breakdownItems = event.chipInBreakdown.filter((item) => item.label.trim().length > 0);
  const suggestedFormatted =
    event.chipInSuggestedCents != null && event.chipInSuggestedCents > 0
      ? formatUsd(event.chipInSuggestedCents)
      : null;

  async function handleCopyHandle(method: PaymentMethod, handle: string) {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
    }

    try {
      await copyHandleToClipboard(handle);
      setCopiedMethod(method);
      setCopyFeedback(`${method === 'venmo' ? 'Venmo' : 'Zelle'} handle copied.`);
      clearTimerRef.current = window.setTimeout(() => {
        setCopiedMethod((current) => (current === method ? null : current));
        setCopyFeedback(null);
      }, 2500);
    } catch {
      setCopiedMethod(null);
      setCopyFeedback(
        `Could not copy automatically — select and copy ${handle} directly.`,
      );
    }
  }

  return (
    <section
      data-testid="chip-in-progress-card"
      aria-labelledby="home-chip-in-heading"
      className="overflow-hidden rounded-md border"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <HeartHandshake
              size={15}
              strokeWidth={2.25}
              aria-hidden="true"
              style={{ color: 'var(--ink-secondary)' }}
            />
            <h2
              id="home-chip-in-heading"
              className="text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Event Chip-In
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
            100% Optional
          </span>
        </div>

        {/* Aggregate progress headline */}
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
            <span className="font-telemetry">{totalFormatted}</span>{' '}
            <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>
              of
            </span>{' '}
            <span className="font-telemetry">{targetFormatted}</span>{' '}
            <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>
              event costs covered
            </span>
          </p>

          {progress.hasTarget && (
            <span
              className="font-telemetry inline-flex items-center gap-1 text-xs font-bold"
              style={{
                color: progress.isCovered ? 'var(--accent-spruce)' : 'var(--ink-secondary)',
              }}
            >
              {progress.isCovered ? (
                <>
                  <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden="true" />
                  <span>Event costs covered</span>
                </>
              ) : (
                <span>{progress.clampedPercentage}%</span>
              )}
            </span>
          )}
        </div>

        {/* Clean progress bar */}
        <div
          role="progressbar"
          aria-label="Event costs covered progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.clampedPercentage}
          aria-valuetext={
            progress.hasTarget
              ? `${totalFormatted} of ${targetFormatted} event costs covered (${progress.clampedPercentage}%)`
              : `${totalFormatted} chipped in with no target set`
          }
          className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full border"
          style={{
            backgroundColor: 'var(--shell-dock)',
            borderColor: 'var(--border-structural)',
          }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress.hasTarget ? progress.clampedPercentage : 0}%`,
              backgroundColor: progress.isCovered
                ? 'var(--accent-spruce)'
                : 'var(--accent-glacier)',
            }}
          />
        </div>

        {/* Reassuring optional copy & suggested amount */}
        <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Totally optional — come run, cheer, and hang out at Basecamp either way. If you&apos;d
          like to help offset shared Event costs, you can chip in off-app anytime.
        </p>

        {!progress.hasTarget && (
          <p className="mt-1 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
            No cost target has been set for this Event — showing up is all that matters.
          </p>
        )}

        {suggestedFormatted && (
          <p
            className="mt-2 inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--ink-primary)',
            }}
          >
            Suggested: <span className="font-telemetry mx-1 font-bold">{suggestedFormatted}</span>
            per friend (any amount — or $0 — is welcome)
          </p>
        )}
      </div>

      {/* Optional itemized cost breakdown */}
      {breakdownItems.length > 0 && (
        <div
          className="border-t px-4 py-3"
          style={{
            backgroundColor: 'var(--bg-rail-subtle)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <p
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            What Event Costs Cover
          </p>
          <ul
            className="m-0 mt-1.5 list-none divide-y p-0"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            {breakdownItems.map((item, idx) => (
              <li
                key={`${item.label}-${idx}`}
                className="flex items-center justify-between gap-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <span className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                  {item.label}
                </span>
                <span
                  className="font-telemetry shrink-0 font-bold"
                  style={{ color: 'var(--ink-secondary)' }}
                >
                  {formatUsd(item.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* One-tap copyable Venmo / Zelle handles */}
      {(venmoHandle || zelleHandle) && (
        <div
          className="flex flex-col gap-2 border-t p-4"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <p
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Off-App Payment Handles
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            {venmoHandle && (
              <button
                type="button"
                onClick={() => void handleCopyHandle('venmo', venmoHandle)}
                aria-label={`Copy Venmo: ${venmoHandle}`}
                className="pfl-focus-ring flex min-h-[44px] flex-1 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left"
                style={{
                  backgroundColor:
                    copiedMethod === 'venmo'
                      ? 'var(--accent-spruce-soft)'
                      : 'var(--bg-rail-subtle)',
                  borderColor:
                    copiedMethod === 'venmo' ? 'var(--accent-spruce)' : 'var(--border-strong)',
                  color:
                    copiedMethod === 'venmo' ? 'var(--accent-spruce)' : 'var(--ink-primary)',
                }}
              >
                <span className="min-w-0">
                  <span
                    className="block text-[11px] font-bold tracking-wider uppercase"
                    style={{
                      color:
                        copiedMethod === 'venmo'
                          ? 'var(--accent-spruce)'
                          : 'var(--ink-secondary)',
                    }}
                  >
                    Venmo
                  </span>
                  <span className="font-telemetry block truncate text-sm font-bold">
                    {venmoHandle}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold">
                  {copiedMethod === 'venmo' ? (
                    <>
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} strokeWidth={2.25} aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </span>
              </button>
            )}

            {zelleHandle && (
              <button
                type="button"
                onClick={() => void handleCopyHandle('zelle', zelleHandle)}
                aria-label={`Copy Zelle: ${zelleHandle}`}
                className="pfl-focus-ring flex min-h-[44px] flex-1 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left"
                style={{
                  backgroundColor:
                    copiedMethod === 'zelle'
                      ? 'var(--accent-spruce-soft)'
                      : 'var(--bg-rail-subtle)',
                  borderColor:
                    copiedMethod === 'zelle' ? 'var(--accent-spruce)' : 'var(--border-strong)',
                  color:
                    copiedMethod === 'zelle' ? 'var(--accent-spruce)' : 'var(--ink-primary)',
                }}
              >
                <span className="min-w-0">
                  <span
                    className="block text-[11px] font-bold tracking-wider uppercase"
                    style={{
                      color:
                        copiedMethod === 'zelle'
                          ? 'var(--accent-spruce)'
                          : 'var(--ink-secondary)',
                    }}
                  >
                    Zelle
                  </span>
                  <span className="font-telemetry block truncate text-sm font-bold">
                    {zelleHandle}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold">
                  {copiedMethod === 'zelle' ? (
                    <>
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} strokeWidth={2.25} aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </span>
              </button>
            )}
          </div>

          {copyFeedback && (
            <p
              role="status"
              aria-live="polite"
              className="text-xs font-semibold"
              style={{ color: 'var(--ink-secondary)' }}
            >
              {copyFeedback}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
