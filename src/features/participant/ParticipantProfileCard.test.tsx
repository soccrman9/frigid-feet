import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { saveParticipantId } from './participantStorage';

async function createHomeProfileFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
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

  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const samir = await api.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_supporter',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: 'Vegetarian',
    showTimesOnLeaderboard: false,
  });

  return { store, api, eventId, maya, samir };
}

describe('Home Participant Profile & RSVP Editor', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/e/2027');
  });

  it('displays the signed-in Participant on Home, allows switching Participants, validates Round bounds, and saves profile updates with Speed Leaderboard OFF by default', async () => {
    const { api, eventId, maya, samir } = await createHomeProfileFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);

    // Shows active Participant identity on Home
    const profileRegion = await screen.findByRole('region', { name: /your profile/i });
    expect(within(profileRegion).getByText('Maya Chen')).toBeInTheDocument();
    expect(within(profileRegion).getByText(/Going \(Runner\)/i)).toBeInTheDocument();
    expect(within(profileRegion).getByText(/Rounds 1–10/i)).toBeInTheDocument();

    // Open profile editor
    await user.click(within(profileRegion).getByRole('button', { name: /edit profile & rsvp/i }));

    // Speed Leaderboard toggle starts OFF with reassuring privacy copy
    const leaderboardToggle = screen.getByRole('checkbox', {
      name: /show my 5k times & join speed leaderboard/i,
    });
    expect(leaderboardToggle).not.toBeChecked();
    expect(screen.getByText(/OFF by default.*stay private/i)).toBeInTheDocument();

    // Round availability defaults to 1..10 and rejects from > to
    const fromSelect = screen.getByLabelText(/available from round/i);
    const toSelect = screen.getByLabelText(/available to round/i);
    expect(fromSelect).toHaveValue('1');
    expect(toSelect).toHaveValue('10');

    await user.selectOptions(fromSelect, '7');
    await user.selectOptions(toSelect, '4');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/start round must be on or before end round/i);

    // Fix Round window to 2..8 and edit all fields (keeping Speed Leaderboard OFF first)
    await user.selectOptions(fromSelect, '2');
    await user.selectOptions(toSelect, '8');

    const nameInput = screen.getByLabelText(/display name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Maya C.');

    await user.click(screen.getByRole('radio', { name: /maybe/i }));
    await user.type(screen.getByLabelText(/rough 5k pace/i), '29');
    await user.click(screen.getByRole('checkbox', { name: /first 5k!/i }));
    await user.type(screen.getByLabelText(/dietary notes/i), 'Gluten-free snacks');

    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/profile saved/i);

    // Verify persistence on server scoped ONLY to Maya (Samir unchanged)
    const afterFirstSave = await api.getEventSnapshot(eventId);
    const updatedMaya = afterFirstSave.participants.find((p) => p.id === maya.id);
    const untouchedSamir = afterFirstSave.participants.find((p) => p.id === samir.id);

    expect(updatedMaya).toMatchObject({
      displayName: 'Maya C.',
      rsvpStatus: 'maybe',
      availableFromRound: 2,
      availableToRound: 8,
      rough5kMinutes: 29,
      isFirst5k: true,
      dietaryNotes: 'Gluten-free snacks',
      showTimesOnLeaderboard: false,
    });
    expect(untouchedSamir).toMatchObject({
      displayName: 'Samir Patel',
      rsvpStatus: 'going_supporter',
      dietaryNotes: 'Vegetarian',
    });

    // Can also opt in to Speed Leaderboard explicitly
    await user.click(within(profileRegion).getByRole('button', { name: /edit profile & rsvp/i }));
    await user.click(
      screen.getByRole('checkbox', { name: /show my 5k times & join speed leaderboard/i }),
    );
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/profile saved/i);

    const afterOptIn = await api.getEventSnapshot(eventId);
    expect(afterOptIn.participants.find((p) => p.id === maya.id)?.showTimesOnLeaderboard).toBe(true);

    // Switch Participant at any time -> returns to picker -> pick Samir
    await user.click(within(profileRegion).getByRole('button', { name: /switch participant/i }));
    expect(await screen.findByRole('heading', { name: /who's checking in/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Samir Patel/i }));
    const samirProfileRegion = await screen.findByRole('region', { name: /your profile/i });
    expect(within(samirProfileRegion).getByText('Samir Patel')).toBeInTheDocument();
  });

  it('confirms leaving a Team when switching RSVP away from Going (Runner) and clears scheduled Legs', async () => {
    const { api, eventId, maya, samir } = await createHomeProfileFixture();
    const team = await api.createTeam(eventId, {
      name: 'Frostbite Fighters',
      tagline: 'Cold toes, warm hearts',
      colorHex: '#163A59',
      emoji: '❄️',
      isOpen: true,
      lookingNote: null,
    });

    // Put both Maya and another runner on the Team so the Team persists after Maya leaves
    const teammate = await api.createParticipant(eventId, {
      displayName: 'Alex Rivera',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });
    await api.updateParticipant(eventId, maya.id, { teamId: team.id });

    // Assign Maya to Round 1 (scheduled) and Round 2 (completed)
    const initialSnap = await api.getEventSnapshot(eventId);
    const round1Leg = initialSnap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
    const round2Leg = initialSnap.legs.find((l) => l.teamId === team.id && l.roundNumber === 2)!;
    await api.updateLeg(eventId, round1Leg.id, { runnerId: maya.id });
    await api.updateLeg(eventId, round2Leg.id, {
      runnerId: maya.id,
      status: 'completed',
      finishedAt: '2027-01-09T14:28:00.000Z',
    });

    expect(samir.teamId).toBeNull();
    expect(teammate.teamId).toBe(team.id);

    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);

    const profileRegion = await screen.findByRole('region', { name: /your profile/i });
    expect(within(profileRegion).getByText(/Team: Frostbite Fighters/i)).toBeInTheDocument();

    await user.click(within(profileRegion).getByRole('button', { name: /edit profile & rsvp/i }));
    await user.click(screen.getByRole('radio', { name: /Going \(Supporter\)/i }));
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    // Confirmation callout appears before leaving Team
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Frostbite Fighters/i);

    // Confirming calls leaveTeam and saves the updated RSVP
    await user.click(screen.getByRole('button', { name: /confirm & leave team/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/profile saved/i);

    const updatedSnap = await api.getEventSnapshot(eventId);
    const updatedMaya = updatedSnap.participants.find((p) => p.id === maya.id);
    expect(updatedMaya?.teamId).toBeNull();
    expect(updatedMaya?.rsvpStatus).toBe('going_supporter');

    // Scheduled Leg was unassigned, completed Leg was preserved
    const updatedR1 = updatedSnap.legs.find((l) => l.id === round1Leg.id);
    const updatedR2 = updatedSnap.legs.find((l) => l.id === round2Leg.id);
    expect(updatedR1?.runnerId).toBeNull();
    expect(updatedR2?.runnerId).toBe(maya.id);
    expect(updatedR2?.status).toBe('completed');
  });

  it('validates optional rough 5K pace input before saving', async () => {
    const { api, eventId, maya } = await createHomeProfileFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);

    const profileRegion = await screen.findByRole('region', { name: /your profile/i });
    await user.click(within(profileRegion).getByRole('button', { name: /edit profile & rsvp/i }));

    await user.type(screen.getByLabelText(/rough 5k pace/i), '3');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/between 10 and 120 minutes/i);
  });
});
