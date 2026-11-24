import { useEventData } from '../../state/EventDataContext';
import { ParticipantProfileCard } from '../participant/ParticipantProfileCard';

export function HomeTab() {
  const { snapshot } = useEventData();
  const { event, rounds, courses } = snapshot;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3">
      <ParticipantProfileCard />

      <section
        className="rounded-md border p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <p
          className="text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Event Info Hub
        </p>
        <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
          {event.name}
        </h1>
        {event.basecampName && (
          <p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
            Basecamp: {event.basecampName}
            {event.basecampAddress ? ` · ${event.basecampAddress}` : ''}
          </p>
        )}
        <div
          className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs font-semibold tabular-nums"
          style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-secondary)' }}
        >
          <div>{rounds.length} Hourly Rounds</div>
          <div>{courses.length} Named Courses</div>
        </div>
      </section>
    </div>
  );
}
