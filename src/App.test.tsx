import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { InMemoryEventApi, InMemoryEventStore } from './lib/inMemoryEventApi';

function createTestApi() {
  const store = new InMemoryEventStore();
  store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Secret Lakeside Pavilion',
  });
  return new InMemoryEventApi(store);
}

describe('App routing, Event invite gate, and URL stripping', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects / to the active Event /e/:slug and shows the invite gate without leaking private Event details', async () => {
    const api = createTestApi();
    render(<App eventApi={api} />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/e/2027');
    });

    expect(await screen.findByRole('textbox', { name: /invite code/i })).toBeInTheDocument();
    expect(screen.queryByText('Secret Lakeside Pavilion')).not.toBeInTheDocument();
    expect(screen.queryByText('Winter Grind 50K 2027')).not.toBeInTheDocument();
  });

  it('auto-unlocks on /e/:slug?code=<valid>, strips ?code= via history.replaceState, and enters the Polar Field Log shell after Participant check-in', async () => {
    const api = createTestApi();
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/e/2027?code=FROST-2027');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    render(<App eventApi={api} />);

    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('Winter Grind 50K 2027')).toBeInTheDocument();

    expect(window.location.pathname).toBe('/e/2027');
    expect(window.location.search).toBe('');
    expect(replaceSpy).toHaveBeenCalled();

    // Unlocked session without a saved Participant presents the honor-system picker before entering the 4-tab shell
    expect(await screen.findByRole('heading', { name: /who's checking in/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/your name/i), 'Alex Rivera');
    await user.click(screen.getByRole('button', { name: /join event/i }));

    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });

  it('shows clear error feedback on invalid manual invite code and unlocks on valid manual invite code', async () => {
    const api = createTestApi();
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/e/2027');

    render(<App eventApi={api} />);

    const input = await screen.findByRole('textbox', { name: /invite code/i });
    const submitBtn = screen.getByRole('button', { name: /unlock event/i });

    await user.type(input, 'WRONG-CODE');
    await user.click(submitBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/did not match/i);
    expect(screen.queryByText('Secret Lakeside Pavilion')).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'FROST-2027');
    await user.click(submitBtn);

    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('Winter Grind 50K 2027')).toBeInTheDocument();
  });

  it('strips invalid ?code= from URL immediately and surfaces error feedback on the invite gate', async () => {
    const api = createTestApi();
    window.history.replaceState(null, '', '/e/2027?code=INVALID');

    render(<App eventApi={api} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/did not match/i);
    expect(window.location.pathname).toBe('/e/2027');
    expect(window.location.search).toBe('');
    expect(screen.queryByText('Secret Lakeside Pavilion')).not.toBeInTheDocument();
  });

  it('unlocks read-only Basecamp Dashboard on /dashboard/:token and rejects invalid tokens', async () => {
    const api = createTestApi();
    window.history.replaceState(null, '', '/dashboard/dash-token-2027');

    const { unmount } = render(<App eventApi={api} />);
    expect(await screen.findByRole('heading', { name: /Basecamp Dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('Winter Grind 50K 2027')).toBeInTheDocument();
    unmount();

    const api2 = createTestApi();
    window.history.replaceState(null, '', '/dashboard/bad-token');
    render(<App eventApi={api2} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i);
  });
});
