import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { EventApi } from './lib/eventApi';
import { ThemeProvider } from './state/ThemeContext';
import { EventRoutePage } from './features/gate/EventRoutePage';
import { DashboardPage } from './features/dashboard/DashboardPage';

function ActiveEventRedirect({ eventApi }: { eventApi: EventApi }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function lookup() {
      try {
        const activeSlug = await eventApi.getActiveEventSlug();
        if (active) {
          setSlug(activeSlug);
        }
      } finally {
        if (active) {
          setLoaded(true);
        }
      }
    }
    void lookup();
    return () => {
      active = false;
    };
  }, [eventApi]);

  if (!loaded) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <p className="text-base font-semibold">Opening Winter Grind 50K…</p>
      </div>
    );
  }

  if (slug) {
    return <Navigate to={`/e/${encodeURIComponent(slug)}`} replace />;
  }

  return (
    <div
      className="flex min-h-dvh items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      <section
        className="w-full max-w-md rounded-lg border p-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <h1 className="text-lg font-bold">Winter Grind 50K</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          No active Event is currently scheduled. Ask your Organizer for your Event invite link.
        </p>
      </section>
    </div>
  );
}

export function App({ eventApi }: { eventApi: EventApi }) {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ActiveEventRedirect eventApi={eventApi} />} />
          <Route path="/e/:slug" element={<EventRoutePage eventApi={eventApi} />} />
          <Route path="/dashboard/:token" element={<DashboardPage eventApi={eventApi} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
