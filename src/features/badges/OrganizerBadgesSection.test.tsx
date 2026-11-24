import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';

async function setupOrganizerBadgesFixture() {
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
  await api.ensureSession();
  await api.unlockEvent('2027', 'FROST-2027');
  await api.unlockOrganizer(eventId, 'HOST-2027');

  const team = await api.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: team.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const riley = await api.createParticipant(eventId, {
    displayName: 'Riley Brooks',
    rsvpStatus: 'going_supporter',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const snapshot = await api.getEventSnapshot(eventId);
  const grants = await api.getSessionGrants(eventId);

  return { store, api, eventId, team, maya, riley, snapshot, grants };
}

describe('OrganizerBadgesSection in OrganizerModePanel -> Badges', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('displays the 5 pre-seeded presets, creates a custom Badge, awards to a Participant and a Team (strict XOR), syncs to Race Day -> Badges, and revokes/deletes cleanly', async () => {
    const user = userEvent.setup();
    const { api, eventId, team, maya, riley, snapshot, grants } =
      await setupOrganizerBadgesFixture();
    saveParticipantId(eventId, maya.id);

    const createAwardSpy = vi.spyOn(api, 'createBadgeAward');

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={grants}
        >
          <AppShell initialTab="home" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    const orgWorkspace = screen.getByTestId('organizer-workspace');

    // Open Badges tab inside Organizer Mode
    await user.click(within(orgWorkspace).getByRole('tab', { name: /^badges$/i }));

    // 1. All 5 pre-seeded presets are visible
    const catalogSection = within(orgWorkspace).getByRole('region', { name: /badge catalog/i });
    for (const presetName of [
      'Best Cold-Weather Outfit',
      'Cheer Squad MVP',
      'Best Snack Contributor',
      'Most Encouraging',
      'Best Vibes at Basecamp',
    ]) {
      expect(catalogSection).toHaveTextContent(presetName);
    }

    // 2. Create custom Badge definition (rejects blank name first, then creates)
    const createForm = within(orgWorkspace).getByRole('region', { name: /create custom badge/i });
    await user.click(within(createForm).getByRole('button', { name: /create custom badge/i }));
    expect(within(orgWorkspace).getByRole('alert')).toHaveTextContent(/badge name/i);

    fireEvent.change(within(createForm).getByLabelText(/badge name/i), {
      target: { value: 'Frostiest Beanie' },
    });
    fireEvent.change(within(createForm).getByLabelText(/emoji/i), {
      target: { value: '🧢' },
    });
    fireEvent.change(within(createForm).getByLabelText(/description/i), {
      target: { value: 'Spotted from half a kilometer away in the snow.' },
    });
    await user.click(within(createForm).getByRole('button', { name: /create custom badge/i }));

    await waitFor(() => {
      expect(catalogSection).toHaveTextContent('Frostiest Beanie');
    });

    // 3. Award preset Badge to Participant (Riley Brooks) with optional note -> strict XOR (teamId: null)
    const awardSection = within(orgWorkspace).getByRole('region', { name: /award a badge/i });
    const cheerDef = snapshot.badgeDefinitions.find((d) => d.name === 'Cheer Squad MVP')!;

    await user.selectOptions(within(awardSection).getByLabelText(/^badge$/i), cheerDef.id);
    await user.click(within(awardSection).getByRole('button', { name: /^participant$/i }));
    await user.selectOptions(within(awardSection).getByLabelText(/select participant/i), riley.id);
    fireEvent.change(within(awardSection).getByLabelText(/note \(optional\)/i), {
      target: { value: 'Louder than the wind!' },
    });
    await user.click(within(awardSection).getByRole('button', { name: /^award badge$/i }));

    await waitFor(() => {
      expect(createAwardSpy).toHaveBeenCalledWith(
        eventId,
        expect.objectContaining({
          badgeDefinitionId: cheerDef.id,
          participantId: riley.id,
          teamId: null,
          note: 'Louder than the wind!',
        }),
      );
    });

    // 4. Switch recipient type to Team and award custom Badge to Frostbite Fighters -> strict XOR (participantId: null)
    const afterCreateSnap = await api.getEventSnapshot(eventId);
    const customDef = afterCreateSnap.badgeDefinitions.find((d) => d.name === 'Frostiest Beanie')!;

    await user.selectOptions(within(awardSection).getByLabelText(/^badge$/i), customDef.id);
    await user.click(within(awardSection).getByRole('button', { name: /^team$/i }));
    await user.selectOptions(within(awardSection).getByLabelText(/select team/i), team.id);
    fireEvent.change(within(awardSection).getByLabelText(/note \(optional\)/i), {
      target: { value: 'Matching team pom-poms' },
    });
    await user.click(within(awardSection).getByRole('button', { name: /^award badge$/i }));

    await waitFor(() => {
      expect(createAwardSpy).toHaveBeenLastCalledWith(
        eventId,
        expect.objectContaining({
          badgeDefinitionId: customDef.id,
          participantId: null,
          teamId: team.id,
          note: 'Matching team pom-poms',
        }),
      );
    });

    // 5. Switch to Race Day -> Badges and confirm BOTH awards appear immediately!
    const primaryNav = screen.getByRole('navigation', { name: /^primary$/i });
    await user.click(within(primaryNav).getByRole('button', { name: /race day/i }));
    await user.click(screen.getByRole('tab', { name: /^badges$/i }));

    const superlatives = screen.getByRole('region', { name: /organizer superlatives/i });
    expect(superlatives).toHaveTextContent('Cheer Squad MVP');
    expect(superlatives).toHaveTextContent('Riley Brooks');
    expect(superlatives).toHaveTextContent('Louder than the wind!');
    expect(superlatives).toHaveTextContent('Frostiest Beanie');
    expect(superlatives).toHaveTextContent('Frostbite Fighters');
    expect(superlatives).toHaveTextContent('Matching team pom-poms');

    // 6. Return to Home -> Organizer Mode -> Badges, revoke Riley's award, and delete custom Badge (cascading Team award)
    await user.click(within(primaryNav).getByRole('button', { name: /^home$/i }));
    const workspaceAgain = screen.getByTestId('organizer-workspace');
    await user.click(within(workspaceAgain).getByRole('tab', { name: /^badges$/i }));

    await user.click(
      within(workspaceAgain).getByRole('button', {
        name: /revoke cheer squad mvp from riley brooks/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(workspaceAgain).queryByRole('button', {
          name: /revoke cheer squad mvp from riley brooks/i,
        }),
      ).not.toBeInTheDocument();
    });

    // Delete custom Badge definition -> also removes its awarded superlative
    await user.click(
      within(workspaceAgain).getByRole('button', { name: /delete frostiest beanie/i }),
    );

    await waitFor(() => {
      expect(within(workspaceAgain).getByRole('region', { name: /badge catalog/i })).not.toHaveTextContent(
        'Frostiest Beanie',
      );
    });

    // Race Day -> Badges now returns cleanly to empty superlatives state!
    await user.click(within(primaryNav).getByRole('button', { name: /race day/i }));
    await user.click(screen.getByRole('tab', { name: /^badges$/i }));
    expect(screen.getByRole('region', { name: /organizer superlatives/i })).toHaveTextContent(
      /no organizer superlatives awarded yet/i,
    );
  });

  it('disables Organizer Badge mutations cleanly with "Requires connection" when offline', async () => {
    const user = userEvent.setup();
    const { api, eventId, maya, snapshot, grants } = await setupOrganizerBadgesFixture();
    saveParticipantId(eventId, maya.id);

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={grants}
        >
          <AppShell initialTab="home" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    const orgWorkspace = screen.getByTestId('organizer-workspace');
    await user.click(within(orgWorkspace).getByRole('tab', { name: /^badges$/i }));

    fireEvent(window, new Event('offline'));

    const awardSection = within(orgWorkspace).getByRole('region', { name: /award a badge/i });
    const awardBtn = within(awardSection).getByRole('button', { name: /requires connection/i });
    expect(awardBtn).toBeDisabled();

    const createSection = within(orgWorkspace).getByRole('region', { name: /create custom badge/i });
    const createBtn = within(createSection).getByRole('button', { name: /requires connection/i });
    expect(createBtn).toBeDisabled();
  });
});
