import { Utensils } from 'lucide-react';
import type { Participant } from '../../types/domain';

interface DietaryEntry {
  participantId: string;
  displayName: string;
  note: string;
}

interface DietarySummaryBannerProps {
  participants: Participant[];
}

export function DietarySummaryBanner({ participants }: DietarySummaryBannerProps) {
  const entries: DietaryEntry[] = participants
    .map((participant) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      note: participant.dietaryNotes?.trim() ?? '',
    }))
    .filter((entry) => entry.note.length > 0);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="dietary-summary-heading"
      className="rounded-md border-[1.5px] p-3.5"
      style={{
        backgroundColor: 'var(--bg-rail-subtle)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="dietary-summary-heading"
          className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-primary)' }}
        >
          <Utensils size={14} strokeWidth={2.3} aria-hidden="true" />
          <span>Dietary Summary</span>
        </h2>
        <span
          className="rounded border px-2 py-0.5 text-xs font-bold tabular-nums"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-structural)',
            color: 'var(--ink-secondary)',
          }}
        >
          {entries.length} {entries.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--ink-secondary)' }}>
        Helpful to keep in mind when bringing shared Basecamp food and drinks:
      </p>

      <ul
        className="mt-2.5 divide-y rounded-md border"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        {entries.map((entry) => (
          <li
            key={entry.participantId}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
              {entry.displayName}
            </span>
            <span className="font-medium" style={{ color: 'var(--ink-muted)' }}>
              {entry.note}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
