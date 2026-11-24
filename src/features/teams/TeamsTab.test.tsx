import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { saveParticipantId } from '../participant/participantStorage';

async function createTeamsTestFixture() {
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

  const primaryCourse = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: 'Flat waterfront loop',
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const altCourse = await organizerApi.upsertCourse(eventId, {
    name: 'Pine Ridge 5K',
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

  // Create two Teams out of alphabetical order
  const zephyrTeam = await api.createTeam(eventId, {
    name: 'Zephyr Striders',
    tagline: 'Easy miles together',
    colorHex: '#157A4B',
    emoji: '🦊',
    isOpen: false,
    lookingNote: null,
  });

  const arcticTeam = await api.createTeam(eventId, {
    name: 'Arctic Pace',
    tagline: 'Warm cocoa after every 5K',
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: 'Looking for midday Runners',
  });

  // Participants
  const alex = await api.createParticipant(eventId, {
    displayName: 'Alex Rivera',
    rsvpStatus: 'going_runner',
    teamId: arcticTeam.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 27,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 3,
    availableToRound: 7,
    rough5kMinutes: 29,
    isFirst5k: true,
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

  const elena = await api.createParticipant(eventId, {
    displayName: 'Elena Cruz',
    rsvpStatus: 'maybe',
    teamId: null,
    availableFromRound: 2,
    availableToRound: 6,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Cover 8 of 10 Rounds on Arctic Pace, leaving Rounds 4 & 7 open
  const snap = await api.getEventSnapshot(eventId);
  for (const leg of snap.legs) {
    if (leg.teamId === arcticTeam.id && leg.roundNumber !== 4 && leg.roundNumber !== 7) {
      await api.updateLeg(eventId, leg.id, { runnerId: alex.id });
    }
  }

  return {
    store,
    api,
    organizerApi,
    eventId,
    primaryCourse,
    altCourse,
    arcticTeam,
    zephyrTeam,
    alex,
    maya,
    samir,
    elena,
  };
}

describe('Teams tab — Overview, Free Agents, Team creation/join/leave, and 10-Round Schedule Builder', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/e/2027');
  });

  it('lists Teams alphabetically with Open/Closed badges, coverage progress, explicit uncovered Round chips, and Free Agents details', async () => {
    const { api, eventId, maya } = await createTeamsTestFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);

    // Navigate to Teams tab
    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    // Teams listed alphabetically: Arctic Pace before Zephyr Striders
    const teamsRegion = await screen.findByRole('region', { name: /relay teams/i });
    const teamHeadings = within(teamsRegion).getAllByRole('heading', { level: 3 });
    expect(teamHeadings.map((h) => h.textContent)).toEqual([
      expect.stringContaining('Arctic Pace'),
      expect.stringContaining('Zephyr Striders'),
    ]);

    // Arctic Pace card shows emoji, tagline, Open badge, 8 of 10 Rounds covered, and "Rounds 4 & 7 open"
    const arcticCard = teamHeadings[0].closest('article')!;
    expect(arcticCard).toHaveTextContent('❄️');
    expect(arcticCard).toHaveTextContent('Warm cocoa after every 5K');
    expect(within(arcticCard).getByText('Open')).toBeInTheDocument();
    expect(arcticCard).toHaveTextContent(/8 of 10 Rounds covered/i);
    expect(arcticCard).toHaveTextContent(/Rounds 4 & 7 open/i);
    expect(within(arcticCard).getByText('R4')).toBeInTheDocument();
    expect(within(arcticCard).getByText('R7')).toBeInTheDocument();

    // Zephyr Striders card shows Closed badge and cannot be joined by regular Runner
    const zephyrCard = teamHeadings[1].closest('article')!;
    expect(zephyrCard).toHaveTextContent('🦊');
    expect(within(zephyrCard).getByText('Closed')).toBeInTheDocument();
    expect(zephyrCard).toHaveTextContent(/0 of 10 Rounds covered/i);
    expect(within(zephyrCard).queryByRole('button', { name: /join team/i })).not.toBeInTheDocument();

    // Free Agents section lists only unmatched Going (Runner) Participants with window, pace, and First 5K! tag
    const freeAgentsRegion = screen.getByRole('region', { name: /free agents/i });
    expect(freeAgentsRegion).toHaveTextContent('Maya Chen');
    expect(freeAgentsRegion).toHaveTextContent(/Rounds 3–7/i);
    expect(freeAgentsRegion).toHaveTextContent(/~29 min 5K/i);
    expect(freeAgentsRegion).toHaveTextContent(/First 5K!/i);
    // Alex is already on a Team, Samir is a Supporter, Elena is Maybe -> none in Free Agents
    expect(freeAgentsRegion).not.toHaveTextContent('Alex Rivera');
    expect(freeAgentsRegion).not.toHaveTextContent('Samir Patel');
    expect(freeAgentsRegion).not.toHaveTextContent('Elena Cruz');
  });

  it('prevents Supporters and non-Runner RSVPs from joining or creating Teams with warm, welcoming copy', async () => {
    const { api, eventId, samir } = await createTeamsTestFixture();
    saveParticipantId(eventId, samir.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);

    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    // Welcoming copy explains Teams are Runner-only and mentions switching RSVP on Home
    expect(await screen.findByText(/Going \(Supporter\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Teams are for Runners/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create a team/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join team/i })).not.toBeInTheDocument();
  });

  it('lets a Going (Runner) Free Agent create a Team without invite codes, seeds 10 primary-Course Legs, enforces one-Team-per-Runner, and confirms safe Leave Team', async () => {
    const { api, eventId, primaryCourse, maya } = await createTeamsTestFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);
    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    // Open Create Team form
    await user.click(await screen.findByRole('button', { name: /create a team/i }));
    await user.type(screen.getByLabelText(/team name/i), 'Boreal Striders');
    await user.type(screen.getByLabelText(/tagline/i), 'One 5K at a time');
    await user.type(screen.getByLabelText(/looking-for note/i), 'Need afternoon legs');
    await user.click(screen.getByRole('button', { name: /deep spruce/i }));
    await user.click(screen.getByRole('button', { name: /create team$/i }));

    // New Team appears in alphabetical list (between Arctic Pace and Zephyr Striders) and Maya is on it
    const teamsRegion = await screen.findByRole('region', { name: /relay teams/i });
    const teamHeadings = within(teamsRegion).getAllByRole('heading', { level: 3 });
    expect(teamHeadings.map((h) => h.textContent)).toEqual([
      expect.stringContaining('Arctic Pace'),
      expect.stringContaining('Boreal Striders'),
      expect.stringContaining('Zephyr Striders'),
    ]);

    // 10 Legs auto-seeded on Event's primary Course
    const snapAfterCreate = await api.getEventSnapshot(eventId);
    const borealTeam = snapAfterCreate.teams.find((t) => t.name === 'Boreal Striders')!;
    expect(borealTeam).toMatchObject({
      tagline: 'One 5K at a time',
      lookingNote: 'Need afternoon legs',
      colorHex: '#157A4B',
      isOpen: true,
    });
    const borealLegs = snapAfterCreate.legs.filter((l) => l.teamId === borealTeam.id);
    expect(borealLegs).toHaveLength(10);
    expect(borealLegs.every((l) => l.courseId === primaryCourse.id && l.status === 'scheduled')).toBe(
      true,
    );

    // Maya is no longer in Free Agents and one-Team-per-Runner blocks joining Arctic Pace
    const freeAgentsRegion = screen.getByRole('region', { name: /free agents/i });
    expect(freeAgentsRegion).not.toHaveTextContent('Maya Chen');
    const arcticCard = teamHeadings[0].closest('article')!;
    expect(within(arcticCard).queryByRole('button', { name: /join team/i })).not.toBeInTheDocument();

    // Clicking Leave Team shows confirmation explaining scheduled Legs unassigned & completed preserved
    const borealCard = teamHeadings[1].closest('article')!;
    await user.click(within(borealCard).getByRole('button', { name: /leave team/i }));
    const confirmBox = within(borealCard).getByRole('alert');
    expect(confirmBox).toHaveTextContent(/future scheduled Legs will be unassigned/i);
    expect(confirmBox).toHaveTextContent(/completed Legs stay preserved/i);

    // Confirming leaves Team -> Maya back in Free Agents & empty Team auto-deleted
    await user.click(within(borealCard).getByRole('button', { name: /confirm & leave team/i }));
    const snapAfterLeave = await api.getEventSnapshot(eventId);
    expect(snapAfterLeave.teams.find((t) => t.id === borealTeam.id)).toBeUndefined();
    expect(snapAfterLeave.participants.find((p) => p.id === maya.id)?.teamId).toBeNull();
    expect(screen.getByRole('region', { name: /free agents/i })).toHaveTextContent('Maya Chen');
  });

  it('lets a Free Agent one-tap join an Open Team', async () => {
    const { api, eventId, arcticTeam, maya } = await createTeamsTestFixture();
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);
    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    const teamsRegion = await screen.findByRole('region', { name: /relay teams/i });
    const arcticCard = within(teamsRegion).getByText(/Arctic Pace/).closest('article')!;
    await user.click(within(arcticCard).getByRole('button', { name: /join team/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Joined Arctic Pace/i);
    const snap = await api.getEventSnapshot(eventId);
    expect(snap.participants.find((p) => p.id === maya.id)?.teamId).toBe(arcticTeam.id);
    expect(screen.getByRole('region', { name: /free agents/i })).not.toHaveTextContent('Maya Chen');
  });

  it('opens the 10-Row Round Schedule Builder to claim, assign, swap, unassign Runners, pick Courses, and show calm non-blocking warnings', async () => {
    const { api, eventId, arcticTeam, altCourse, alex, maya } = await createTeamsTestFixture();
    // Put Maya onto Arctic Pace with Alex; Maya's RSVP window is Rounds 3–7
    await api.updateParticipant(eventId, maya.id, { teamId: arcticTeam.id });
    saveParticipantId(eventId, maya.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);
    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    // Open Arctic Pace schedule
    const teamsRegion = await screen.findByRole('region', { name: /relay teams/i });
    const arcticCard = within(teamsRegion).getByText(/Arctic Pace/).closest('article')!;
    await user.click(within(arcticCard).getByRole('button', { name: /open 10-round schedule/i }));

    // All 10 Rounds are rendered
    const scheduleRegion = await screen.findByRole('region', {
      name: /round 1–10 schedule builder/i,
    });
    for (let r = 1; r <= 10; r += 1) {
      expect(within(scheduleRegion).getByLabelText(`Round ${r} Runner`)).toBeInTheDocument();
      expect(within(scheduleRegion).getByLabelText(`Round ${r} Course`)).toBeInTheDocument();
    }

    // 1. One-tap Claim open Round 4 as Maya
    await user.click(within(scheduleRegion).getByRole('button', { name: /claim round 4/i }));
    expect(within(scheduleRegion).getByLabelText('Round 4 Runner')).toHaveValue(maya.id);

    // 2. Assign Maya to Round 2 (outside her Rounds 3–7 RSVP window) -> allowed + calm warning
    await user.selectOptions(within(scheduleRegion).getByLabelText('Round 2 Runner'), maya.id);
    expect(within(scheduleRegion).getByLabelText('Round 2 Runner')).toHaveValue(maya.id);
    const round2Row = within(scheduleRegion).getByLabelText('Round 2 Runner').closest('li')!;
    expect(round2Row).toHaveTextContent(/Rounds 3–7/i);

    // 3. Assign Maya to Round 5 (back-to-back with Round 4) -> allowed + calm warning
    await user.selectOptions(within(scheduleRegion).getByLabelText('Round 5 Runner'), maya.id);
    expect(within(scheduleRegion).getByLabelText('Round 5 Runner')).toHaveValue(maya.id);
    const round5Row = within(scheduleRegion).getByLabelText('Round 5 Runner').closest('li')!;
    expect(round5Row).toHaveTextContent(/Back-to-back with Round 4/i);

    // 4. Pick alternate Course on Round 4 -> persists to API
    await user.selectOptions(within(scheduleRegion).getByLabelText('Round 4 Course'), altCourse.id);
    expect(within(scheduleRegion).getByLabelText('Round 4 Course')).toHaveValue(altCourse.id);

    // 5. Swap Round 4 (Maya) with Round 1 (Alex)
    await user.click(within(scheduleRegion).getByRole('button', { name: /^swap round 4$/i }));
    await user.click(within(scheduleRegion).getByRole('button', { name: /^swap with round 1$/i }));
    expect(within(scheduleRegion).getByLabelText('Round 4 Runner')).toHaveValue(alex.id);
    expect(within(scheduleRegion).getByLabelText('Round 1 Runner')).toHaveValue(maya.id);

    // 6. Unassign Round 2 -> clears runnerId back to empty
    await user.click(within(scheduleRegion).getByRole('button', { name: /unassign round 2/i }));
    expect(within(scheduleRegion).getByLabelText('Round 2 Runner')).toHaveValue('');

    // Verify all mutations persisted cleanly in EventSnapshot
    const snap = await api.getEventSnapshot(eventId);
    const teamLeg = (round: number) =>
      snap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === round)!;
    expect(teamLeg(1).runnerId).toBe(maya.id);
    expect(teamLeg(2).runnerId).toBeNull();
    expect(teamLeg(4).runnerId).toBe(alex.id);
    expect(teamLeg(4).courseId).toBe(altCourse.id);
    expect(teamLeg(5).runnerId).toBe(maya.id);
  });

  it('displays the 10-Row Round Schedule Builder read-only for Supporters', async () => {
    const { api, eventId, samir } = await createTeamsTestFixture();
    saveParticipantId(eventId, samir.id);
    const user = userEvent.setup();

    render(<App eventApi={api} />);
    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    const teamsRegion = await screen.findByRole('region', { name: /relay teams/i });
    const arcticCard = within(teamsRegion).getByText(/Arctic Pace/).closest('article')!;
    await user.click(within(arcticCard).getByRole('button', { name: /open 10-round schedule/i }));

    const scheduleRegion = await screen.findByRole('region', {
      name: /round 1–10 schedule builder/i,
    });
    expect(within(scheduleRegion).getByText(/View-only schedule/i)).toBeInTheDocument();
    expect(within(scheduleRegion).queryByLabelText('Round 1 Runner')).not.toBeInTheDocument();
    expect(within(scheduleRegion).getByText('Round 1')).toBeInTheDocument();
    expect(within(scheduleRegion).getByText('Round 10')).toBeInTheDocument();
  });

  it('prevents Maybe RSVPs from joining or creating Teams with welcoming copy and lets teammates toggle Team Open/Closed settings', async () => {
    const { api, eventId, arcticTeam, alex, elena } = await createTeamsTestFixture();
    saveParticipantId(eventId, elena.id);
    const user = userEvent.setup();

    const { unmount } = render(<App eventApi={api} />);
    const nav = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav).getByRole('button', { name: /^teams$/i }));

    expect(await screen.findByText(/You're RSVP'd as Maybe/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create a team/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join team/i })).not.toBeInTheDocument();
    unmount();

    // Switch to Alex (on Arctic Pace) and toggle Arctic Pace from Open to Closed
    saveParticipantId(eventId, alex.id);
    render(<App eventApi={api} />);
    const nav2 = await screen.findByRole('navigation', { name: /^primary$/i });
    await user.click(within(nav2).getByRole('button', { name: /^teams$/i }));

    const teamsRegion = await screen.findByRole('region', { name: /relay teams/i });
    const arcticCard = within(teamsRegion).getByText(/Arctic Pace/).closest('article')!;
    await user.click(within(arcticCard).getByRole('button', { name: /open 10-round schedule/i }));

    await user.click(await screen.findByRole('button', { name: /team settings/i }));
    await user.click(screen.getByRole('radio', { name: /^closed$/i }));
    await user.click(screen.getByRole('button', { name: /save team details/i }));

    const snap = await api.getEventSnapshot(eventId);
    expect(snap.teams.find((t) => t.id === arcticTeam.id)?.isOpen).toBe(false);
  });
});
