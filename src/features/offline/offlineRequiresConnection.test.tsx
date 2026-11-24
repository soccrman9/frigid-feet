import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';
import { clearOfflineDb } from './offlineDb';

async function setupOfflineAuditFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
  });

  const api = new InMemoryEventApi(store);
  await api.ensureSession();
  await api.unlockOrganizer(eventId, 'HOST-2027');

  await api.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  await api.createAnnouncement(eventId, {
    title: 'Morning Briefing',
    body: 'Coffee ready at 7:30 AM.',
    isPinned: true,
  });

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
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  await api.createParticipant(eventId, {
    displayName: 'Jordan Lee',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  await api.createSupplyItem(eventId, {
    category: 'drinks',
    name: 'Hot Cocoa Mix',
    isWishlist: true,
    targetSlots: 2,
    createdByParticipantId: null,
  });

  const snapshot = await api.getEventSnapshot(eventId);
  saveParticipantId(eventId, maya.id);

  return { api, eventId, snapshot, team, maya };
}

describe('Offline "Requires connection" disabled states for structural & Organizer-bulk actions', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOfflineDb();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  });

  afterEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await clearOfflineDb();
  });

  it('disables Participant RSVP edits, Team create/join/leave/schedule, and Supply claim/volunteer actions offline with "Requires connection"', async () => {
    const { api, eventId, snapshot } = await setupOfflineAuditFixture();
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="home" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // 1. Home -> RSVP & Profile editor submit is disabled with "Requires connection"
    await user.click(screen.getByRole('button', { name: /edit profile & rsvp/i }));
    const profileSection = screen.getByRole('region', { name: /your profile & rsvp/i });
    const profileSaveBtn = within(profileSection).getByRole('button', {
      name: /requires connection/i,
    });
    expect(profileSaveBtn).toBeDisabled();

    // 2. Teams -> Leave Team disabled with "Requires connection", and 10-Round Schedule Builder shows offline notice
    await user.click(screen.getByRole('button', { name: /^Teams$/i }));
    expect(screen.getByRole('button', { name: /requires connection/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /open 10-round schedule/i }));
    expect(screen.getByText(/requires connection to edit round assignments/i)).toBeInTheDocument();

    // 3. Supplies -> Claim wish-list item & Add volunteered Supply disabled with "Requires connection"
    await user.click(screen.getByRole('button', { name: /^Supplies$/i }));
    const wishlistSection = screen.getByRole('region', { name: /basecamp wish list/i });
    expect(
      within(wishlistSection).getByRole('button', { name: /requires connection/i }),
    ).toBeDisabled();

    const volunteeredSection = screen.getByRole('region', { name: /volunteered supplies/i });
    expect(
      within(volunteeredSection).getByRole('button', { name: /requires connection/i }),
    ).toBeDisabled();
  });

  it('disables Organizer Start Round N and all Organizer Mode bulk/structural editors offline with "Requires connection"', async () => {
    const { api, eventId, snapshot } = await setupOfflineAuditFixture();
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant', 'organizer']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // 1. Race Day -> Organizer "Start Round N" is disabled with "Requires connection"
    const startRoundBtn = screen.getByTestId('start-round-1-button');
    expect(startRoundBtn).toBeDisabled();
    expect(screen.getByText(/^Requires connection$/i)).toBeInTheDocument();

    // 2. Home -> Organizer Mode editors (Event, Courses, Announcements, Chip-Ins, Badges, Access & QR)
    await user.click(screen.getByRole('button', { name: /^Home$/i }));
    const workspace = screen.getByTestId('organizer-workspace');

    // Event tab
    expect(
      within(workspace).getByRole('button', { name: /requires connection/i }),
    ).toBeDisabled();

    // Courses tab -> Add Course disabled with "Requires connection"
    await user.click(within(workspace).getByRole('tab', { name: /^Courses$/i }));
    expect(
      within(workspace).getByRole('button', { name: /requires connection/i }),
    ).toBeDisabled();

    // Announcements tab -> Post Announcement disabled with "Requires connection"
    await user.click(within(workspace).getByRole('tab', { name: /^Announcements$/i }));
    expect(
      within(workspace).getByRole('button', { name: /requires connection/i }),
    ).toBeDisabled();

    // Chip-Ins tab -> Record Chip-In disabled with "Requires connection"
    await user.click(within(workspace).getByRole('tab', { name: /^Chip-Ins$/i }));
    expect(
      within(workspace).getByRole('button', { name: /requires connection/i }),
    ).toBeDisabled();

    // Badges tab -> Award Badge & Create Custom Badge disabled with "Requires connection"
    await user.click(within(workspace).getByRole('tab', { name: /^Badges$/i }));
    const badgeOfflineBtns = within(workspace).getAllByRole('button', {
      name: /requires connection/i,
    });
    expect(badgeOfflineBtns.length).toBeGreaterThanOrEqual(2);
    for (const btn of badgeOfflineBtns) {
      expect(btn).toBeDisabled();
    }

    // Access & QR (Secrets) tab -> all 3 rotate buttons disabled with "Requires connection"
    await user.click(within(workspace).getByRole('tab', { name: /access & qr/i }));
    const secretOfflineBtns = within(workspace).getAllByRole('button', {
      name: /requires connection/i,
    });
    expect(secretOfflineBtns).toHaveLength(3);
    for (const btn of secretOfflineBtns) {
      expect(btn).toBeDisabled();
    }
  });
});
