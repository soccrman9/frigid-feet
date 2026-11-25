import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';

// Event starts 2027-01-09 8:00 AM EST (13:00Z).
// Default test "now" = 11:24 AM EST (16:24Z) -> Round 4 active!
const EVENT_START_ISO = '2027-01-09T13:00:00.000Z';
const ROUND_4_NOW_MS = Date.parse('2027-01-09T16:24:18.000Z'); // 24:18 into Round 4

async function createRaceDayFixture() {
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

  const lakeLoop = await organizerApi.upsertCourse(eventId, {
    name: 'Lake Loop 5K',
    description: 'Rolling park trail',
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });

  const api = new InMemoryEventApi(store);
  await api.ensureSession();
  await api.unlockEvent('2027', 'FROST-2027');

  // Create Teams out of alphabetical order to verify alphabetical Team 50K list
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

  const coldBrew = await api.createTeam(eventId, {
    name: 'Cold Brew Crew',
    tagline: null,
    colorHex: '#C86D09',
    emoji: '☕',
    isOpen: true,
    lookingNote: null,
  });

  // Participants
  // Maya (Frostbite, private times by default)
  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 32,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Alex (Frostbite teammate, private times)
  const alex = await api.createParticipant(eventId, {
    displayName: 'Alex Rivera',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Samir (Cold Brew Crew, opted-in to Speed Leaderboard times)
  const samir = await api.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_runner',
    teamId: coldBrew.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 36,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  // Jordan (Snow Patrol, private times)
  const jordan = await api.createParticipant(eventId, {
    displayName: 'Jordan Lee',
    rsvpStatus: 'going_runner',
    teamId: snowPatrol.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 25,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Riley (Supporter, no Team)
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

  // Complete Rounds 1-3 for Frostbite Fighters (15 km), Snow Patrol (15 km), Cold Brew (10 km)
  for (const r of [1, 2, 3]) {
    const startIso = new Date(Date.parse(EVENT_START_ISO) + (r - 1) * 3_600_000).toISOString();
    const endIso = new Date(Date.parse(startIso) + 27 * 60_000).toISOString();

    await api.updateLeg(eventId, legFor(frostbite.id, r).id, {
      runnerId: r === 1 ? maya.id : alex.id,
      status: 'completed',
      startedAt: startIso,
      finishedAt: endIso,
      durationSeconds: 1620, // 27:00
      courseId: boardwalk.id,
    });

    await api.updateLeg(eventId, legFor(snowPatrol.id, r).id, {
      runnerId: jordan.id,
      status: 'completed',
      startedAt: startIso,
      finishedAt: endIso,
      durationSeconds: 1500, // 25:00
      courseId: boardwalk.id,
    });

    if (r <= 2) {
      await api.updateLeg(eventId, legFor(coldBrew.id, r).id, {
        runnerId: samir.id,
        status: 'completed',
        startedAt: startIso,
        finishedAt: endIso,
        durationSeconds: 1860, // 31:00
        courseId: lakeLoop.id,
      });
    }
  }

  // Round 4 setup (11:00 AM EST = 16:00:00Z):
  // - Maya (Frostbite) is out_on_course for 24:18
  // - Samir (Cold Brew) is completed with 23:10 (opted-in public time)
  // - Jordan (Snow Patrol) is completed with 21:05 (private time!)
  // Round 5 setup:
  // - Maya is scheduled for Round 5
  const r4StartIso = '2027-01-09T16:00:00.000Z';
  await api.updateLeg(eventId, legFor(frostbite.id, 4).id, {
    runnerId: maya.id,
    status: 'out_on_course',
    startedAt: r4StartIso,
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(coldBrew.id, 4).id, {
    runnerId: samir.id,
    status: 'completed',
    startedAt: r4StartIso,
    finishedAt: '2027-01-09T16:23:10.000Z',
    durationSeconds: 1390, // 23:10
    courseId: lakeLoop.id,
  });
  await api.updateLeg(eventId, legFor(snowPatrol.id, 4).id, {
    runnerId: jordan.id,
    status: 'completed',
    startedAt: r4StartIso,
    finishedAt: '2027-01-09T16:21:05.000Z',
    durationSeconds: 1265, // 21:05 (private!)
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(frostbite.id, 5).id, {
    runnerId: maya.id,
    status: 'scheduled',
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(coldBrew.id, 5).id, {
    runnerId: samir.id,
    status: 'scheduled',
    courseId: lakeLoop.id,
  });

  const freshSnapshot = await api.getEventSnapshot(eventId);
  const freshLegFor = (teamId: string, roundNumber: number) =>
    freshSnapshot.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  return {
    store,
    api,
    organizerApi,
    eventId,
    snapshot: freshSnapshot,
    boardwalk,
    lakeLoop,
    frostbite,
    coldBrew,
    snowPatrol,
    maya,
    alex,
    samir,
    jordan,
    riley,
    legFor: freshLegFor,
  };
}

describe('RaceDayTab — Polar Field Log Variant B timeline, check-ins, Thumb Dock & Undo', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(ROUND_4_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the Polar Field Log Variant B header Round badge, 44px sub-view bar, 10-Round pill rail, Round lineup, and alphabetical Team 50K list', async () => {
    const { api, eventId, snapshot, maya } = await createRaceDayFixture();
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

    // Header shows active Round badge R4
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('R4')).toBeInTheDocument();

    // 44px segmented sub-view bar (Timeline, Badges, Speed Board)
    const tablist = screen.getByRole('tablist', { name: /race day views/i });
    expect(within(tablist).getByRole('tab', { name: /^timeline$/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(tablist).getByRole('tab', { name: /badges/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /speed board/i })).toBeInTheDocument();

    // 10-Round pill rail (R1 through R10) with completed/active/upcoming states
    const rail = screen.getByRole('region', { name: /rounds 1 to 10/i });
    for (let r = 1; r <= 10; r += 1) {
      expect(
        within(rail).getByRole('button', { name: new RegExp(`^round ${r}\\b`, 'i') }),
      ).toBeInTheDocument();
    }
    expect(within(rail).getByRole('button', { name: /round 1.*completed/i })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /round 4.*active/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Round 4 lineup displays Maya Out (24:18 + ETA bar), Samir Done, Jordan Done
    const lineup = screen.getByRole('region', { name: /round 4 lineup/i });
    expect(lineup).toHaveTextContent('Maya Chen');
    expect(lineup).toHaveTextContent('24:18');
    expect(lineup).toHaveTextContent('Frostbite Fighters');
    expect(lineup).toHaveTextContent('Boardwalk 5K');
    expect(lineup).toHaveTextContent('Samir Patel');
    expect(lineup).toHaveTextContent('Jordan Lee');

    // Switch to Round 5 via pill rail
    await user.click(within(rail).getByRole('button', { name: /round 5/i }));
    const round5Lineup = screen.getByRole('region', { name: /round 5 lineup/i });
    expect(round5Lineup).toHaveTextContent('Maya Chen');
    expect(round5Lineup).toHaveTextContent('Samir Patel');

    // Alphabetical Team 50K list: Cold Brew Crew (15 / 50 km), Frostbite Fighters (15 / 50 km), Snow Patrol (20 / 50 km)
    const teamList = screen.getByRole('region', { name: /teams.*50k progress/i });
    const teamNames = within(teamList)
      .getAllByTestId('team-progress-name')
      .map((el) => el.textContent);
    expect(teamNames).toEqual([
      expect.stringContaining('Cold Brew Crew'),
      expect.stringContaining('Frostbite Fighters'),
      expect.stringContaining('Snow Patrol'),
    ]);
    expect(teamList).toHaveTextContent('15 / 50 km');
    expect(teamList).toHaveTextContent('20 / 50 km');

    // Sub-view switching works cleanly
    await user.click(within(tablist).getByRole('tab', { name: /badges/i }));
    expect(within(tablist).getByRole('tab', { name: /badges/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(tablist).getByRole('tab', { name: /speed board/i }));
    expect(within(tablist).getByRole('tab', { name: /speed board/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('enforces role-scoped Start/Finish buttons, duration_seconds privacy hiding, and calm >60-minute check-in prompt without red alarms', async () => {
    const { api, eventId, frostbite, coldBrew, snowPatrol, maya, alex, jordan, riley, legFor } =
      await createRaceDayFixture();

    // Put Maya out_on_course for 64 minutes (started 10:20 AM EST = 15:20:00Z, now = 11:24:18 AM EST)
    const mayaR4Leg = legFor(frostbite.id, 4);
    await api.updateLeg(eventId, mayaR4Leg.id, {
      status: 'out_on_course',
      startedAt: '2027-01-09T15:20:00.000Z',
    });
    const snapshot = await api.getEventSnapshot(eventId);

    // 1. View as Alex (Maya's teammate on Frostbite Fighters)
    saveParticipantId(eventId, alex.id);
    const { unmount } = render(
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

    const lineup = screen.getByRole('region', { name: /round 4 lineup/i });

    // Teammate Alex sees Finish & Edit on Maya's Leg + calm >60-min prompt
    const mayaRow = within(lineup).getByTestId(`leg-row-${mayaR4Leg.id}`);
    expect(within(mayaRow).getByRole('button', { name: /finish maya chen/i })).toBeInTheDocument();
    const calmNudge = within(mayaRow).getByTestId(`calm-nudge-${mayaR4Leg.id}`);
    expect(calmNudge).toHaveTextContent(/forgot to check in\?/i);
    // Zero red/error styling on the calm nudge
    expect(calmNudge.getAttribute('style') ?? '').not.toMatch(/error|red|#9b1c1c|crimson/i);
    expect(calmNudge.className).not.toMatch(/red|rose|crimson|danger|error/i);

    // Alex does NOT see Finish/Start/Edit buttons on Samir (Cold Brew) or Jordan (Snow Patrol)
    const samirR4Leg = legFor(coldBrew.id, 4);
    const jordanR4Leg = legFor(snowPatrol.id, 4);
    const samirRow = within(lineup).getByTestId(`leg-row-${samirR4Leg.id}`);
    const jordanRow = within(lineup).getByTestId(`leg-row-${jordanR4Leg.id}`);
    expect(within(samirRow).queryByRole('button', { name: /edit samir/i })).not.toBeInTheDocument();
    expect(within(jordanRow).queryByRole('button', { name: /edit jordan/i })).not.toBeInTheDocument();

    // Privacy: Samir opted in (23:10 visible), Jordan opted out (21:05 HIDDEN -> shows "5K ✓")
    expect(within(samirRow).getByTestId(`leg-result-${samirR4Leg.id}`)).toHaveTextContent('23:10');
    expect(within(jordanRow).getByTestId(`leg-result-${jordanR4Leg.id}`)).toHaveTextContent('5K ✓');
    expect(jordanRow).not.toHaveTextContent('21:05');
    unmount();

    // 2. View as Jordan himself -> ALWAYS sees his own 21:05 duration even though showTimesOnLeaderboard = false
    saveParticipantId(eventId, jordan.id);
    const { unmount: unmountJordan } = render(
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
    const jordanOwnRow = screen.getByTestId(`leg-row-${jordanR4Leg.id}`);
    expect(within(jordanOwnRow).getByTestId(`leg-result-${jordanR4Leg.id}`)).toHaveTextContent(
      '21:05',
    );
    // Jordan (different Team) does NOT see Maya's "Forgot to check in?" nudge
    expect(screen.queryByTestId(`calm-nudge-${mayaR4Leg.id}`)).not.toBeInTheDocument();
    unmountJordan();

    // 3. View as Riley (Supporter) -> zero Start/Finish/Edit buttons, zero calm nudge, hidden Thumb Dock
    saveParticipantId(eventId, riley.id);
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
    expect(screen.queryByRole('button', { name: /finish maya/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit maya/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId(`calm-nudge-${mayaR4Leg.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId('thumb-action-dock')).not.toBeInTheDocument();
    expect(maya.showTimesOnLeaderboard).toBe(false);
  });

  it('transitions Sticky Thumb Action Dock cleanly across out_on_course -> upcoming -> out_on_course -> all_done -> Event Recap', async () => {
    const { api, eventId, snapshot, maya } = await createRaceDayFixture();
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

    // 1. Currently out_on_course on Round 4 -> shows OUT 24:18 + Finish My 5K Leg
    const dock = screen.getByTestId('thumb-action-dock');
    expect(dock).toHaveTextContent('OUT 24:18');
    const finishCta = within(dock).getByRole('button', { name: /finish my 5k leg/i });
    await user.click(finishCta);

    // 2. Next Leg (Round 5 at 12:00 PM) is upcoming -> countdown + Start Early
    expect(dock).toHaveTextContent(/NEXT LEG · R5/i);
    expect(dock).toHaveTextContent(/IN 35:42/i);
    const startEarlyCta = within(dock).getByRole('button', { name: /start early/i });
    await user.click(startEarlyCta);

    // 3. Now out_on_course on Round 5 -> Finish My 5K Leg
    expect(dock).toHaveTextContent(/YOUR LEG · R5/i);
    await user.click(within(dock).getByRole('button', { name: /finish my 5k leg/i }));

    // 4. All assigned Legs completed -> All Done Today — View Event Recap
    const recapCta = within(dock).getByRole('button', {
      name: /all done today — view event recap/i,
    });
    await user.click(recapCta);
    expect(screen.getByRole('region', { name: /event recap/i })).toHaveTextContent(/km run together/i);
  });

  it('supports Leg Editor Course change, direct Mark Completed, watch time edit/clear, safe https:// activity URL pill, and status revert', async () => {
    const { api, eventId, snapshot, lakeLoop, frostbite, maya, legFor } =
      await createRaceDayFixture();
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

    // Switch to Round 5 where Maya is scheduled
    const rail = screen.getByRole('region', { name: /rounds 1 to 10/i });
    await user.click(within(rail).getByRole('button', { name: /^round 5\b/i }));

    const mayaR5Leg = legFor(frostbite.id, 5);
    const r5Row = screen.getByTestId(`leg-row-${mayaR5Leg.id}`);

    // Open Edit dialog on scheduled Round 5 Leg -> pick alternate Course + Mark Completed directly
    await user.click(within(r5Row).getByRole('button', { name: /edit maya chen round 5 leg/i }));
    await user.selectOptions(screen.getByLabelText(/^course$/i), lakeLoop.id);
    await user.click(screen.getByRole('button', { name: /mark completed/i }));

    // Round 5 Leg is now completed on Lake Loop 5K
    const updatedRow = screen.getByTestId(`leg-row-${mayaR5Leg.id}`);
    expect(updatedRow).toHaveAttribute('data-leg-status', 'completed');
    expect(updatedRow).toHaveTextContent('Lake Loop 5K');

    // Re-open Edit -> enter watch time 26:15 and try unsafe javascript: URL first
    await user.click(within(updatedRow).getByRole('button', { name: /edit maya chen round 5 leg/i }));
    const durationInput = screen.getByLabelText(/watch time/i);
    await user.clear(durationInput);
    await user.type(durationInput, '26:15');

    const urlInput = screen.getByLabelText(/external activity link/i);
    await user.type(urlInput, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: /save leg/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/https:\/\//i);

    // Replace with safe https:// Strava link -> saves and renders "View activity" pill
    await user.clear(urlInput);
    await user.type(urlInput, 'https://www.strava.com/activities/987654');
    await user.click(screen.getByRole('button', { name: /save leg/i }));

    const link = within(screen.getByTestId(`leg-row-${mayaR5Leg.id}`)).getByRole('link', {
      name: /view activity/i,
    });
    expect(link).toHaveAttribute('href', 'https://www.strava.com/activities/987654');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByTestId(`leg-result-${mayaR5Leg.id}`)).toHaveTextContent('26:15');

    // Re-open Edit -> clear watch time to blank -> saves durationSeconds = null (shows 5K ✓)
    await user.click(
      within(screen.getByTestId(`leg-row-${mayaR5Leg.id}`)).getByRole('button', {
        name: /edit maya chen round 5 leg/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: /clear time/i }));
    await user.click(screen.getByRole('button', { name: /save leg/i }));
    expect(screen.getByTestId(`leg-result-${mayaR5Leg.id}`)).toHaveTextContent('5K ✓');

    // Re-open Edit -> revert status back to Out on Course (explicit revert)
    await user.click(
      within(screen.getByTestId(`leg-row-${mayaR5Leg.id}`)).getByRole('button', {
        name: /edit maya chen round 5 leg/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: /^out on course$/i }));
    await user.click(screen.getByRole('button', { name: /save leg/i }));
    expect(screen.getByTestId(`leg-row-${mayaR5Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );
  });

  it('shows accessible popover="manual" ~8s Undo toast with priority over collective milestone toasts and reverts via isExplicitRevert', async () => {
    const { api, eventId, snapshot, frostbite, maya, legFor } = await createRaceDayFixture();
    const applySpy = vi.spyOn(api, 'applyLegMutation');
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

    const mayaR4Leg = legFor(frostbite.id, 4);
    const originalStartedAt = mayaR4Leg.startedAt;

    // Tap Finish My 5K Leg -> popover="manual" Undo toast takes priority over milestone toast
    await user.click(screen.getByRole('button', { name: /finish my 5k leg/i }));

    const popoverEl = screen.getByTestId('race-day-toast-popover');
    expect(popoverEl).toHaveAttribute('popover', 'manual');
    const undoToast = screen.getByTestId('undo-toast');
    expect(undoToast).toHaveTextContent(/maya chen finished round 4/i);
    // Milestone toast is NOT shown while Undo toast has priority
    expect(screen.queryByTestId('milestone-toast')).not.toBeInTheDocument();

    // Click Undo -> calls applyLegMutation with isExplicitRevert: true and restores out_on_course
    await user.click(within(undoToast).getByRole('button', { name: /^undo$/i }));

    expect(applySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        legId: mayaR4Leg.id,
        status: 'out_on_course',
        startedAt: originalStartedAt,
        finishedAt: null,
        durationSeconds: null,
        isExplicitRevert: true,
      }),
    );
    expect(screen.getByTestId(`leg-row-${mayaR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );
    expect(screen.queryByTestId('undo-toast')).not.toBeInTheDocument();
    expect(screen.queryByTestId('milestone-toast')).not.toBeInTheDocument();

    // Finish again and dismiss Undo -> collective distance milestone toast surfaces and is tap-anywhere-to-dismiss
    await user.click(screen.getByRole('button', { name: /finish my 5k leg/i }));
    await user.click(screen.getByRole('button', { name: /dismiss notification/i }));

    const milestoneToast = screen.getByTestId('milestone-toast');
    expect(milestoneToast).toHaveTextContent(/55 km together/i);
    expect(milestoneToast).toHaveTextContent(/tap to dismiss/i);

    await user.click(milestoneToast);
    expect(screen.queryByTestId('milestone-toast')).not.toBeInTheDocument();
  });

  it('auto-fades Undo after ~8s, auto-fades milestone toast after ~5s, and handles stale_or_overridden responses calmly', async () => {
    const { api, eventId, snapshot, frostbite, maya, legFor } = await createRaceDayFixture();
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

    // Finish Maya's Round 4 Leg -> Undo appears, auto-fades at 8s, then milestone appears and auto-fades at 5s
    await user.click(screen.getByRole('button', { name: /finish my 5k leg/i }));
    expect(await screen.findByTestId('undo-toast')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_100);
    });
    expect(screen.queryByTestId('undo-toast')).not.toBeInTheDocument();
    expect(screen.getByTestId('milestone-toast')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(screen.queryByTestId('milestone-toast')).not.toBeInTheDocument();

    // Simulate stale_or_overridden server conflict on Start Early (e.g. Organizer already updated the Leg)
    const mayaR5Leg = legFor(frostbite.id, 5);
    vi.spyOn(api, 'applyLegMutation').mockResolvedValueOnce({
      applied: false,
      reason: 'stale_or_overridden',
      leg: {
        ...mayaR5Leg,
        status: 'completed',
        finishedAt: new Date(Date.now()).toISOString(),
        updatedByOrganizer: true,
      },
    });

    await user.click(screen.getByRole('button', { name: /start early/i }));
    expect(await screen.findByTestId('status-notice-toast')).toHaveTextContent(
      /updated to latest basecamp status/i,
    );
    // Synced to server state: Maya now has all assigned Legs completed
    expect(
      screen.getByRole('button', { name: /all done today — view event recap/i }),
    ).toBeInTheDocument();
  });

  it('never leaks an opted-out Runner private 5K time in LegEditorDialog to teammates and preserves durationSeconds on Course edits', async () => {
    const { api, eventId, snapshot, lakeLoop, frostbite, alex, legFor } =
      await createRaceDayFixture();
    saveParticipantId(eventId, alex.id);
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

    // Switch to Round 1 where Maya (showTimesOnLeaderboard = false) completed with 27:00 (1620s)
    const rail = screen.getByRole('region', { name: /rounds 1 to 10/i });
    await user.click(within(rail).getByRole('button', { name: /^round 1\b/i }));

    const mayaR1Leg = legFor(frostbite.id, 1);
    expect(mayaR1Leg.durationSeconds).toBe(1620);

    const mayaR1Row = screen.getByTestId(`leg-row-${mayaR1Leg.id}`);
    expect(within(mayaR1Row).getByTestId(`leg-result-${mayaR1Leg.id}`)).toHaveTextContent('5K ✓');
    expect(mayaR1Row).not.toHaveTextContent('27:00');

    // Teammate Alex opens LegEditorDialog for Maya's completed Leg
    await user.click(within(mayaR1Row).getByRole('button', { name: /edit maya chen round 1 leg/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/watch time/i)).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('27:00');
    expect(dialog).toHaveTextContent(/5k time kept private by runner/i);

    // Alex updates Course to Lake Loop 5K and saves — Maya's private durationSeconds (1620) must be preserved
    await user.selectOptions(within(dialog).getByLabelText(/^course$/i), lakeLoop.id);
    await user.click(within(dialog).getByRole('button', { name: /save leg/i }));

    const updatedSnap = await api.getEventSnapshot(eventId);
    const updatedLeg = updatedSnap.legs.find((l) => l.id === mayaR1Leg.id)!;
    expect(updatedLeg.courseId).toBe(lakeLoop.id);
    expect(updatedLeg.durationSeconds).toBe(1620);
  });
});
