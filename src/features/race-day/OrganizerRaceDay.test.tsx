import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';

// Event starts 2027-01-09 8:00 AM EST (13:00Z).
// Default test "now" = 11:00 AM EST (16:00Z) -> Round 4 active.
const EVENT_START_ISO = '2027-01-09T13:00:00.000Z';
const ROUND_4_NOW_MS = Date.parse('2027-01-09T16:00:00.000Z');

async function createOrganizerRaceDayFixture() {
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

  const participantApi = new InMemoryEventApi(store);
  await participantApi.ensureSession();
  await participantApi.unlockEvent('2027', 'FROST-2027');

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
    description: 'Rolling trail loop',
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });

  const frostbite = await organizerApi.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const coldBrew = await organizerApi.createTeam(eventId, {
    name: 'Cold Brew Crew',
    tagline: null,
    colorHex: '#C86D09',
    emoji: '☕',
    isOpen: true,
    lookingNote: null,
  });

  const snowPatrol = await organizerApi.createTeam(eventId, {
    name: 'Snow Patrol',
    tagline: null,
    colorHex: '#157A4B',
    emoji: '🎿',
    isOpen: true,
    lookingNote: null,
  });

  const polarPacers = await organizerApi.createTeam(eventId, {
    name: 'Polar Pacers',
    tagline: null,
    colorHex: '#0C1E30',
    emoji: '🧭',
    isOpen: true,
    lookingNote: null,
  });

  const maya = await organizerApi.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: frostbite.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const samir = await organizerApi.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_runner',
    teamId: coldBrew.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 34,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  const jordan = await organizerApi.createParticipant(eventId, {
    displayName: 'Jordan Lee',
    rsvpStatus: 'going_runner',
    teamId: snowPatrol.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 26,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const riley = await organizerApi.createParticipant(eventId, {
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

  const snap = await organizerApi.getEventSnapshot(eventId);
  const legFor = (teamId: string, roundNumber: number) =>
    snap.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  // Round 4 setup:
  // - Maya (Frostbite) scheduled
  // - Samir (Cold Brew) scheduled
  // - Jordan (Snow Patrol) already out_on_course (started 65 min ago -> triggers >60m calm prompt)
  // - Polar Pacers unassigned placeholder (runnerId = null)
  await organizerApi.updateLeg(eventId, legFor(frostbite.id, 4).id, {
    runnerId: maya.id,
    courseId: boardwalk.id,
    status: 'scheduled',
  });
  await organizerApi.updateLeg(eventId, legFor(coldBrew.id, 4).id, {
    runnerId: samir.id,
    courseId: lakeLoop.id,
    status: 'scheduled',
  });
  await organizerApi.updateLeg(eventId, legFor(snowPatrol.id, 4).id, {
    runnerId: jordan.id,
    courseId: boardwalk.id,
    status: 'out_on_course',
    startedAt: '2027-01-09T14:55:00.000Z', // 65 min before 16:00Z
    clientUpdatedAt: '2027-01-09T14:55:00.000Z',
  });

  // Round 3 completed Leg (Snow Patrol) so Round 4 is the active Round at 11:00 AM EST
  await organizerApi.updateLeg(eventId, legFor(snowPatrol.id, 3).id, {
    runnerId: jordan.id,
    courseId: boardwalk.id,
    status: 'completed',
    startedAt: '2027-01-09T15:00:00.000Z',
    finishedAt: '2027-01-09T15:26:00.000Z',
    durationSeconds: 1560,
    clientUpdatedAt: '2027-01-09T15:26:00.000Z',
  });

  // Round 5 setup (upcoming):
  // - Maya (Frostbite) scheduled
  // - Samir (Cold Brew) scheduled
  await organizerApi.updateLeg(eventId, legFor(frostbite.id, 5).id, {
    runnerId: maya.id,
    courseId: boardwalk.id,
    status: 'scheduled',
  });
  await organizerApi.updateLeg(eventId, legFor(coldBrew.id, 5).id, {
    runnerId: samir.id,
    courseId: lakeLoop.id,
    status: 'scheduled',
  });

  const freshSnapshot = await organizerApi.getEventSnapshot(eventId);
  const freshLegFor = (teamId: string, roundNumber: number) =>
    freshSnapshot.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  return {
    store,
    eventId,
    organizerApi,
    participantApi,
    snapshot: freshSnapshot,
    boardwalk,
    lakeLoop,
    frostbite,
    coldBrew,
    snowPatrol,
    polarPacers,
    maya,
    samir,
    jordan,
    riley,
    legFor: freshLegFor,
  };
}

describe('Organizer Race Day mass-start (Start Round N) & cross-Team overrides', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(ROUND_4_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides Start Round N for non-Organizers, shows >=44px Start Round N button for Organizers, disables with Requires connection offline, and mass-starts non-excluded scheduled Runners without bulk-undo', async () => {
    const {
      eventId,
      organizerApi,
      participantApi,
      snapshot,
      frostbite,
      coldBrew,
      snowPatrol,
      maya,
      riley,
      legFor,
    } = await createOrganizerRaceDayFixture();

    // 1. Non-Organizer Participant sees NO Start Round button
    saveParticipantId(eventId, maya.id);
    const { unmount } = render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={participantApi}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByRole('button', { name: /start round/i })).not.toBeInTheDocument();
    unmount();

    // 2. Organizer Mode unlocked (even while signed in as Supporter Riley) sees prominent Start Round 4 button
    saveParticipantId(eventId, riley.id);
    const startRoundSpy = vi.spyOn(organizerApi, 'startRound');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={organizerApi}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant', 'organizer']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    const startRoundBtn = screen.getByRole('button', { name: /start round 4/i });
    expect(startRoundBtn).toBeEnabled();
    expect(startRoundBtn.className).toMatch(/min-h-\[44px\]|h-11|h-\[44px\]/);

    // Offline disables Start Round N with "Requires connection"
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button', { name: /start round 4/i })).toBeDisabled();
    expect(screen.getByText(/requires connection/i)).toBeInTheDocument();

    // Back online re-enables Start Round N
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('button', { name: /start round 4/i })).toBeEnabled();

    // Open quick-uncheck confirmation sheet for Round 4
    await user.click(screen.getByRole('button', { name: /start round 4/i }));
    const dialog = screen.getByRole('dialog', { name: /start round 4/i });

    // Lists ONLY assigned 'scheduled' Runners (Maya & Samir), both checked by default.
    // Jordan (already out_on_course) and Polar Pacers (unassigned) are NOT checkboxes.
    const mayaCheckbox = within(dialog).getByRole('checkbox', { name: /maya chen/i });
    const samirCheckbox = within(dialog).getByRole('checkbox', { name: /samir patel/i });
    expect(mayaCheckbox).toBeChecked();
    expect(samirCheckbox).toBeChecked();
    expect(within(dialog).queryByRole('checkbox', { name: /jordan lee/i })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('checkbox', { name: /polar pacers/i }),
    ).not.toBeInTheDocument();

    // Uncheck Samir (late starter) and confirm Start Round 4
    await user.click(samirCheckbox);
    expect(samirCheckbox).not.toBeChecked();

    const samirR4Leg = legFor(coldBrew.id, 4);
    const mayaR4Leg = legFor(frostbite.id, 4);
    const jordanR4Leg = legFor(snowPatrol.id, 4);

    await user.click(within(dialog).getByRole('button', { name: /confirm.*start round 4/i }));

    expect(startRoundSpy).toHaveBeenCalledTimes(1);
    const [calledEventId, calledRound, calledExcludeIds, calledStartedAt] =
      startRoundSpy.mock.calls[0]!;
    expect(calledEventId).toBe(eventId);
    expect(calledRound).toBe(4);
    expect(calledExcludeIds).toEqual([samirR4Leg.id]);
    expect(typeof calledStartedAt).toBe('string');
    expect(Math.abs(Date.parse(calledStartedAt!) - ROUND_4_NOW_MS)).toBeLessThan(5_000);

    // Maya is now out_on_course, Samir stays scheduled, Jordan keeps original out_on_course
    expect(screen.getByTestId(`leg-row-${mayaR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );
    expect(screen.getByTestId(`leg-row-${samirR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'scheduled',
    );
    expect(screen.getByTestId(`leg-row-${jordanR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );

    // NO bulk-undo button exists after mass-start
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('undo-toast')).not.toBeInTheDocument();

    // Accidental single-Runner start (Maya) can be reverted individually right from the lineup
    const mayaRow = screen.getByTestId(`leg-row-${mayaR4Leg.id}`);
    await user.click(within(mayaRow).getByRole('button', { name: /edit maya chen round 4 leg/i }));
    await user.click(screen.getByRole('button', { name: /^scheduled$/i }));
    await user.click(screen.getByRole('button', { name: /save leg/i }));

    expect(screen.getByTestId(`leg-row-${mayaR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'scheduled',
    );
    const updatedSnap = await organizerApi.getEventSnapshot(eventId);
    const revertedMaya = updatedSnap.legs.find((l) => l.id === mayaR4Leg.id)!;
    expect(revertedMaya.status).toBe('scheduled');
    expect(revertedMaya.updatedByOrganizer).toBe(true);
  });

  it('lets an unlocked Organizer override any Team Leg (60+ min Log Finish Time, Start, Finish, Mark Completed, Course/time/URL edit, and revert) with updated_by_organizer = true', async () => {
    const {
      eventId,
      organizerApi,
      snapshot,
      boardwalk,
      coldBrew,
      snowPatrol,
      maya,
      legFor,
    } = await createOrganizerRaceDayFixture();

    // Signed in as Maya (Frostbite Fighters), overriding Cold Brew Crew and Snow Patrol!
    saveParticipantId(eventId, maya.id);
    const applySpy = vi.spyOn(organizerApi, 'applyLegMutation');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={organizerApi}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant', 'organizer']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // 1. Respond to Snow Patrol's Jordan Lee calm 60+ min "Forgot to check in?" prompt
    const jordanR4Leg = legFor(snowPatrol.id, 4);
    const jordanRow = screen.getByTestId(`leg-row-${jordanR4Leg.id}`);
    const nudge = within(jordanRow).getByTestId(`calm-nudge-${jordanR4Leg.id}`);
    expect(nudge).toHaveTextContent(/forgot to check in\?/i);

    await user.click(within(nudge).getByRole('button', { name: /log finish time/i }));

    // Clicking "Log Finish Time" opens LegEditorDialog pre-switched to Completed with Watch Time ready
    const durationInput = screen.getByLabelText(/watch time/i);
    await user.clear(durationInput);
    await user.type(durationInput, '32:10');
    await user.type(
      screen.getByLabelText(/external activity link/i),
      'https://www.strava.com/activities/555111',
    );
    await user.click(screen.getByRole('button', { name: /save leg/i }));

    expect(screen.getByTestId(`leg-row-${jordanR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'completed',
    );
    let currentSnap = await organizerApi.getEventSnapshot(eventId);
    let updatedJordan = currentSnap.legs.find((l) => l.id === jordanR4Leg.id)!;
    expect(updatedJordan.status).toBe('completed');
    expect(updatedJordan.durationSeconds).toBe(1930);
    expect(updatedJordan.externalActivityUrl).toBe('https://www.strava.com/activities/555111');
    expect(updatedJordan.updatedByOrganizer).toBe(true);

    // 2. Start then Finish Cold Brew Crew's Samir Patel (Round 4) from the lineup
    const samirR4Leg = legFor(coldBrew.id, 4);
    const samirRow = screen.getByTestId(`leg-row-${samirR4Leg.id}`);
    await user.click(within(samirRow).getByRole('button', { name: /start samir patel round 4 leg/i }));
    expect(screen.getByTestId(`leg-row-${samirR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );
    currentSnap = await organizerApi.getEventSnapshot(eventId);
    expect(currentSnap.legs.find((l) => l.id === samirR4Leg.id)!.updatedByOrganizer).toBe(true);

    await user.click(
      within(screen.getByTestId(`leg-row-${samirR4Leg.id}`)).getByRole('button', {
        name: /finish samir patel round 4 leg/i,
      }),
    );
    expect(screen.getByTestId(`leg-row-${samirR4Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'completed',
    );
    currentSnap = await organizerApi.getEventSnapshot(eventId);
    expect(currentSnap.legs.find((l) => l.id === samirR4Leg.id)!.updatedByOrganizer).toBe(true);

    // 3. Switch to Round 5 -> Start Round 5 button updates, Mark Completed + Course override + revert on Cold Brew Crew
    const rail = screen.getByRole('region', { name: /rounds 1 to 10/i });
    await user.click(within(rail).getByRole('button', { name: /^round 5\b/i }));
    expect(screen.getByRole('button', { name: /start round 5/i })).toBeInTheDocument();

    const samirR5Leg = legFor(coldBrew.id, 5);
    await user.click(
      within(screen.getByTestId(`leg-row-${samirR5Leg.id}`)).getByRole('button', {
        name: /edit samir patel round 5 leg/i,
      }),
    );
    await user.selectOptions(screen.getByLabelText(/^course$/i), boardwalk.id);
    await user.click(screen.getByRole('button', { name: /mark completed/i }));

    expect(screen.getByTestId(`leg-row-${samirR5Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'completed',
    );
    expect(screen.getByTestId(`leg-row-${samirR5Leg.id}`)).toHaveTextContent('Boardwalk 5K');
    currentSnap = await organizerApi.getEventSnapshot(eventId);
    let updatedSamirR5 = currentSnap.legs.find((l) => l.id === samirR5Leg.id)!;
    expect(updatedSamirR5.courseId).toBe(boardwalk.id);
    expect(updatedSamirR5.updatedByOrganizer).toBe(true);

    // Revert Samir's Round 5 Leg back to Scheduled via apply_leg_mutation with isExplicitRevert
    await user.click(
      within(screen.getByTestId(`leg-row-${samirR5Leg.id}`)).getByRole('button', {
        name: /edit samir patel round 5 leg/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: /^scheduled$/i }));
    await user.click(screen.getByRole('button', { name: /save leg/i }));

    expect(screen.getByTestId(`leg-row-${samirR5Leg.id}`)).toHaveAttribute(
      'data-leg-status',
      'scheduled',
    );
    expect(applySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        legId: samirR5Leg.id,
        status: 'scheduled',
        isExplicitRevert: true,
      }),
    );
    currentSnap = await organizerApi.getEventSnapshot(eventId);
    updatedSamirR5 = currentSnap.legs.find((l) => l.id === samirR5Leg.id)!;
    expect(updatedSamirR5.status).toBe('scheduled');
    expect(updatedSamirR5.updatedByOrganizer).toBe(true);
  });

  it('handles Start Round N cleanly when a Round has zero waiting Runners and updates official Round start time', async () => {
    const { eventId, organizerApi, snapshot, riley } = await createOrganizerRaceDayFixture();
    saveParticipantId(eventId, riley.id);
    const startRoundSpy = vi.spyOn(organizerApi, 'startRound');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={organizerApi}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant', 'organizer']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Switch to Round 3 where Jordan is already completed and zero waiting Runners remain
    const rail = screen.getByRole('region', { name: /rounds 1 to 10/i });
    await user.click(within(rail).getByRole('button', { name: /^round 3\b/i }));

    await user.click(screen.getByRole('button', { name: /start round 3/i }));
    const dialog = screen.getByRole('dialog', { name: /start round 3/i });
    expect(dialog).toHaveTextContent(/no waiting runners assigned in round 3/i);
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: /confirm start round 3/i }));
    expect(startRoundSpy).toHaveBeenCalledWith(eventId, 3, [], expect.any(String));

    const updatedSnap = await organizerApi.getEventSnapshot(eventId);
    expect(updatedSnap.rounds.find((r) => r.roundNumber === 3)!.startedAt).not.toBeNull();
  });

  it('resets unchecked Runners on cancel, surfaces server errors cleanly for retry, and hides Organizer controls after locking Organizer Mode', async () => {
    const { eventId, organizerApi, snapshot, coldBrew, maya, legFor } =
      await createOrganizerRaceDayFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={organizerApi}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant', 'organizer']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Open Start Round 4, uncheck Samir, then Cancel -> re-opening resets Samir to checked
    await user.click(screen.getByRole('button', { name: /start round 4/i }));
    let dialog = screen.getByRole('dialog', { name: /start round 4/i });
    await user.click(within(dialog).getByRole('checkbox', { name: /samir patel/i }));
    expect(within(dialog).getByRole('checkbox', { name: /samir patel/i })).not.toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await user.click(screen.getByRole('button', { name: /start round 4/i }));
    dialog = screen.getByRole('dialog', { name: /start round 4/i });
    expect(within(dialog).getByRole('checkbox', { name: /samir patel/i })).toBeChecked();

    // Simulate a server error on confirm -> dialog stays open with alert so Organizer can retry
    vi.spyOn(organizerApi, 'startRound').mockRejectedValueOnce(
      new Error('Organizer permission required'),
    );
    await user.click(within(dialog).getByRole('button', { name: /confirm start round 4/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/organizer permission required/i);
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    // Lock Organizer Mode from Home -> returning to Race Day hides Start Round & cross-Team overrides
    const nav = screen.getByRole('navigation', { name: /primary/i });
    await user.click(within(nav).getByRole('button', { name: /^home$/i }));
    await user.click(screen.getByRole('button', { name: /lock \/ exit/i }));
    await user.click(within(nav).getByRole('button', { name: /^race day$/i }));

    expect(screen.queryByRole('button', { name: /start round/i })).not.toBeInTheDocument();
    const samirR4Leg = legFor(coldBrew.id, 4);
    const samirRow = screen.getByTestId(`leg-row-${samirR4Leg.id}`);
    expect(
      within(samirRow).queryByRole('button', { name: /start samir patel/i }),
    ).not.toBeInTheDocument();
    expect(
      within(samirRow).queryByRole('button', { name: /edit samir patel/i }),
    ).not.toBeInTheDocument();
  });
});
