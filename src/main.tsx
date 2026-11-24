import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { createEventApiFromEnv } from './lib/supabaseEventApi';

const eventApi = createEventApiFromEnv();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App eventApi={eventApi} />
  </StrictMode>,
);
