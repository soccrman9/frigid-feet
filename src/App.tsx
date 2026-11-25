import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { EventApi } from './lib/eventApi';
import { ThemeProvider } from './state/ThemeContext';
import { EventRoutePage } from './features/gate/EventRoutePage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { getLatestEventSnapshot } from './features/offline/offlineDb';

function ActiveEventRedirect({ eventApi }: { eventApi: EventApi }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function lookup() {
      try {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline) {
          const cached = await getLatestEventSnapshot().catch(() => null);
          if (active && cached) {
            setSlug(cached.slug);
          }
          return;
        }
        const activeSlug = await eventApi.getActiveEventSlug();
        if (active) {
          setSlug(activeSlug);
        }
      } catch {
        const cached = await getLatestEventSnapshot().catch(() => null);
        if (active && cached) {
          setSlug(cached.slug);
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

export function AppConfigurationErrorScreen({ message }: { message: string }) {
  return (
    <ThemeProvider>
      <div
        className="flex min-h-dvh items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
      >
        <section
          role="alert"
          className="w-full max-w-md rounded-lg border-[1.5px] p-6"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <p
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Winter Grind 50K
          </p>
          <h1 className="mt-1 text-lg font-bold" style={{ color: 'var(--ink-primary)' }}>
            Event Backend Not Configured
          </h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            {message}
          </p>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
            Organizers: verify <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in your hosting environment and redeploy.
          </p>
        </section>
      </div>
    </ThemeProvider>
  );
}

export function App({
  eventApi,
  configurationError,
}: {
  eventApi?: EventApi;
  configurationError?: string;
}) {
  if (configurationError || !eventApi) {
    return (
      <AppConfigurationErrorScreen
        message={
          configurationError ??
          'Winter Grind 50K is not configured for a live Supabase backend.'
        }
      />
    );
  }

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
