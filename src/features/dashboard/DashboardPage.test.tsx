import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventAccessError } from '../../types/domain';
import { DASHBOARD_FALLBACK_POLL_MS, DashboardPage } from './DashboardPage';
import type { ChimeKind } from './dashboardChime';

function setDocumentVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function createDashboardFixture(startIso = '2027-01-09T13:00:00.000Z') {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: startIso,
    timezone: 'America/New_York',
    inviteCode: 'FROST50K',
    organizerPasscode: 'HOST50K',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST50K');

  const primaryCourse = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: 'Flat waterfront loop',
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });
  const secondCourse = await organizerApi.upsertCourse(eventId, {
    name: 'Pine Ridge 5K',
    description: 'Wooded ridge',
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });

  // Create teams out of alphabetical order to verify A-Z sorting
  const zestyTeam = await organizerApi.createTeam(eventId, {
    name: 'Zesty Snowshoes',
    tagline: null,
    colorHex: '#157A4B',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });
  const arcticTeam = await organizerApi.createTeam(eventId, {
    name: 'Arctic Anchors',
    tagline: null,
    colorHex: '#163A59',
    emoji: '⚓',
    isOpen: true,
    lookingNote: null,
  });
  const mittenTeam = await organizerApi.createTeam(eventId, {
    name: 'Mitten Striders',
    tagline: null,
    colorHex: '#C86D09',
    emoji: '🧤',
    isOpen: true,
    lookingNote: null,
  });

  const maya = await organizerApi.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: arcticTeam.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: true,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });
  const sam = await organizerApi.createParticipant(eventId, {
    displayName: 'Sam Patel',
    rsvpStatus: 'going_runner',
    teamId: mittenTeam.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 35,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });
  const jordan = await organizerApi.createParticipant(eventId, {
    displayName: 'Jordan Lee',
    rsvpStatus: 'going_runner',
    teamId: zestyTeam.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const snap = await organizerApi.getEventSnapshot(eventId);
  const arcticLegs = snap.legs.filter((l) => l.teamId === arcticTeam.id);
  const mittenLegs = snap.legs.filter((l) => l.teamId === mittenTeam.id);
  const zestyLegs = snap.legs.filter((l) => l.teamId === zestyTeam.id);

  // Arctic Anchors: 10/10 completed -> 50K Finisher
  for (const leg of arcticLegs) {
    await organizerApi.updateLeg(eventId, leg.id, {
      runnerId: maya.id,
      status: 'completed',
      startedAt: startIso,
      finishedAt: '2027-01-09T13:28:00.000Z',
      durationSeconds: 1680,
    });
  }

  // Mitten Striders: 5 completed (Halfway), Round 2 out > 60 min (started 13:30Z), Round 3 scheduled
  for (const r of [1, 4, 5, 6, 7]) {
    const leg = mittenLegs.find((l) => l.roundNumber === r)!;
    await organizerApi.updateLeg(eventId, leg.id, {
      runnerId: sam.id,
      status: 'completed',
      startedAt: startIso,
      finishedAt: '2027-01-09T13:35:00.000Z',
      durationSeconds: 2100,
    });
  }
  const mittenR2 = mittenLegs.find((l) => l.roundNumber === 2)!;
  await organizerApi.updateLeg(eventId, mittenR2.id, {
    runnerId: sam.id,
    courseId: secondCourse.id,
    status: 'out_on_course',
    startedAt: '2027-01-09T13:30:00.000Z',
  });
  const mittenR3 = mittenLegs.find((l) => l.roundNumber === 3)!;
  await organizerApi.updateLeg(eventId, mittenR3.id, {
    runnerId: sam.id,
    courseId: primaryCourse.id,
    status: 'scheduled',
  });

  // Zesty Snowshoes: Round 2 out (started 14:20Z), Round 3 scheduled
  const zestyR2 = zestyLegs.find((l) => l.roundNumber === 2)!;
  await organizerApi.updateLeg(eventId, zestyR2.id, {
    runnerId: jordan.id,
    courseId: primaryCourse.id,
    status: 'out_on_course',
    startedAt: '2027-01-09T14:20:00.000Z',
  });
  const zestyR3 = zestyLegs.find((l) => l.roundNumber === 3)!;
  await organizerApi.updateLeg(eventId, zestyR3.id, {
    runnerId: jordan.id,
    courseId: primaryCourse.id,
    status: 'scheduled',
  });

  // Mark Rounds 1 & 2 started so Round 3 (15:00:00Z) is On Deck
  for (const r of store.rounds.values()) {
    if (r.eventId === eventId && r.roundNumber <= 2) {
      r.startedAt = r.scheduledStartAt;
    }
  }

  // Organizer superlative award
  const outfitBadge = snap.badgeDefinitions.find((b) => b.name === 'Best Cold-Weather Outfit')!;
  await organizerApi.createBadgeAward(eventId, {
    badgeDefinitionId: outfitBadge.id,
    participantId: maya.id,
    teamId: null,
    note: 'Neon balaclava!',
  });

  const dashboardApi = new InMemoryEventApi(store);
  return {
    store,
    eventId,
    organizerApi,
    dashboardApi,
    teams: { arcticTeam, mittenTeam, zestyTeam },
    participants: { maya, sam, jordan },
    courses: { primaryCourse, secondCourse },
  };
}

function renderDashboard(
  eventApi: InMemoryEventApi,
  token = 'dash-token-2027',
  onPlayChime?: (kind: ChimeKind) => void,
) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/${token}`]}>
      <Routes>
        <Route
          path="/dashboard/:token"
          element={<DashboardPage eventApi={eventApi} onPlayChime={onPlayChime} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPage — Variant A 50/50 board, calm >60m UX, chime & resilient sync', () => {
  beforeEach(() => {
    localStorage.clear();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    setDocumentVisibility('visible');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders full-screen Variant A 50/50 board with dark chalet default, calm >60m Runner card, On Deck banner, alphabetical Teams with milestones, and toggleable Live Badges ticker', async () => {
    // Set clock to 14:40:00Z (Sam has been out 70 min; Round 3 starts at 15:00:00Z in 20:00)
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-09T14:40:00.000Z'));
    const { dashboardApi } = await createDashboardFixture();
    const user = userEvent.setup();

    renderDashboard(dashboardApi);

    // Header: Event title, Basecamp Dashboard heading, collective km (15 completed Legs = 75 km), Round pill, clock
    expect(await screen.findByRole('heading', { name: /Basecamp Dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('Winter Grind 50K 2027')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-collective-km')).toHaveTextContent(/75\s*km/i);
    expect(screen.getByTestId('dashboard-round-pill')).toHaveTextContent(/Round 2 of 10/i);
    expect(screen.getByTestId('dashboard-clock')).toBeInTheDocument();

    // Default theme is dark chalet mode; Light/Dark toggle switches to daylight mode cleanly
    const root = screen.getByTestId('dashboard-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    const themeToggle = screen.getByRole('button', { name: /switch to light|daylight/i });
    await user.click(themeToggle);
    expect(root).toHaveAttribute('data-theme', 'light');
    await user.click(screen.getByRole('button', { name: /switch to dark|dark chalet/i }));
    expect(root).toHaveAttribute('data-theme', 'dark');

    // Left 50%: Out on Course cards (Sam Patel > 60 min with ZERO red/alarm styling, Jordan Lee normal)
    const outSection = screen.getByRole('region', { name: /Out on Course/i });
    const outCards = within(outSection).getAllByTestId('out-on-course-card');
    expect(outCards).toHaveLength(2);
    expect(outCards[0]).toHaveTextContent('Sam Patel');
    expect(outCards[0]).toHaveTextContent('Mitten Striders');
    expect(outCards[0]).toHaveTextContent('Pine Ridge 5K');
    expect(outCards[0]).toHaveTextContent('1:10:00');
    // Verify ZERO red or alarm styling on >60m card
    expect(outCards[0].getAttribute('role')).not.toBe('alert');
    expect(outCards[0].innerHTML).not.toMatch(/accent-error|text-red|bg-red|border-red/i);
    expect(within(outSection).queryByRole('alert')).not.toBeInTheDocument();

    // Left 50%: Amber On Deck next-Round countdown banner
    const onDeckSection = screen.getByRole('region', { name: /On Deck/i });
    expect(onDeckSection).toHaveTextContent(/Round 3/i);
    expect(onDeckSection).toHaveTextContent('20:00');
    expect(onDeckSection).toHaveTextContent('Sam Patel');
    expect(onDeckSection).toHaveTextContent('Jordan Lee');

    // Right 50%: Alphabetical Teams list with 10-segment 50K bars & Halfway / 50K Finisher callouts
    const teamsSection = screen.getByRole('region', { name: /Teams 50K Progress/i });
    const teamNames = within(teamsSection)
      .getAllByTestId('dashboard-team-name')
      .map((el) => el.textContent?.trim());
    expect(teamNames).toEqual([
      expect.stringContaining('Arctic Anchors'),
      expect.stringContaining('Mitten Striders'),
      expect.stringContaining('Zesty Snowshoes'),
    ]);
    expect(teamsSection).toHaveTextContent(/50K Finisher/i);
    expect(teamsSection).toHaveTextContent(/Halfway/i);

    // Bottom ticker: Live Badges combines Organizer superlatives + auto Badges and toggles cleanly
    const ticker = screen.getByRole('region', { name: /Live Badges/i });
    expect(ticker).toHaveTextContent('Best Cold-Weather Outfit');
    expect(ticker).toHaveTextContent('Maya Chen');
    expect(ticker).toHaveTextContent('50K Finisher');
    expect(ticker).toHaveTextContent('Arctic Anchors');

    const badgesToggle = screen.getByRole('button', { name: /Badges/i });
    expect(badgesToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(badgesToggle);
    expect(badgesToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: /Live Badges/i })).not.toBeInTheDocument();
  });

  it('displays a clean, calm invalid-token screen without leaking Event data when token is unmatched', async () => {
    const { dashboardApi } = await createDashboardFixture();
    renderDashboard(dashboardApi, 'totally-invalid-token');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid/i);
    expect(screen.queryByText('Winter Grind 50K 2027')).not.toBeInTheDocument();
    expect(screen.queryByText('Arctic Anchors')).not.toBeInTheDocument();
  });

  it('keeps Chime muted by default, and when unmuted fires gently at T-5 min and T-0 without duplicating on re-renders', async () => {
    vi.useFakeTimers();
    // Round 3 scheduled at 15:00:00Z. Start at 14:54:58Z (T-5m02s).
    vi.setSystemTime(new Date('2027-01-09T14:54:58.000Z'));

    const { dashboardApi } = await createDashboardFixture();
    const playChimeSpy = vi.fn<(kind: ChimeKind) => void>();

    renderDashboard(dashboardApi, 'dash-token-2027', playChimeSpy);

    // Wait for initial async load while timers are faked
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Winter Grind 50K 2027')).toBeInTheDocument();

    // Chime toggle is MUTED by default
    const chimeBtn = screen.getByRole('button', { name: /Chime/i });
    expect(chimeBtn).toHaveAttribute('aria-pressed', 'false');
    expect(chimeBtn).toHaveTextContent(/Muted/i);

    // Advance past T-5:00 while muted -> ZERO chimes
    await act(async () => {
      vi.advanceTimersByTime(3_000); // 14:55:01Z
    });
    expect(playChimeSpy).not.toHaveBeenCalled();

    // Rewind to 14:54:58Z and unmute Chime
    vi.setSystemTime(new Date('2027-01-09T14:54:58.000Z'));
    await act(async () => {
      chimeBtn.click();
    });
    expect(chimeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(playChimeSpy).not.toHaveBeenCalled();

    // Cross T-5:00 -> fires 't-5' ONCE
    await act(async () => {
      vi.advanceTimersByTime(3_000); // 14:55:01Z
    });
    expect(playChimeSpy).toHaveBeenCalledTimes(1);
    expect(playChimeSpy).toHaveBeenLastCalledWith('t-5');

    // Multiple subsequent 1s ticks / re-renders inside T-5 window -> NEVER duplicates
    await act(async () => {
      vi.advanceTimersByTime(10_000); // 14:55:11Z
    });
    expect(playChimeSpy).toHaveBeenCalledTimes(1);

    // Jump to 14:59:58Z and cross T-0 -> fires 't-0' ONCE
    vi.setSystemTime(new Date('2027-01-09T14:59:58.000Z'));
    await act(async () => {
      vi.advanceTimersByTime(3_000); // 15:00:01Z
    });
    expect(playChimeSpy).toHaveBeenCalledTimes(2);
    expect(playChimeSpy).toHaveBeenLastCalledWith('t-0');

    // Subsequent ticks inside T-0 window -> NEVER duplicates
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(playChimeSpy).toHaveBeenCalledTimes(2);
  });

  it('stays continuously subscribed while hidden, runs 60s fallback poll strictly while disconnected, resyncs on reconnect, and silently re-unlocks on expired session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-09T14:40:00.000Z'));

    const { store, eventId, organizerApi, dashboardApi, teams } = await createDashboardFixture();
    const getSnapshotSpy = vi.spyOn(dashboardApi, 'getEventSnapshot');
    const unlockSpy = vi.spyOn(dashboardApi, 'unlockDashboard');

    renderDashboard(dashboardApi);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Winter Grind 50K 2027')).toBeInTheDocument();
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    const initialSnapshotCalls = getSnapshotSpy.mock.calls.length;

    // 1. Staying hidden past 30s NEVER unsubscribes Dashboard (pauseOnBackground: false)
    await act(async () => {
      setDocumentVisibility('hidden');
      vi.advanceTimersByTime(65_000);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    // Strictly ZERO fallback polling while connected!
    expect(getSnapshotSpy.mock.calls.length).toBe(initialSnapshotCalls);

    // Live Realtime updates merge immediately without refresh
    await act(async () => {
      await organizerApi.createTeam(eventId, {
        name: 'Glacier Gliders',
        tagline: null,
        colorHex: '#157A4B',
        emoji: '🧊',
        isOpen: true,
        lookingNote: null,
      });
    });
    expect(screen.getByText(/Glacier Gliders/)).toBeInTheDocument();

    // 2. Socket disconnects -> calm degraded status + 60-second fallback poll runs strictly while disconnected
    act(() => {
      store.simulateRealtimeStatus(eventId, 'disconnected');
    });
    expect(screen.getByTestId('dashboard-sync-status')).toHaveTextContent(/60s poll/i);

    // Inject backend update directly while disconnected (not emitted on dropped socket)
    const missedTeamId = 'team-missed-while-offline';
    store.teams.set(missedTeamId, {
      id: missedTeamId,
      eventId,
      name: 'Blizzard Buddies',
      tagline: null,
      colorHex: '#163A59',
      emoji: '🌨️',
      isOpen: true,
      lookingNote: null,
      createdAt: new Date().toISOString(),
    });
    expect(screen.queryByText(/Blizzard Buddies/)).not.toBeInTheDocument();

    // Advance 59s -> poll hasn't fired yet
    await act(async () => {
      vi.advanceTimersByTime(DASHBOARD_FALLBACK_POLL_MS - 1_000);
    });
    expect(getSnapshotSpy.mock.calls.length).toBe(initialSnapshotCalls);

    // Advance final 1s (total 60s) -> fallback poll fires and recovers missed Team!
    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getSnapshotSpy.mock.calls.length).toBe(initialSnapshotCalls + 1);
    expect(screen.getByText(/Blizzard Buddies/)).toBeInTheDocument();

    // 3. Socket reconnects -> triggers full snapshot resync and STOPS 60s polling
    const reconnectTeamId = 'team-recovered-on-reconnect';
    store.teams.set(reconnectTeamId, {
      id: reconnectTeamId,
      eventId,
      name: 'Frosty Foxes',
      tagline: null,
      colorHex: '#163A59',
      emoji: '🦊',
      isOpen: true,
      lookingNote: null,
      createdAt: new Date().toISOString(),
    });

    await act(async () => {
      store.simulateRealtimeStatus(eventId, 'connected');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Frosty Foxes/)).toBeInTheDocument();
    const callsAfterReconnect = getSnapshotSpy.mock.calls.length;

    // Advance 2 full minutes while connected -> ZERO fallback polls!
    await act(async () => {
      vi.advanceTimersByTime(DASHBOARD_FALLBACK_POLL_MS * 2);
    });
    expect(getSnapshotSpy.mock.calls.length).toBe(callsAfterReconnect);

    // 4. Expired Anonymous Auth session (UNAUTHORIZED / FORBIDDEN on resync) -> silently re-calls unlockDashboard(token) before resubscribing
    const subscribeSpy = vi.spyOn(dashboardApi, 'subscribeToEvent');
    const unlockCallsBefore = unlockSpy.mock.calls.length;
    getSnapshotSpy.mockRejectedValueOnce(
      new EventAccessError('UNAUTHORIZED', 'Anonymous session expired.'),
    );

    await act(async () => {
      store.simulateRealtimeStatus(eventId, 'reconnecting');
      store.simulateRealtimeStatus(eventId, 'connected');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unlockSpy.mock.calls.length).toBe(unlockCallsBefore + 1);
    expect(unlockSpy).toHaveBeenLastCalledWith('dash-token-2027');
    expect(subscribeSpy).toHaveBeenCalled();
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(teams.arcticTeam.name).toBe('Arctic Anchors');
  });

  it('transitions cleanly to the invalid-token screen if the Organizer rotates the Dashboard token while active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-09T14:40:00.000Z'));

    const { store, eventId, organizerApi, dashboardApi } = await createDashboardFixture();
    renderDashboard(dashboardApi, 'dash-token-2027');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Winter Grind 50K 2027')).toBeInTheDocument();

    // Organizer rotates the Dashboard token -> revokes existing 'dashboard' grants
    await organizerApi.rotateEventSecret(eventId, 'dashboard_token', 'brand-new-dash-token-2027');

    // Next reconnect resync receives FORBIDDEN -> silently attempts unlockDashboard(oldToken) -> INVALID_DASHBOARD_TOKEN
    await act(async () => {
      store.simulateRealtimeStatus(eventId, 'reconnecting');
      store.simulateRealtimeStatus(eventId, 'connected');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/invalid|rotated/i);
    expect(screen.queryByText('Winter Grind 50K 2027')).not.toBeInTheDocument();
  });
});
