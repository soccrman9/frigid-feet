import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { getSavedParticipantId, saveParticipantId } from './participantStorage';

async function createSeededEventFixture() {
  const store = new InMemoryEventStore();
  const event2027Id = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
  });

  const api = new InMemoryEventApi(store);
  await api.unlockEvent('2027', 'FROST-2027');

  const maya = await api.createParticipant(event2027Id, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 27,
    isFirst5k: false,
    dietaryNotes: 'No peanuts',
    showTimesOnLeaderboard: false,
  });

  const samir = await api.createParticipant(event2027Id, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_supporter',
    teamId: null,
    availableFromRound: 2,
    availableToRound: 8,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  return { store, api, event2027Id, maya, samir };
}

describe('Honor-system Participant picker & per-Event persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/e/2027');
  });

  it('shows existing Participants and walk-in option when unlocked without selection, persists selection per Event, and restores on reload', async () => {
    const { store, api, event2027Id, maya } = await createSeededEventFixture();
    const user = userEvent.setup();

    const { unmount } = render(<App eventApi={api} />);

    // Picker is displayed with existing Participants and walk-in trigger, zero password/PIN/email inputs
    expect(await screen.findByRole('heading', { name: /who's checking in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Maya Chen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Samir Patel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I'm new — add my name/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password|pin|email/i)).not.toBeInTheDocument();

    // Selecting Maya enters the 4-tab app and saves per-Event participant_id
    await user.click(screen.getByRole('button', { name: /Maya Chen/i }));

    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(getSavedParticipantId(event2027Id)).toBe(maya.id);
    unmount();

    // Remounting /e/2027 restores Maya directly into the 4-tab app
    const remounted = render(<App eventApi={api} />);
    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /who's checking in/i })).not.toBeInTheDocument();
    remounted.unmount();

    // A second Event remains scoped independently and shows its own Participant picker
    const event2028Id = store.createEvent({
      slug: '2028',
      name: 'Winter Grind 50K 2028',
      eventDate: '2028-01-08',
      startTime: '2028-01-08T13:00:00.000Z',
      timezone: 'America/New_York',
      inviteCode: 'FROST-2028',
      organizerPasscode: 'HOST-2028',
      dashboardToken: 'dash-token-2028',
      isActive: false,
    });
    await api.unlockEvent('2028', 'FROST-2028');
    expect(getSavedParticipantId(event2028Id)).toBeNull();

    window.history.replaceState(null, '', '/e/2028');
    render(<App eventApi={api} />);
    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('Winter Grind 50K 2028')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /who's checking in/i })).toBeInTheDocument();
  });

  it('creates a walk-in Participant with Rounds 1–10 and showTimesOnLeaderboard defaulted to OFF', async () => {
    const { api, event2027Id } = await createSeededEventFixture();
    const user = userEvent.setup();

    render(<App eventApi={api} />);

    await user.click(await screen.findByRole('button', { name: /I'm new — add my name/i }));

    // Empty submission shows validation error
    await user.click(screen.getByRole('button', { name: /join event/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your name/i);

    await user.type(screen.getByLabelText(/your name/i), 'Jordan Lee');
    await user.click(screen.getByRole('radio', { name: /Going \(Runner\)/i }));
    await user.click(screen.getByLabelText(/first 5k/i));
    await user.click(screen.getByRole('button', { name: /join event/i }));

    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();

    const savedId = getSavedParticipantId(event2027Id);
    expect(savedId).toBeTruthy();

    const snapshot = await api.getEventSnapshot(event2027Id);
    const created = snapshot.participants.find((p) => p.id === savedId);
    expect(created).toMatchObject({
      displayName: 'Jordan Lee',
      rsvpStatus: 'going_runner',
      availableFromRound: 1,
      availableToRound: 10,
      isFirst5k: true,
      showTimesOnLeaderboard: false,
    });
  });

  it('falls back gracefully to the Participant picker when a saved participant_id no longer exists on the server', async () => {
    const { api, event2027Id } = await createSeededEventFixture();
    saveParticipantId(event2027Id, 'deleted-participant-id');

    render(<App eventApi={api} />);

    expect(await screen.findByRole('heading', { name: /who's checking in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Maya Chen/i })).toBeInTheDocument();
    expect(getSavedParticipantId(event2027Id)).toBeNull();
  });
});
