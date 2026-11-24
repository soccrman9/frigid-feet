import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { saveParticipantId } from '../participant/participantStorage';

async function createOrganizerTeamsFixture() {
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
    description: 'Flat loop',
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const altCourse = await organizerApi.upsertCourse(eventId, {
    name: 'Pine Ridge 5K',
    description: 'Rolling hills',
    distanceKm: 5,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 1,
  });

  const arcticTeam = await organizerApi.createTeam(eventId, {
    name: 'Arctic Pace',
    tagline: 'Open Team',
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const closedTeam = await organizerApi.createTeam(eventId, {
    name: 'Glacier Closed',
    tagline: 'Closed roster',
    colorHex: '#157A4B',
    emoji: '🧊',
    isOpen: false,
    lookingNote: null,
  });

  // Organizer is a Supporter (not on any Team!)
  const hostSupporter = await organizerApi.createParticipant(eventId, {
    displayName: 'Samir Host',
    rsvpStatus: 'going_supporter',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const alex = await organizerApi.createParticipant(eventId, {
    displayName: 'Alex Rivera',
    rsvpStatus: 'going_runner',
    teamId: arcticTeam.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 26,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const devon = await organizerApi.createParticipant(eventId, {
    displayName: 'Devon Brooks',
    rsvpStatus: 'going_runner',
    teamId: arcticTeam.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const maya = await organizerApi.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 2,
    availableToRound: 8,
    rough5kMinutes: 29,
    isFirst5k: true,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const priya = await organizerApi.createParticipant(eventId, {
    displayName: 'Priya Nair',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 5,
    rough5kMinutes: 31,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  return {
    store,
    eventId,
    organizerApi,
    primaryCourse,
    altCourse,
    arcticTeam,
    closedTeam,
    hostSupporter,
    alex,
    devon,
    maya,
    priya,
  };
}

async function openTeamsTab(user: ReturnType<typeof userEvent.setup>) {
  const nav = await screen.findByRole('navigation', { name: /^primary$/i });
  await user.click(within(nav).getByRole('button', { name: /^teams$/i }));
  await screen.findByRole('heading', { name: /^teams$/i });
}

describe('Organizer Team Overrides — Free Agent assignment, Runner moves, Team creation & schedule editing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/e/2027');
  });

  it('lets an unlocked Organizer assign a Free Agent onto a Closed Team', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, closedTeam, hostSupporter, maya } =
      await createOrganizerTeamsFixture();

    saveParticipantId(eventId, hostSupporter.id);
    render(<App eventApi={organizerApi} />);
    await openTeamsTab(user);

    const freeAgentsRegion = screen.getByRole('region', { name: /free agents/i });
    const mayaSelect = within(freeAgentsRegion).getByLabelText(/assign maya chen to team/i);
    await user.selectOptions(mayaSelect, closedTeam.id);

    const mayaRow = mayaSelect.closest('li')!;
    const assignBtn = within(mayaRow).getByRole('button', { name: /^assign$/i });
    expect(assignBtn.className).toContain('min-h-[44px]');
    await user.click(assignBtn);

    expect(await screen.findByRole('status')).toHaveTextContent(/Maya Chen/i);
    expect(screen.getByRole('region', { name: /free agents/i })).not.toHaveTextContent('Maya Chen');

    const snap = await organizerApi.getEventSnapshot(eventId);
    expect(snap.participants.find((p) => p.id === maya.id)?.teamId).toBe(closedTeam.id);
  });

  it('moves a Runner between Teams using leave_team semantics: unassigns old scheduled Legs while preserving completed and out_on_course Legs', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, arcticTeam, closedTeam, hostSupporter, alex } =
      await createOrganizerTeamsFixture();

    // Seed 3 Legs for Alex on Arctic Pace: Round 1 completed, Round 2 out_on_course, Round 3 scheduled
    const initialSnap = await organizerApi.getEventSnapshot(eventId);
    const arcticLeg = (r: number) =>
      initialSnap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === r)!;

    await organizerApi.updateLeg(eventId, arcticLeg(1).id, {
      runnerId: alex.id,
      status: 'completed',
      startedAt: '2027-01-09T13:00:00.000Z',
      finishedAt: '2027-01-09T13:26:00.000Z',
      durationSeconds: 1560,
    });
    await organizerApi.updateLeg(eventId, arcticLeg(2).id, {
      runnerId: alex.id,
      status: 'out_on_course',
      startedAt: '2027-01-09T14:00:00.000Z',
    });
    await organizerApi.updateLeg(eventId, arcticLeg(3).id, {
      runnerId: alex.id,
      status: 'scheduled',
    });

    saveParticipantId(eventId, hostSupporter.id);
    render(<App eventApi={organizerApi} />);
    await openTeamsTab(user);

    const teamsRegion = screen.getByRole('region', { name: /relay teams/i });
    const arcticCard = within(teamsRegion).getByText(/Arctic Pace/).closest('article')!;

    // Move Alex Rivera from Arctic Pace to Glacier Closed
    const moveSelect = within(arcticCard).getByLabelText(/move alex rivera to/i);
    await user.selectOptions(moveSelect, closedTeam.id);
    const moveBtn = within(arcticCard).getByRole('button', { name: /move alex rivera/i });
    expect(moveBtn.className).toContain('min-h-[44px]');
    await user.click(moveBtn);

    expect(await screen.findByRole('status')).toHaveTextContent(/Moved Alex Rivera to Glacier Closed/i);

    // Verify leave_team semantics on persisted EventSnapshot
    const snap = await organizerApi.getEventSnapshot(eventId);
    expect(snap.participants.find((p) => p.id === alex.id)?.teamId).toBe(closedTeam.id);

    const r1 = snap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === 1)!;
    const r2 = snap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === 2)!;
    const r3 = snap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === 3)!;

    expect(r1.status).toBe('completed');
    expect(r1.runnerId).toBe(alex.id); // Preserved!
    expect(r2.status).toBe('out_on_course');
    expect(r2.runnerId).toBe(alex.id); // Preserved!
    expect(r3.status).toBe('scheduled');
    expect(r3.runnerId).toBeNull(); // Unassigned by leaveTeam!
  });

  it('lets an unlocked Organizer create a new Team on behalf of selected Free Agents without joining the Team themselves', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, primaryCourse, hostSupporter, maya, priya } =
      await createOrganizerTeamsFixture();

    saveParticipantId(eventId, hostSupporter.id);
    render(<App eventApi={organizerApi} />);
    await openTeamsTab(user);

    // Organizer (who is a Supporter) can still Create a Team
    await user.click(screen.getByRole('button', { name: /create a team/i }));
    await user.type(screen.getByLabelText(/team name/i), 'Snow Owls');
    await user.type(screen.getByLabelText(/tagline/i), 'Matched from Free Agents');

    // Select both Free Agents (Maya and Priya) to place onto the new Team
    await user.click(screen.getByRole('checkbox', { name: /Maya Chen/i }));
    await user.click(screen.getByRole('checkbox', { name: /Priya Nair/i }));

    await user.click(screen.getByRole('button', { name: /^create team$/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Snow Owls/i);

    const snap = await organizerApi.getEventSnapshot(eventId);
    const snowOwls = snap.teams.find((t) => t.name === 'Snow Owls')!;
    expect(snowOwls).toBeDefined();
    expect(snap.participants.find((p) => p.id === maya.id)?.teamId).toBe(snowOwls.id);
    expect(snap.participants.find((p) => p.id === priya.id)?.teamId).toBe(snowOwls.id);
    expect(snap.participants.find((p) => p.id === hostSupporter.id)?.teamId).toBeNull();

    // 10 Legs pre-seeded on primary Course
    const snowOwlsLegs = snap.legs.filter((l) => l.teamId === snowOwls.id);
    expect(snowOwlsLegs).toHaveLength(10);
    expect(snowOwlsLegs.every((l) => l.courseId === primaryCourse.id)).toBe(true);
  });

  it('lets an unlocked Organizer edit any Team 10-Round schedule and settings regardless of Team membership, and disables overrides offline', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, arcticTeam, altCourse, hostSupporter, alex, devon } =
      await createOrganizerTeamsFixture();

    saveParticipantId(eventId, hostSupporter.id);
    render(<App eventApi={organizerApi} />);
    await openTeamsTab(user);

    // Open Arctic Pace schedule even though hostSupporter is NOT on Arctic Pace
    const teamsRegion = screen.getByRole('region', { name: /relay teams/i });
    const arcticCard = within(teamsRegion).getByText(/Arctic Pace/).closest('article')!;
    await user.click(within(arcticCard).getByRole('button', { name: /open 10-round schedule/i }));

    const scheduleRegion = await screen.findByRole('region', {
      name: /round 1–10 schedule builder/i,
    });

    // Not read-only for Organizer!
    expect(within(scheduleRegion).queryByText(/View-only schedule/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Organizer Override/i)).toBeInTheDocument();

    // Assign Runners and switch Course
    await user.selectOptions(within(scheduleRegion).getByLabelText('Round 1 Runner'), alex.id);
    await user.selectOptions(within(scheduleRegion).getByLabelText('Round 2 Runner'), devon.id);
    await user.selectOptions(within(scheduleRegion).getByLabelText('Round 1 Course'), altCourse.id);

    const snap = await organizerApi.getEventSnapshot(eventId);
    expect(
      snap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === 1),
    ).toMatchObject({
      runnerId: alex.id,
      courseId: altCourse.id,
    });
    expect(
      snap.legs.find((l) => l.teamId === arcticTeam.id && l.roundNumber === 2)?.runnerId,
    ).toBe(devon.id);

    // Go offline -> schedule editing controls disabled
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(within(scheduleRegion).getByLabelText('Round 1 Runner')).toBeDisabled();
    expect(within(scheduleRegion).getByLabelText('Round 1 Course')).toBeDisabled();
    expect(within(scheduleRegion).getByText(/Requires connection/i)).toBeInTheDocument();
  });
});
