import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { ThemeProvider } from '../state/ThemeContext';
import { EventDataProvider } from '../state/EventDataContext';
import { InMemoryEventApi, InMemoryEventStore } from '../lib/inMemoryEventApi';
import type { EventSnapshot } from '../types/domain';

async function buildUnlockedFixture(): Promise<{
  api: InMemoryEventApi;
  eventId: string;
  snapshot: EventSnapshot;
}> {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'WINTER50K',
    organizerPasscode: 'ORGANIZER50K',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
  });
  const api = new InMemoryEventApi(store);
  await api.unlockEvent('2027', 'WINTER50K');
  const snapshot = await api.getEventSnapshot(eventId);
  return { api, eventId, snapshot };
}

describe('AppShell & Polar Field Log Theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('renders the 48px header with Event title, live tabular clock, 44x44 theme toggle, and 4-tab bottom nav', async () => {
    const { api, eventId, snapshot } = await buildUnlockedFixture();
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell />
        </EventDataProvider>
      </ThemeProvider>,
    );

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Winter Grind 50K 2027')).toBeInTheDocument();
    expect(within(banner).getByTestId('live-clock')).toHaveTextContent(/\d{1,2}:\d{2}/);

    const toggleBtn = screen.getByRole('button', { name: /switch to dark theme/i });
    expect(toggleBtn).toBeInTheDocument();

    // 4-tab bottom navigation
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav).toBeInTheDocument();

    const homeTab = screen.getByRole('button', { name: /^Home$/i });
    const teamsTab = screen.getByRole('button', { name: /^Teams$/i });
    const raceDayTab = screen.getByRole('button', { name: /^Race Day$/i });
    const suppliesTab = screen.getByRole('button', { name: /^Supplies$/i });

    expect(homeTab).toHaveAttribute('aria-current', 'page');

    await user.click(teamsTab);
    expect(teamsTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: /Teams/i })).toBeInTheDocument();

    await user.click(raceDayTab);
    expect(raceDayTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: /Race Day/i })).toBeInTheDocument();

    await user.click(suppliesTab);
    expect(suppliesTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: /Supplies/i })).toBeInTheDocument();
  });

  it('honors prefers-color-scheme and persists manual Light/Dark theme toggles', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    try {
      const { api, eventId, snapshot } = await buildUnlockedFixture();
      const user = userEvent.setup();

      render(
        <ThemeProvider>
          <EventDataProvider
            eventApi={api}
            eventId={eventId}
            initialSnapshot={snapshot}
            initialGrants={['participant']}
          >
            <AppShell />
          </EventDataProvider>
        </ThemeProvider>,
      );

      expect(document.documentElement.dataset.theme).toBe('dark');
      const toLightBtn = screen.getByRole('button', { name: /switch to light theme/i });
      await user.click(toLightBtn);

      expect(document.documentElement.dataset.theme).toBe('light');
      expect(localStorage.getItem('wg50k_theme')).toBe('light');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
