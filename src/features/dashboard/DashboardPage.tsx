import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { EventApi } from '../../lib/eventApi';
import type { EventSnapshot } from '../../types/domain';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';

export function DashboardPage({ eventApi }: { eventApi: EventApi }) {
  const { token } = useParams<{ token: string }>();
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) {
        setError('Missing Basecamp Dashboard token.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await eventApi.ensureSession();
        const eventId = await eventApi.unlockDashboard(token);
        const snap = await eventApi.getEventSnapshot(eventId);
        if (active) {
          setSnapshot(snap);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to open Basecamp Dashboard.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [eventApi, token]);

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <p className="text-base font-semibold">Connecting to Basecamp Dashboard…</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <div
          role="alert"
          className="w-full max-w-md rounded-md border p-6"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--accent-error-border)',
          }}
        >
          <h1 className="text-lg font-bold">Basecamp Dashboard Unavailable</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            {error ?? 'This Basecamp Dashboard link is no longer active.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      <header
        className="flex h-12 items-center justify-between border-b px-4"
        style={{
          backgroundColor: 'var(--shell-header)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex items-center gap-2 font-bold">
          <span>{snapshot.event.name}</span>
          <span
            className="font-telemetry rounded border px-2 py-0.5 text-xs"
            style={{
              backgroundColor: 'var(--shell-dock)',
              borderColor: 'var(--border-strong)',
              color: 'var(--accent-glacier)',
            }}
          >
            READ-ONLY DASHBOARD
          </span>
        </div>
        <ThemeToggleButton />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <h1 className="text-2xl font-bold">Basecamp Dashboard</h1>
        <p className="mt-2 text-sm tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
          {snapshot.teams.length} Teams · {snapshot.rounds.length} Rounds
        </p>
      </main>
    </div>
  );
}
