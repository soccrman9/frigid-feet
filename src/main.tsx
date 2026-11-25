import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import type { EventApi } from './lib/eventApi';
import { createEventApiFromEnv } from './lib/supabaseEventApi';

let eventApi: EventApi | undefined;
let configurationError: string | undefined;

try {
  eventApi = createEventApiFromEnv();
} catch (err) {
  configurationError =
    err instanceof Error
      ? err.message
      : 'Winter Grind 50K is not configured for a live Supabase backend.';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App eventApi={eventApi} configurationError={configurationError} />
  </StrictMode>,
);
