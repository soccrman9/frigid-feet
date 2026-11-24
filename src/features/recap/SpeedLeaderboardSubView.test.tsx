import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';
import { RaceDayTab } from '../race-day/RaceDayTab';

async function createSpeedBoardFixture() {
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

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

  const boardwalk = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: null,
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const api = new InMemoryEventApi(store);
  await api.ensureSession();
  await api.unlockEvent('2027', 'FROST-2027');

  const frostbite = await api.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const coldBrew = await api.createTeam(eventId, {
    name: 'Cold Brew Crew',
    tagline: null,
    colorHex: '#C86D09',
    emoji: '☕',
    isOpen: true,
    lookingNote: null,
  });

  // Jordan: opted OUT, ran blazing 19:45 (1185s) -> MUST NEVER APPEAR
  const jordan = await api.createParticipant(eventId, {
    displayName: 'Jordan Lee',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 20,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Maya: opted IN, but left her completed Leg untimed (null) -> MUST NOT APPEAR
  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  // Samir: opted IN, 22:00 (1320s) + 30:00 (1800s) -> fastest 22:00, avg 26:00
  const samir = await api.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_runner',
    teamId: coldBrew.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 26,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  // Priya: opted IN, 23:10 (1390s) + 23:30 (1410s) -> fastest 23:10, avg 23:20
  const priya = await api.createParticipant(eventId, {
    displayName: 'Priya Nair',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 24,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  // Riley: Supporter (not on a Team, opted out) -> can still view Speed Board!
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

  const snap = await api.getEventSnapshot(eventId);
  const legFor = (teamId: string, roundNumber: number) =>
    snap.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  // Jordan's private fast run
  await api.updateLeg(eventId, legFor(frostbite.id, 1).id, {
    runnerId: jordan.id,
    status: 'completed',
    durationSeconds: 1185,
    courseId: boardwalk.id,
  });

  // Maya's untimed completed run
  await api.updateLeg(eventId, legFor(frostbite.id, 2).id, {
    runnerId: maya.id,
    status: 'completed',
    durationSeconds: null,
    courseId: boardwalk.id,
  });

  // Priya's two timed runs
  await api.updateLeg(eventId, legFor(frostbite.id, 3).id, {
    runnerId: priya.id,
    status: 'completed',
    durationSeconds: 1390, // 23:10
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(frostbite.id, 4).id, {
    runnerId: priya.id,
    status: 'completed',
    durationSeconds: 1410, // 23:30
    courseId: boardwalk.id,
  });

  // Samir's two timed runs
  await api.updateLeg(eventId, legFor(coldBrew.id, 1).id, {
    runnerId: samir.id,
    status: 'completed',
    durationSeconds: 1320, // 22:00
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(coldBrew.id, 2).id, {
    runnerId: samir.id,
    status: 'completed',
    durationSeconds: 1800, // 30:00
    courseId: boardwalk.id,
  });

  const freshSnapshot = await api.getEventSnapshot(eventId);
  return { api, eventId, snapshot: freshSnapshot, jordan, maya, samir, priya, riley };
}

describe('SpeedLeaderboardSubView in Race Day -> Speed Board', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is viewable by a Supporter, ranks only opted-in timed Runners by fastest & average 5K, hides opted-out and untimed Runners, and explains optional profile opt-in', async () => {
    const { api, eventId, snapshot, riley } = await createSpeedBoardFixture();
    saveParticipantId(eventId, riley.id);
    const user = userEvent.setup();

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

    await user.click(screen.getByRole('tab', { name: /speed board/i }));

    const board = screen.getByRole('region', { name: /speed board/i });

    // Gentle optional note mentioning Home profile toggle & zero Team speed rankings
    expect(board).toHaveTextContent(/optional/i);
    expect(board).toHaveTextContent(/home/i);

    // Ranked rows by Fastest 5K default: #1 Samir Patel (22:00 / avg 26:00), #2 Priya Nair (23:10 / avg 23:20)
    const rows = within(board).getAllByTestId('speed-leaderboard-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Samir Patel');
    expect(rows[0]).toHaveTextContent('22:00');
    expect(rows[0]).toHaveTextContent('26:00');
    expect(rows[1]).toHaveTextContent('Priya Nair');
    expect(rows[1]).toHaveTextContent('23:10');
    expect(rows[1]).toHaveTextContent('23:20');

    // Privacy boundary: Jordan (opted out, 19:45) and Maya (blank time) NEVER appear
    expect(board).not.toHaveTextContent('Jordan Lee');
    expect(board).not.toHaveTextContent('19:45');
    expect(board).not.toHaveTextContent('Maya Chen');

    // Switch sort to Average 5K -> #1 Priya Nair (23:20), #2 Samir Patel (26:00)
    await user.click(within(board).getByRole('button', { name: /average 5k/i }));
    const avgRows = within(board).getAllByTestId('speed-leaderboard-row');
    expect(avgRows[0]).toHaveTextContent('Priya Nair');
    expect(avgRows[1]).toHaveTextContent('Samir Patel');
  });

  it('shows an encouraging empty state when no opted-in Runners have completed timed Legs yet', async () => {
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
    });
    const api = new InMemoryEventApi(store);
    await api.unlockEvent('2027', 'FROST-2027');
    const runner = await api.createParticipant(eventId, {
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: null,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: null,
      isFirst5k: true,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });
    const snapshot = await api.getEventSnapshot(eventId);
    saveParticipantId(eventId, runner.id);
    const user = userEvent.setup();

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

    await user.click(screen.getByRole('tab', { name: /speed board/i }));
    const board = screen.getByRole('region', { name: /speed board/i });
    expect(board).toHaveTextContent(/no opted-in timed 5k legs yet/i);
    expect(board).toHaveTextContent(/optional/i);
  });

  it('preserves the renderSpeedBoardView override prop on RaceDayTab', async () => {
    const { api, eventId, snapshot, samir } = await createSpeedBoardFixture();
    saveParticipantId(eventId, samir.id);
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <RaceDayTab renderSpeedBoardView={() => <div>Custom Speed Board Override</div>} />
        </EventDataProvider>
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /speed board/i }));
    expect(screen.getByText('Custom Speed Board Override')).toBeInTheDocument();
  });
});
