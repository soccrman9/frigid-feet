import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';

const EVENT_START_ISO = '2027-01-09T13:00:00.000Z';
const ROUND_1_NOW_MS = Date.parse('2027-01-09T13:22:00.000Z');

async function createBadgesFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: EVENT_START_ISO,
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

  const boardwalk = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: 'Flat waterfront loop',
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const api = new InMemoryEventApi(store);
  await api.ensureSession();
  await api.unlockEvent('2027', 'FROST-2027');

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
    isFirst5k: true,
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
  const r1Leg = snapshot.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;

  return { store, api, organizerApi, eventId, boardwalk, team, maya, riley, r1Leg, snapshot };
}

describe('BadgesSubView in Race Day -> Badges', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(ROUND_1_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows warm, encouraging empty states across Team Badges, Participant Badges, and Organizer Superlatives before Rounds finish', async () => {
    const { api, eventId, snapshot, maya } = await createBadgesFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /^badges$/i }));

    const badgesView = screen.getByRole('region', { name: /badges showcase/i });
    expect(within(badgesView).getByRole('region', { name: /organizer superlatives/i })).toHaveTextContent(
      /no organizer superlatives awarded yet/i,
    );
    expect(within(badgesView).getByRole('region', { name: /team milestones/i })).toHaveTextContent(
      /no team badges unlocked yet/i,
    );
    expect(within(badgesView).getByRole('region', { name: /participant badges/i })).toHaveTextContent(
      /no participant badges unlocked yet/i,
    );
  });

  it('reactively unlocks auto-Badges on Leg completion, displays Organizer superlatives, and removes Badges immediately when a Leg is reverted via Undo', async () => {
    const { api, organizerApi, eventId, team, maya, riley, r1Leg, boardwalk } =
      await createBadgesFixture();

    // Put Maya out_on_course on Round 1 so she can finish from the Thumb Dock
    await api.updateLeg(eventId, r1Leg.id, {
      runnerId: maya.id,
      status: 'out_on_course',
      startedAt: EVENT_START_ISO,
      courseId: boardwalk.id,
    });

    // Riley volunteers a Basecamp Supply -> earns Basecamp Hero immediately!
    await api.createSupplyItem(eventId, {
      category: 'food',
      name: 'Warm Pretzels',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: riley.id,
    });

    // Organizer awards a preset superlative to Riley and a preset superlative to Frostbite Fighters
    const beforeSnap = await organizerApi.getEventSnapshot(eventId);
    const cheerDef = beforeSnap.badgeDefinitions.find((d) => d.name === 'Cheer Squad MVP')!;
    const vibesDef = beforeSnap.badgeDefinitions.find((d) => d.name === 'Best Vibes at Basecamp')!;

    await organizerApi.createBadgeAward(eventId, {
      badgeDefinitionId: cheerDef.id,
      participantId: riley.id,
      teamId: null,
      note: 'Brought cowbells to the turnaround!',
    });
    await organizerApi.createBadgeAward(eventId, {
      badgeDefinitionId: vibesDef.id,
      participantId: null,
      teamId: team.id,
      note: 'Best hot-cocoa playlist',
    });

    const snapshot = await api.getEventSnapshot(eventId);
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Finish Maya's Round 1 Leg from the Thumb Dock!
    await user.click(screen.getByRole('button', { name: /finish my 5k leg/i }));

    // Switch to Badges sub-view -> Maya immediately has First 5K Club + Dawn Patrol,
    // Frostbite Fighters has Full Squad, Riley has Basecamp Hero, and both Organizer superlatives appear!
    await user.click(screen.getByRole('tab', { name: /^badges$/i }));

    const superlatives = screen.getByRole('region', { name: /organizer superlatives/i });
    expect(superlatives).toHaveTextContent('Cheer Squad MVP');
    expect(superlatives).toHaveTextContent('Riley Brooks');
    expect(superlatives).toHaveTextContent('Brought cowbells to the turnaround!');
    expect(superlatives).toHaveTextContent('Best Vibes at Basecamp');
    expect(superlatives).toHaveTextContent('Frostbite Fighters');
    expect(superlatives).toHaveTextContent('Best hot-cocoa playlist');

    const teamMilestones = screen.getByRole('region', { name: /team milestones/i });
    expect(teamMilestones).toHaveTextContent('Full Squad');
    expect(teamMilestones).toHaveTextContent('Frostbite Fighters');

    const participantBadges = screen.getByRole('region', { name: /participant badges/i });
    expect(participantBadges).toHaveTextContent('First 5K Club');
    expect(participantBadges).toHaveTextContent('Dawn Patrol');
    expect(participantBadges).toHaveTextContent('Maya Chen');
    expect(participantBadges).toHaveTextContent('Basecamp Hero');
    expect(participantBadges).toHaveTextContent('Riley Brooks');

    // Click Undo in the ~8s Undo toast -> Maya's Round 1 reverts to out_on_course
    // and Full Squad, First 5K Club, and Dawn Patrol IMMEDIATELY vanish from Badges!
    const undoToast = screen.getByTestId('undo-toast');
    await user.click(within(undoToast).getByRole('button', { name: /^undo$/i }));

    expect(screen.getByRole('region', { name: /team milestones/i })).toHaveTextContent(
      /no team badges unlocked yet/i,
    );
    const updatedParticipantBadges = screen.getByRole('region', { name: /participant badges/i });
    expect(updatedParticipantBadges).not.toHaveTextContent('First 5K Club');
    expect(updatedParticipantBadges).not.toHaveTextContent('Dawn Patrol');
    // Riley's Basecamp Hero remains earned
    expect(updatedParticipantBadges).toHaveTextContent('Basecamp Hero');
    expect(updatedParticipantBadges).toHaveTextContent('Riley Brooks');
  });
});
