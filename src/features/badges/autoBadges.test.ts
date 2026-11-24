import { describe, expect, it } from 'vitest';
import type { EventSnapshot, Leg, Participant, SupplyClaim, SupplyItem, Team } from '../../types/domain';
import {
  AUTO_BADGE_CATALOG,
  evaluateAutoBadges,
  resolveOrganizerBadgeAwards,
} from './autoBadges';

function makeTeam(overrides: Partial<Team> & { id: string; name: string }): Team {
  return {
    eventId: 'evt-1',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
    createdAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeParticipant(
  overrides: Partial<Participant> & { id: string; displayName: string },
): Participant {
  return {
    eventId: 'evt-1',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
    createdAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLeg(
  overrides: Partial<Leg> & { id: string; teamId: string; roundNumber: number },
): Leg {
  return {
    eventId: 'evt-1',
    runnerId: null,
    courseId: 'course-1',
    status: 'scheduled',
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    externalActivityUrl: null,
    clientUpdatedAt: '2027-01-09T13:00:00.000Z',
    lastMutationId: null,
    updatedByOrganizer: false,
    ...overrides,
  };
}

function makeSnapshot(partial?: {
  teams?: Team[];
  participants?: Participant[];
  legs?: Leg[];
  supplyItems?: SupplyItem[];
  supplyClaims?: SupplyClaim[];
}): EventSnapshot {
  return {
    event: {
      id: 'evt-1',
      slug: '2027',
      name: 'Winter Grind 50K 2027',
      eventDate: '2027-01-09',
      startTime: '2027-01-09T13:00:00.000Z',
      timezone: 'America/New_York',
      isActive: true,
      basecampName: 'Lakeside Warming Pavilion',
      basecampAddress: null,
      basecampMapsUrl: null,
      parkingAmenitiesNotes: null,
      coldWeatherTips: null,
      safetyFirstAidNotes: null,
      stravaClubUrl: null,
      recapNote: null,
      chipInTargetCents: 0,
      chipInSuggestedCents: null,
      chipInBreakdown: [],
      venmoHandle: null,
      zelleHandle: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    },
    courses: [],
    announcements: [],
    rounds: [],
    teams: partial?.teams ?? [],
    participants: partial?.participants ?? [],
    legs: partial?.legs ?? [],
    supplyItems: partial?.supplyItems ?? [],
    supplyClaims: partial?.supplyClaims ?? [],
    badgeDefinitions: [],
    badgeAwards: [],
    chipInTotalCents: 0,
    chipIns: [],
  };
}

describe('evaluateAutoBadges — Team auto-calculated Badges', () => {
  it('defines all 10 canonical auto-calculated Badges (3 Team, 7 Participant)', () => {
    expect(AUTO_BADGE_CATALOG).toHaveLength(10);
    expect(AUTO_BADGE_CATALOG.filter((b) => b.scope === 'team').map((b) => b.name)).toEqual([
      'Halfway There',
      '50K Finisher',
      'Full Squad',
    ]);
    expect(AUTO_BADGE_CATALOG.filter((b) => b.scope === 'participant').map((b) => b.name)).toEqual([
      'First 5K Club',
      'Dawn Patrol',
      'Anchor Leg',
      'Back-to-Back',
      'Distance Machine',
      'Course Explorer',
      'Basecamp Hero',
    ]);
  });

  it('awards Halfway There at >=5 completed Legs, 50K Finisher at 10/10, and immediately removes Badges on Leg revert', () => {
    const team = makeTeam({ id: 't1', name: 'Frostbite Fighters' });
    const runner = makeParticipant({ id: 'p1', displayName: 'Maya Chen', teamId: 't1' });

    // 4 completed + 1 out_on_course -> NOT Halfway There yet
    const fourCompleted = [1, 2, 3, 4].map((r) =>
      makeLeg({ id: `l${r}`, teamId: 't1', roundNumber: r, runnerId: 'p1', status: 'completed' }),
    );
    const fiveOut = makeLeg({
      id: 'l5',
      teamId: 't1',
      roundNumber: 5,
      runnerId: 'p1',
      status: 'out_on_course',
    });

    const eval4 = evaluateAutoBadges(
      makeSnapshot({ teams: [team], participants: [runner], legs: [...fourCompleted, fiveOut] }),
    );
    expect(eval4.byTeamId['t1'].map((b) => b.id)).not.toContain('halfway_there');
    expect(eval4.byTeamId['t1'].map((b) => b.id)).not.toContain('50k_finisher');

    // Complete Round 5 -> unlocks Halfway There (not 50K Finisher)
    const fiveCompleted = [
      ...fourCompleted,
      { ...fiveOut, status: 'completed' as const },
    ];
    const eval5 = evaluateAutoBadges(
      makeSnapshot({ teams: [team], participants: [runner], legs: fiveCompleted }),
    );
    expect(eval5.byTeamId['t1'].map((b) => b.id)).toContain('halfway_there');
    expect(eval5.byTeamId['t1'].map((b) => b.id)).not.toContain('50k_finisher');

    // Revert Round 5 back to out_on_course -> Halfway There immediately removed
    const evalReverted = evaluateAutoBadges(
      makeSnapshot({ teams: [team], participants: [runner], legs: [...fourCompleted, fiveOut] }),
    );
    expect(evalReverted.byTeamId['t1'].map((b) => b.id)).not.toContain('halfway_there');

    // Complete all 10 Rounds -> unlocks BOTH Halfway There and 50K Finisher
    const tenCompleted = Array.from({ length: 10 }, (_, idx) =>
      makeLeg({
        id: `l${idx + 1}`,
        teamId: 't1',
        roundNumber: idx + 1,
        runnerId: 'p1',
        status: 'completed',
      }),
    );
    const eval10 = evaluateAutoBadges(
      makeSnapshot({ teams: [team], participants: [runner], legs: tenCompleted }),
    );
    expect(eval10.byTeamId['t1'].map((b) => b.id)).toContain('halfway_there');
    expect(eval10.byTeamId['t1'].map((b) => b.id)).toContain('50k_finisher');

    // Revert Round 10 -> 50K Finisher removed, Halfway There remains
    const nineCompleted = tenCompleted.map((leg) =>
      leg.roundNumber === 10 ? { ...leg, status: 'scheduled' as const } : leg,
    );
    const eval9 = evaluateAutoBadges(
      makeSnapshot({ teams: [team], participants: [runner], legs: nineCompleted }),
    );
    expect(eval9.byTeamId['t1'].map((b) => b.id)).toContain('halfway_there');
    expect(eval9.byTeamId['t1'].map((b) => b.id)).not.toContain('50k_finisher');
  });

  it('awards Full Squad only when Team has >=1 current Runner and EVERY current Runner on the Team has >=1 completed Leg (empty Teams never earn it)', () => {
    const emptyTeam = makeTeam({ id: 't-empty', name: 'Ghost Team' });
    const activeTeam = makeTeam({ id: 't-active', name: 'Snow Patrol' });
    const maya = makeParticipant({ id: 'p1', displayName: 'Maya Chen', teamId: 't-active' });
    const alex = makeParticipant({ id: 'p2', displayName: 'Alex Rivera', teamId: 't-active' });

    // Empty team even with a preserved completed Leg must NEVER earn Full Squad
    const preservedLeg = makeLeg({
      id: 'l-ghost-1',
      teamId: 't-empty',
      roundNumber: 1,
      runnerId: 'former-runner',
      status: 'completed',
    });

    // Active team: only Maya finished, Alex is still out_on_course -> NOT Full Squad
    const mayaDone = makeLeg({
      id: 'l-a-1',
      teamId: 't-active',
      roundNumber: 1,
      runnerId: 'p1',
      status: 'completed',
    });
    const alexOut = makeLeg({
      id: 'l-a-2',
      teamId: 't-active',
      roundNumber: 2,
      runnerId: 'p2',
      status: 'out_on_course',
    });

    const evalPartial = evaluateAutoBadges(
      makeSnapshot({
        teams: [emptyTeam, activeTeam],
        participants: [maya, alex],
        legs: [preservedLeg, mayaDone, alexOut],
      }),
    );
    expect(evalPartial.byTeamId['t-empty'].map((b) => b.id)).not.toContain('full_squad');
    expect(evalPartial.byTeamId['t-active'].map((b) => b.id)).not.toContain('full_squad');

    // Alex finishes Round 2 -> activeTeam earns Full Squad, emptyTeam still does NOT
    const evalFull = evaluateAutoBadges(
      makeSnapshot({
        teams: [emptyTeam, activeTeam],
        participants: [maya, alex],
        legs: [preservedLeg, mayaDone, { ...alexOut, status: 'completed' }],
      }),
    );
    expect(evalFull.byTeamId['t-empty'].map((b) => b.id)).not.toContain('full_squad');
    expect(evalFull.byTeamId['t-active'].map((b) => b.id)).toContain('full_squad');
  });
});

describe('evaluateAutoBadges — Participant auto-calculated Badges', () => {
  it('awards First 5K Club, Dawn Patrol, and Anchor Leg only on completed Legs and removes them on revert', () => {
    const team = makeTeam({ id: 't1', name: 'Frostbite Fighters' });
    const firstTimer = makeParticipant({
      id: 'p1',
      displayName: 'Maya Chen',
      teamId: 't1',
      isFirst5k: true,
    });
    const veteran = makeParticipant({
      id: 'p2',
      displayName: 'Alex Rivera',
      teamId: 't1',
      isFirst5k: false,
    });

    // Scheduled / out_on_course Legs earn nothing
    const beforeFinish = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [firstTimer, veteran],
        legs: [
          makeLeg({ id: 'l1', teamId: 't1', roundNumber: 1, runnerId: 'p1', status: 'out_on_course' }),
          makeLeg({ id: 'l10', teamId: 't1', roundNumber: 10, runnerId: 'p2', status: 'scheduled' }),
        ],
      }),
    );
    expect(beforeFinish.byParticipantId['p1']).toEqual([]);
    expect(beforeFinish.byParticipantId['p2']).toEqual([]);

    // Maya completes Round 1 -> earns First 5K Club + Dawn Patrol
    // Alex completes Round 10 -> earns Anchor Leg (NOT First 5K Club)
    const afterFinish = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [firstTimer, veteran],
        legs: [
          makeLeg({ id: 'l1', teamId: 't1', roundNumber: 1, runnerId: 'p1', status: 'completed' }),
          makeLeg({ id: 'l10', teamId: 't1', roundNumber: 10, runnerId: 'p2', status: 'completed' }),
        ],
      }),
    );
    expect(afterFinish.byParticipantId['p1'].map((b) => b.id)).toEqual([
      'first_5k_club',
      'dawn_patrol',
    ]);
    expect(afterFinish.byParticipantId['p2'].map((b) => b.id)).toEqual(['anchor_leg']);

    // Revert Maya's Round 1 back to out_on_course -> both Badges immediately disappear
    const afterRevert = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [firstTimer, veteran],
        legs: [
          makeLeg({ id: 'l1', teamId: 't1', roundNumber: 1, runnerId: 'p1', status: 'out_on_course' }),
          makeLeg({ id: 'l10', teamId: 't1', roundNumber: 10, runnerId: 'p2', status: 'completed' }),
        ],
      }),
    );
    expect(afterRevert.byParticipantId['p1']).toEqual([]);
  });

  it('awards Back-to-Back only for consecutive completed Rounds and Distance Machine at >=3 completed Legs', () => {
    const team = makeTeam({ id: 't1', name: 'Cold Brew Crew' });
    const runner = makeParticipant({ id: 'p1', displayName: 'Samir Patel', teamId: 't1' });

    // Rounds 2 and 4 (non-consecutive) -> neither Back-to-Back nor Distance Machine
    const nonConsecutive = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [runner],
        legs: [
          makeLeg({ id: 'l2', teamId: 't1', roundNumber: 2, runnerId: 'p1', status: 'completed' }),
          makeLeg({ id: 'l4', teamId: 't1', roundNumber: 4, runnerId: 'p1', status: 'completed' }),
          makeLeg({ id: 'l5', teamId: 't1', roundNumber: 5, runnerId: 'p1', status: 'out_on_course' }),
        ],
      }),
    );
    expect(nonConsecutive.byParticipantId['p1'].map((b) => b.id)).not.toContain('back_to_back');
    expect(nonConsecutive.byParticipantId['p1'].map((b) => b.id)).not.toContain('distance_machine');

    // Complete Round 5 -> Rounds 4 & 5 are consecutive + 3 total completed Legs!
    const unlocked = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [runner],
        legs: [
          makeLeg({ id: 'l2', teamId: 't1', roundNumber: 2, runnerId: 'p1', status: 'completed' }),
          makeLeg({ id: 'l4', teamId: 't1', roundNumber: 4, runnerId: 'p1', status: 'completed' }),
          makeLeg({ id: 'l5', teamId: 't1', roundNumber: 5, runnerId: 'p1', status: 'completed' }),
        ],
      }),
    );
    expect(unlocked.byParticipantId['p1'].map((b) => b.id)).toContain('back_to_back');
    expect(unlocked.byParticipantId['p1'].map((b) => b.id)).toContain('distance_machine');
  });

  it('awards Course Explorer only for >=2 distinct non-null courseIds (strictly excluding null courseId)', () => {
    const team = makeTeam({ id: 't1', name: 'Snow Patrol' });
    const runner = makeParticipant({ id: 'p1', displayName: 'Jordan Lee', teamId: 't1' });

    // 1 real courseId + 2 null courseIds -> only 1 distinct non-null courseId -> NOT Course Explorer
    const withNullCourses = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [runner],
        legs: [
          makeLeg({
            id: 'l2',
            teamId: 't1',
            roundNumber: 2,
            runnerId: 'p1',
            courseId: 'course-a',
            status: 'completed',
          }),
          makeLeg({
            id: 'l4',
            teamId: 't1',
            roundNumber: 4,
            runnerId: 'p1',
            courseId: null,
            status: 'completed',
          }),
          makeLeg({
            id: 'l6',
            teamId: 't1',
            roundNumber: 6,
            runnerId: 'p1',
            courseId: null,
            status: 'completed',
          }),
        ],
      }),
    );
    expect(withNullCourses.byParticipantId['p1'].map((b) => b.id)).not.toContain('course_explorer');

    // 2 Legs on same courseId -> still only 1 distinct courseId -> NOT Course Explorer
    const sameCourse = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [runner],
        legs: [
          makeLeg({
            id: 'l2',
            teamId: 't1',
            roundNumber: 2,
            runnerId: 'p1',
            courseId: 'course-a',
            status: 'completed',
          }),
          makeLeg({
            id: 'l4',
            teamId: 't1',
            roundNumber: 4,
            runnerId: 'p1',
            courseId: 'course-a',
            status: 'completed',
          }),
        ],
      }),
    );
    expect(sameCourse.byParticipantId['p1'].map((b) => b.id)).not.toContain('course_explorer');

    // 2 distinct non-null courseIds -> earns Course Explorer
    const twoCourses = evaluateAutoBadges(
      makeSnapshot({
        teams: [team],
        participants: [runner],
        legs: [
          makeLeg({
            id: 'l2',
            teamId: 't1',
            roundNumber: 2,
            runnerId: 'p1',
            courseId: 'course-a',
            status: 'completed',
          }),
          makeLeg({
            id: 'l4',
            teamId: 't1',
            roundNumber: 4,
            runnerId: 'p1',
            courseId: 'course-b',
            status: 'completed',
          }),
        ],
      }),
    );
    expect(twoCourses.byParticipantId['p1'].map((b) => b.id)).toContain('course_explorer');
  });

  it('awards Basecamp Hero for >=1 active supply_claims row OR a volunteered supply_items entry (isWishlist = false), excluding Organizer wishlist creations', () => {
    const claimer = makeParticipant({
      id: 'p-claim',
      displayName: 'Riley Brooks',
      rsvpStatus: 'going_supporter',
    });
    const volunteer = makeParticipant({
      id: 'p-vol',
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
    });
    const wishlistCreator = makeParticipant({
      id: 'p-org',
      displayName: 'Host Pat',
      rsvpStatus: 'going_supporter',
    });
    const nobody = makeParticipant({
      id: 'p-none',
      displayName: 'Alex Rivera',
      rsvpStatus: 'going_runner',
    });

    const wishlistItem: SupplyItem = {
      id: 'sup-wish',
      eventId: 'evt-1',
      category: 'drinks',
      name: 'Hot Cocoa',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: wishlistCreator.id,
      createdAt: '2027-01-01T00:00:00.000Z',
    };
    const volunteeredItem: SupplyItem = {
      id: 'sup-vol',
      eventId: 'evt-1',
      category: 'food',
      name: 'Banana Bread',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: volunteer.id,
      createdAt: '2027-01-01T00:00:00.000Z',
    };
    const claim: SupplyClaim = {
      id: 'claim-1',
      eventId: 'evt-1',
      supplyItemId: wishlistItem.id,
      participantId: claimer.id,
      note: '2 thermoses',
      createdAt: '2027-01-02T00:00:00.000Z',
    };

    const result = evaluateAutoBadges(
      makeSnapshot({
        participants: [claimer, volunteer, wishlistCreator, nobody],
        supplyItems: [wishlistItem, volunteeredItem],
        supplyClaims: [claim],
      }),
    );

    expect(result.byParticipantId[claimer.id].map((b) => b.id)).toEqual(['basecamp_hero']);
    expect(result.byParticipantId[volunteer.id].map((b) => b.id)).toEqual(['basecamp_hero']);
    // Creating an Organizer wish-list item (isWishlist = true) does NOT earn Basecamp Hero
    expect(result.byParticipantId[wishlistCreator.id]).toEqual([]);
    expect(result.byParticipantId[nobody.id]).toEqual([]);

    // Removing the claim removes Basecamp Hero reactively
    const afterUnclaim = evaluateAutoBadges(
      makeSnapshot({
        participants: [claimer, volunteer, wishlistCreator, nobody],
        supplyItems: [wishlistItem, volunteeredItem],
        supplyClaims: [],
      }),
    );
    expect(afterUnclaim.byParticipantId[claimer.id]).toEqual([]);
    expect(afterUnclaim.byParticipantId[volunteer.id].map((b) => b.id)).toEqual(['basecamp_hero']);
  });

  it('resolves Organizer badge awards newest-first and skips orphaned or non-XOR records safely', () => {
    const team = makeTeam({ id: 't1', name: 'Frostbite Fighters', emoji: '❄️' });
    const participant = makeParticipant({ id: 'p1', displayName: 'Maya Chen', teamId: 't1' });
    const def = {
      id: 'def-1',
      eventId: 'evt-1',
      name: 'Best Vibes at Basecamp',
      emoji: '🔥',
      description: 'Warmest vibes',
      isPreset: true,
    };

    const resolved = resolveOrganizerBadgeAwards({
      teams: [team],
      participants: [participant],
      badgeDefinitions: [def],
      badgeAwards: [
        {
          id: 'aw-old',
          eventId: 'evt-1',
          badgeDefinitionId: def.id,
          participantId: participant.id,
          teamId: null,
          note: 'First award',
          awardedAt: '2027-01-09T14:00:00.000Z',
        },
        {
          id: 'aw-new',
          eventId: 'evt-1',
          badgeDefinitionId: def.id,
          participantId: null,
          teamId: team.id,
          note: 'Newer team award',
          awardedAt: '2027-01-09T16:00:00.000Z',
        },
        {
          id: 'aw-malformed-both',
          eventId: 'evt-1',
          badgeDefinitionId: def.id,
          participantId: participant.id,
          teamId: team.id,
          note: null,
          awardedAt: '2027-01-09T17:00:00.000Z',
        },
      ],
    });

    expect(resolved.map((r) => r.award.id)).toEqual(['aw-new', 'aw-old']);
    expect(resolved[0].recipientType).toBe('team');
    expect(resolved[0].recipientName).toBe('Frostbite Fighters');
    expect(resolved[1].recipientType).toBe('participant');
    expect(resolved[1].recipientName).toBe('Maya Chen');
  });
});
