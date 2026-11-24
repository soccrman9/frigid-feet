import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { HomeTab } from '../home/HomeTab';
import { OrganizerModePanel } from '../organizer/OrganizerModePanel';

async function setupFixture(options?: { preUnlockOrganizer?: boolean }) {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-PASS-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
    chipInBreakdown: [{ label: 'Pavilion rental', amountCents: 20000 }],
    venmoHandle: '@wintergrind',
    zelleHandle: 'host@wintergrind.test',
  });

  const organizerSeedApi = new InMemoryEventApi(store);
  await organizerSeedApi.unlockOrganizer(eventId, 'HOST-PASS-2027');

  const maya = await organizerSeedApi.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const sam = await organizerSeedApi.createParticipant(eventId, {
    displayName: 'Sam Patel',
    rsvpStatus: 'going_supporter',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const api = new InMemoryEventApi(store);
  await api.unlockEvent('2027', 'FROST-2027');
  if (options?.preUnlockOrganizer) {
    await api.unlockOrganizer(eventId, 'HOST-PASS-2027');
  }

  return { store, api, organizerSeedApi, eventId, maya, sam };
}

describe('OrganizerChipInLedger & live Home aggregate updates', () => {
  it('hides private chip-in entries from Participants on Home while showing only the aggregate total', async () => {
    const { api, organizerSeedApi, eventId, maya } = await setupFixture({
      preUnlockOrganizer: false,
    });

    await organizerSeedApi.createChipIn(eventId, {
      participantId: maya.id,
      amountCents: 4550,
      note: 'Secret Venmo note from Maya',
    });

    const snapshot = await api.getEventSnapshot(eventId);
    const grants = await api.getSessionGrants(eventId);

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <HomeTab />
      </EventDataProvider>,
    );

    const card = screen.getByTestId('chip-in-progress-card');
    expect(card).toHaveTextContent('$45.50 of $300 event costs covered');
    expect(screen.queryByText(/Secret Venmo note from Maya/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Chip-Ins/i })).not.toBeInTheDocument();
  });

  it('lets an Organizer add linked and anonymous entries, validate amounts, edit, and delete entries while updating Home Chip-In Progress Card live', async () => {
    const user = userEvent.setup();
    const { api, eventId, maya, sam } = await setupFixture({ preUnlockOrganizer: true });

    const snapshot = await api.getEventSnapshot(eventId);
    const grants = await api.getSessionGrants(eventId);

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <HomeTab />
      </EventDataProvider>,
    );

    const progressCard = screen.getByTestId('chip-in-progress-card');
    expect(progressCard).toHaveTextContent('$0 of $300 event costs covered');

    // Open Chip-Ins tab inside Organizer Mode
    await user.click(screen.getByRole('tab', { name: /^Chip-Ins$/i }));

    // Validation: rejects $0 and negative amounts
    const amountInput = screen.getByLabelText(/Chip-in amount/i);
    fireEvent.change(amountInput, { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: /Record Chip-In/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/greater than \$0/i);

    // 1. Add linked Participant entry (Maya Chen, $25.50, Venmo)
    await user.selectOptions(screen.getByLabelText(/Participant \(optional\)/i), maya.id);
    fireEvent.change(amountInput, { target: { value: '25.50' } });
    fireEvent.change(screen.getByLabelText(/Ledger note/i), { target: { value: 'Venmo' } });
    await user.click(screen.getByRole('button', { name: /Record Chip-In/i }));

    // Home progress card immediately updates to $25.50 of $300
    await waitFor(() => {
      expect(progressCard).toHaveTextContent('$25.50 of $300 event costs covered');
    });

    const ledgerList = screen.getByTestId('chip-in-ledger-list');
    expect(within(ledgerList).getByText('Maya Chen')).toBeInTheDocument();
    expect(within(ledgerList).getByText('$25.50')).toBeInTheDocument();
    expect(within(ledgerList).getByText('Venmo')).toBeInTheDocument();
    expect(ledgerList.querySelector('time')).not.toBeNull();

    // 2. Add anonymous/unlisted entry ($14.50, no note)
    await user.selectOptions(screen.getByLabelText(/Participant \(optional\)/i), '');
    fireEvent.change(screen.getByLabelText(/Chip-in amount/i), { target: { value: '14.50' } });
    fireEvent.change(screen.getByLabelText(/Ledger note/i), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /Record Chip-In/i }));

    // Live aggregate updates to $40 of $300 ($25.50 + $14.50)
    await waitFor(() => {
      expect(progressCard).toHaveTextContent('$40 of $300 event costs covered');
    });
    expect(within(ledgerList).getByText(/Anonymous \/ Unlisted/i)).toBeInTheDocument();
    expect(within(ledgerList).getByText('$14.50')).toBeInTheDocument();

    // 3. Edit Maya's entry: reassign to Sam Patel, change amount to $50.00, update note
    await user.click(screen.getByRole('button', { name: /Edit chip-in from Maya Chen/i }));
    await user.selectOptions(screen.getByLabelText(/Edit Participant/i), sam.id);
    fireEvent.change(screen.getByLabelText(/Edit amount/i), { target: { value: '50.00' } });
    fireEvent.change(screen.getByLabelText(/Edit note/i), { target: { value: 'Zelle updated' } });
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    // Live aggregate updates to $64.50 of $300 ($50.00 + $14.50)
    await waitFor(() => {
      expect(progressCard).toHaveTextContent('$64.50 of $300 event costs covered');
    });
    expect(within(ledgerList).getByText('Sam Patel')).toBeInTheDocument();
    expect(within(ledgerList).getByText('$50.00')).toBeInTheDocument();
    expect(within(ledgerList).getByText('Zelle updated')).toBeInTheDocument();

    // 4. Delete the anonymous entry -> live aggregate drops to $50 of $300
    await user.click(screen.getByRole('button', { name: /Delete chip-in from Anonymous/i }));
    await waitFor(() => {
      expect(progressCard).toHaveTextContent('$50 of $300 event costs covered');
    });
    expect(within(ledgerList).queryByText('$14.50')).not.toBeInTheDocument();

    // Card on Home STILL never leaks contributor names or notes
    expect(progressCard.textContent).not.toContain('Sam Patel');
    expect(progressCard.textContent).not.toContain('Zelle updated');
  });

  it('preserves OrganizerModePanel extraTabs extensibility alongside the Chip-Ins tab', async () => {
    const user = userEvent.setup();
    const { api, eventId } = await setupFixture({ preUnlockOrganizer: true });
    const snapshot = await api.getEventSnapshot(eventId);
    const grants = await api.getSessionGrants(eventId);

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <OrganizerModePanel
          extraTabs={[
            {
              id: 'export-snapshot',
              label: 'Export',
              render: () => <div>Custom Export Extension</div>,
            },
          ]}
        />
      </EventDataProvider>,
    );

    expect(screen.getByRole('tab', { name: /^Chip-Ins$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Export$/i }));
    expect(screen.getByText('Custom Export Extension')).toBeInTheDocument();
  });

  it('disables ledger writes with "Requires connection" when offline', async () => {
    const user = userEvent.setup();
    const { api, eventId } = await setupFixture({ preUnlockOrganizer: true });
    const snapshot = await api.getEventSnapshot(eventId);
    const grants = await api.getSessionGrants(eventId);

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <OrganizerModePanel />
      </EventDataProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /^Chip-Ins$/i }));
    fireEvent(window, new Event('offline'));

    const submitBtn = screen.getByRole('button', { name: /Requires connection/i });
    expect(submitBtn).toBeDisabled();
  });
});
