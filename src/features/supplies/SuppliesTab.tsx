import { useEventData } from '../../state/EventDataContext';

export function SuppliesTab() {
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
          Basecamp Coordination
        </p>
        <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
          Supplies
        </h1>
        <p className="mt-1 text-sm tabular-nums" style={{ color: 'var(--ink-muted)' }}>
          {snapshot.supplyItems.length} Supplies listed · {snapshot.supplyClaims.length} claimed
        </p>
      </section>
    </div>
  );
}
