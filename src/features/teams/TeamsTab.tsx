import { useEventData } from '../../state/EventDataContext';

export function TeamsTab() {
  const { snapshot } = useEventData();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3">
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
          Relay Rosters &amp; 10-Round Schedules
        </p>
        <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
          Teams
        </h1>
        <p className="mt-1 text-sm tabular-nums" style={{ color: 'var(--ink-muted)' }}>
          {snapshot.teams.length} Teams · {snapshot.participants.length} Participants
        </p>
      </section>
    </div>
  );
}
