import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { formatEventRecapText, formatMyRunSummaryText } from './recapFormatters';

async function createRecapFormatterFixture() {
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

  await organizerApi.updateEvent(eventId, {
    recapNote: 'What a crisp winter day at Basecamp — thank you all for bringing the warmth!',
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

  // Out of alphabetical order intentionally
  const snowPatrol = await api.createTeam(eventId, {
    name: 'Snow Patrol',
    tagline: null,
    colorHex: '#157A4B',
    emoji: '🎿',
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

  // Samir: opted IN, runs 2 timed Legs across 2 Courses (R1 + R2)
  const samir = await api.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_runner',
    teamId: coldBrew.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 25,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: true,
  });

  // Maya: opted OUT, completes all 10 Rounds for Snow Patrol with a recorded 21:05 time on R1
  // (her time must NEVER appear in Event Recap and must be omitted in default My Run Summary)
  const maya = await api.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: snowPatrol.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: true,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Alex: Runner with 0 completed Legs
  const alex = await api.createParticipant(eventId, {
    displayName: 'Alex Rivera',
    rsvpStatus: 'going_runner',
    teamId: coldBrew.id,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  // Riley: Supporter who brings a Supply and wins Cheer Squad MVP
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
    name: 'Hot Apple Cider',
    isWishlist: false,
    targetSlots: null,
    createdByParticipantId: riley.id,
  });

  const snap = await api.getEventSnapshot(eventId);
  const legFor = (teamId: string, roundNumber: number) =>
    snap.legs.find((l) => l.teamId === teamId && l.roundNumber === roundNumber)!;

  // Snow Patrol finishes all 10 Rounds (50K Finisher!)
  for (let round = 1; round <= 10; round += 1) {
    await api.updateLeg(eventId, legFor(snowPatrol.id, round).id, {
      runnerId: maya.id,
      status: 'completed',
      durationSeconds: round === 1 ? 1265 : null, // 21:05 private on R1
      courseId: boardwalk.id,
    });
  }

  // Cold Brew Crew finishes 2 Rounds with Samir (R1 Boardwalk 22:00, R2 Lake Loop 24:00)
  await api.updateLeg(eventId, legFor(coldBrew.id, 1).id, {
    runnerId: samir.id,
    status: 'completed',
    durationSeconds: 1320, // 22:00
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, legFor(coldBrew.id, 2).id, {
    runnerId: samir.id,
    status: 'completed',
    durationSeconds: 1440, // 24:00
    courseId: lakeLoop.id,
  });

  const cheerDef = snap.badgeDefinitions.find((d) => d.name === 'Cheer Squad MVP')!;
  await organizerApi.createBadgeAward(eventId, {
    badgeDefinitionId: cheerDef.id,
    participantId: riley.id,
    teamId: null,
    note: 'Kept the cowbells ringing all day!',
  });

  const freshSnapshot = await api.getEventSnapshot(eventId);
  return { snapshot: freshSnapshot, samir, maya, alex, riley };
}

describe('recapFormatters', () => {
  it('formats Event Recap with Event name/date, Organizer recap note, collective km, alphabetical Teams, Badges & superlatives without exposing private times', async () => {
    const { snapshot } = await createRecapFormatterFixture();
    const text = formatEventRecapText(snapshot);

    expect(text).toContain('Winter Grind 50K 2027');
    expect(text).toContain('January 9, 2027');
    expect(text).toContain(
      'What a crisp winter day at Basecamp — thank you all for bringing the warmth!',
    );
    expect(text).toContain('60 km');
    expect(text).toContain('12 completed Legs');

    // Alphabetical Team order: Cold Brew Crew before Snow Patrol
    const coldBrewIdx = text.indexOf('Cold Brew Crew');
    const snowPatrolIdx = text.indexOf('Snow Patrol');
    expect(coldBrewIdx).toBeGreaterThan(-1);
    expect(snowPatrolIdx).toBeGreaterThan(coldBrewIdx);
    expect(text).toContain('10 / 50 km');
    expect(text).toContain('50 / 50 km');
    expect(text).toContain('50K Finisher');

    // Organizer superlatives & auto-Badges included
    expect(text).toContain('Cheer Squad MVP');
    expect(text).toContain('Riley Brooks');
    expect(text).toContain('Kept the cowbells ringing all day!');
    expect(text).toContain('Dawn Patrol');
    expect(text).toContain('Course Explorer');
    expect(text).toContain('Basecamp Hero');

    // Privacy: private time 21:05 never appears in Event Recap
    expect(text).not.toContain('21:05');
  });

  it('formats My Run Summary for an opted-in Runner with multiple timed Legs, Courses, Team, and Badges', async () => {
    const { snapshot, samir } = await createRecapFormatterFixture();
    const text = formatMyRunSummaryText(snapshot, samir);

    expect(text).toContain('Winter Grind 50K 2027');
    expect(text).toContain('Samir Patel');
    expect(text).toContain('Cold Brew Crew');
    expect(text).toContain('2 Legs');
    expect(text).toContain('10 km');
    expect(text).toContain('Boardwalk 5K');
    expect(text).toContain('Lake Loop 5K');
    // Opted in -> includes his fastest & average 5K times
    expect(text).toContain('22:00');
    expect(text).toContain('23:00');
    // Earned auto-Badges
    expect(text).toContain('Dawn Patrol');
    expect(text).toContain('Back-to-Back');
    expect(text).toContain('Course Explorer');
    // Never leaks Maya's private time
    expect(text).not.toContain('21:05');
  });

  it('omits individual times by default for an opted-out Runner and allows explicitly including their own times', async () => {
    const { snapshot, maya } = await createRecapFormatterFixture();

    const defaultSummary = formatMyRunSummaryText(snapshot, maya);
    expect(defaultSummary).toContain('Maya Chen');
    expect(defaultSummary).toContain('Snow Patrol');
    expect(defaultSummary).toContain('10 Legs');
    expect(defaultSummary).toContain('50 km');
    expect(defaultSummary).toContain('Boardwalk 5K');
    expect(defaultSummary).toContain('First 5K Club');
    expect(defaultSummary).toContain('50K Finisher');
    expect(defaultSummary).not.toContain('21:05');

    const withOwnTimes = formatMyRunSummaryText(snapshot, maya, { includeTimes: true });
    expect(withOwnTimes).toContain('21:05');
  });

  it('handles a Runner with 0 completed Legs and a Supporter gracefully', async () => {
    const { snapshot, alex, riley } = await createRecapFormatterFixture();

    const zeroLegRunnerSummary = formatMyRunSummaryText(snapshot, alex);
    expect(zeroLegRunnerSummary).toContain('Alex Rivera');
    expect(zeroLegRunnerSummary).toContain('Cold Brew Crew');
    expect(zeroLegRunnerSummary).toContain('0 Legs');
    expect(zeroLegRunnerSummary).not.toContain('NaN');

    const supporterSummary = formatMyRunSummaryText(snapshot, riley);
    expect(supporterSummary).toContain('Riley Brooks');
    expect(supporterSummary).toContain('Supporter');
    expect(supporterSummary).toContain('Hot Apple Cider');
    expect(supporterSummary).toContain('Basecamp Hero');
    expect(supporterSummary).toContain('Cheer Squad MVP');
    expect(supporterSummary).not.toContain('21:05');
    expect(supporterSummary).not.toContain('22:00');
  });
});
