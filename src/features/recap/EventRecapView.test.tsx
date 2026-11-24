import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';

const EVENT_START_ISO = '2027-01-09T13:00:00.000Z';

async function createEventRecapFixture() {
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

  await organizerApi.updateEvent(eventId, {
    recapNote: 'Huge thanks to everyone who braved the January chill and kept Basecamp joyful!',
  });

  const boardwalk = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const lakeLoop = await organizerApi.upsertCourse(eventId, {
    name: 'Lake Loop 5K',
    description: null,
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });

  const api = new InMemoryEventApi(store);
  await api.ensureSession();
  await api.unlockEvent('2027', 'FROST-2027');

  // Create Teams out of alphabetical order
  const snowPatrol = await api.createTeam(eventId, {
    name: 'Snow Patrol',
    tagline: null,
    colorHex: '#157A4B',
    emoji: '🎿',
    isOpen: true,
    lookingNote: null,
  });

  const frostbite = await api.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  // Maya: opted OUT, all assigned Legs completed (so Thumb Dock shows "All Done Today — View Event Recap")
  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: true,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Samir: opted IN, completed 2 timed Legs across 2 Courses
  const samir = await api.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_runner',
    teamId: snowPatrol.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 25,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  // Riley: Supporter who brought Hot Cocoa and earned Cheer Squad MVP
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

  await api.createSupplyItem(eventId, {
    category: 'drinks',
    name: 'Hot Cocoa Thermos',
    isWishlist: false,
    targetSlots: null,
    createdByParticipantId: riley.id,
  });

  const snap = await api.getEventSnapshot(eventId);
  const legFor = (teamId: string, roundNumber: number) =>
    snap.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  // Frostbite Fighters reaches 50K (all 10 Rounds completed by Maya, R1 timed 21:05 private)
  for (let round = 1; round <= 10; round += 1) {
    await api.updateLeg(eventId, legFor(frostbite.id, round).id, {
      runnerId: maya.id,
      status: 'completed',
      durationSeconds: round === 1 ? 1265 : null,
      courseId: boardwalk.id,
    });
  }

  // Snow Patrol completes 2 Rounds with Samir (timed 22:00 + 24:00)
  await api.updateLeg(eventId, legFor(snowPatrol.id, 1).id, {
    runnerId: samir.id,
    status: 'completed',
    durationSeconds: 1320,
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(snowPatrol.id, 2).id, {
    runnerId: samir.id,
    status: 'completed',
    durationSeconds: 1440,
    courseId: lakeLoop.id,
  });

  const cheerDef = snap.badgeDefinitions.find((d) => d.name === 'Cheer Squad MVP')!;
  await organizerApi.createBadgeAward(eventId, {
    badgeDefinitionId: cheerDef.id,
    participantId: riley.id,
    teamId: null,
    note: 'Nonstop Basecamp cheer energy!',
  });

  const freshSnapshot = await api.getEventSnapshot(eventId);
  return { api, eventId, snapshot: freshSnapshot, maya, samir, riley };
}

describe('EventRecapView & Home / Race Day reachability', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens Event Recap from Home, renders Organizer recap note, total km, alphabetical Teams, Badges & superlatives, and copies both summaries with confirmation', async () => {
    const { api, eventId, snapshot, samir } = await createEventRecapFixture();
    saveParticipantId(eventId, samir.id);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

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

    // Home has celebratory Event Recap entry card/button
    const homeRecapCard = screen.getByTestId('home-event-recap-card');
    await user.click(within(homeRecapCard).getByRole('button', { name: /view event recap/i }));

    const recap = screen.getByRole('region', { name: /event recap/i });

    // Organizer recap note, collective total km, alphabetical Teams, auto-Badges & superlatives
    expect(recap).toHaveTextContent(
      'Huge thanks to everyone who braved the January chill and kept Basecamp joyful!',
    );
    expect(recap).toHaveTextContent(/60 km run together/i);
    expect(recap).toHaveTextContent('Frostbite Fighters');
    expect(recap).toHaveTextContent('Snow Patrol');
    const teamNames = within(recap)
      .getAllByTestId('team-progress-name')
      .map((el) => el.textContent);
    expect(teamNames).toEqual([
      expect.stringContaining('Frostbite Fighters'),
      expect.stringContaining('Snow Patrol'),
    ]);
    expect(recap).toHaveTextContent('50K Finisher');
    expect(recap).toHaveTextContent('Cheer Squad MVP');
    expect(recap).toHaveTextContent('Nonstop Basecamp cheer energy!');
    expect(recap).toHaveTextContent('Course Explorer');
    expect(recap).toHaveTextContent('Basecamp Hero');

    // Neutral copy hint for My Run Summary
    expect(recap).toHaveTextContent(/great for strava or group chat/i);

    // 1. Tap Copy Event Recap -> copies formatted Event Recap & shows visual confirmation
    const copyRecapBtn = within(recap).getByRole('button', { name: /copy event recap/i });
    await user.click(copyRecapBtn);
    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedEventText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedEventText).toContain('Winter Grind 50K 2027');
    expect(copiedEventText).toContain('60 km');
    expect(copiedEventText).toContain('Cheer Squad MVP');
    expect(copiedEventText).not.toContain('21:05');
    expect(within(recap).getByRole('status')).toHaveTextContent(/event recap copied/i);

    // 2. Tap Copy My Run Summary -> copies Samir's opted-in summary & shows visual confirmation
    const copyMyBtn = within(recap).getByRole('button', { name: /copy my run summary/i });
    await user.click(copyMyBtn);
    expect(writeText).toHaveBeenCalledTimes(2);
    const copiedMyText = writeText.mock.calls[1]?.[0] as string;
    expect(copiedMyText).toContain('Samir Patel');
    expect(copiedMyText).toContain('Snow Patrol');
    expect(copiedMyText).toContain('Boardwalk 5K, Lake Loop 5K');
    expect(copiedMyText).toContain('22:00');
    expect(within(recap).getByRole('status')).toHaveTextContent(/my run summary copied/i);

    // Back returns to Home
    await user.click(within(recap).getByRole('button', { name: /back/i }));
    expect(screen.getByTestId('home-event-recap-card')).toBeInTheDocument();
  });

  it('opens the full Event Recap from the Race Day Thumb Dock "All Done Today — View Event Recap" CTA and keeps opted-out times omitted by default', async () => {
    const { api, eventId, snapshot, maya } = await createEventRecapFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

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

    const dock = screen.getByTestId('thumb-action-dock');
    await user.click(
      within(dock).getByRole('button', { name: /all done today — view event recap/i }),
    );

    const recap = screen.getByRole('region', { name: /event recap/i });
    expect(recap).toHaveTextContent(
      'Huge thanks to everyone who braved the January chill and kept Basecamp joyful!',
    );

    // Copy My Run Summary for opted-out Maya omits her 21:05 time by default
    await user.click(within(recap).getByRole('button', { name: /copy my run summary/i }));
    const copiedDefault = writeText.mock.calls[0]?.[0] as string;
    expect(copiedDefault).toContain('Maya Chen');
    expect(copiedDefault).toContain('Frostbite Fighters');
    expect(copiedDefault).toContain('50 km');
    expect(copiedDefault).not.toContain('21:05');

    // Maya can optionally check "Include my own 5K time" to include her own recorded 21:05 time
    await user.click(within(recap).getByRole('checkbox', { name: /include my own 5k time/i }));
    await user.click(within(recap).getByRole('button', { name: /copy my run summary/i }));
    const copiedWithTime = writeText.mock.calls[1]?.[0] as string;
    expect(copiedWithTime).toContain('21:05');

    // Bottom navigation cleanly exits Event Recap back to selected tab
    await user.click(screen.getByRole('button', { name: /^Supplies$/i }));
    expect(screen.queryByRole('region', { name: /event recap/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /supplies/i })).toBeInTheDocument();
  });

  it('copies a warm Supporter summary cleanly for a Supporter viewing Event Recap', async () => {
    const { api, eventId, snapshot, riley } = await createEventRecapFixture();
    saveParticipantId(eventId, riley.id);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

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

    await user.click(screen.getByRole('button', { name: /view event recap/i }));
    const recap = screen.getByRole('region', { name: /event recap/i });

    await user.click(within(recap).getByRole('button', { name: /copy my run summary/i }));
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain('Riley Brooks');
    expect(copied).toContain('Basecamp Supporter');
    expect(copied).toContain('Hot Cocoa Thermos');
    expect(copied).toContain('Cheer Squad MVP');
    expect(copied).toContain('Basecamp Hero');
  });
});
