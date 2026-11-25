import type {
  BadgeAward,
  BadgeDefinition,
  EventSnapshot,
  Leg,
  Participant,
  SupplyClaim,
  SupplyItem,
  Team,
} from '../../types/domain';

export type AutoBadgeId =
  | 'halfway_there'
  | '50k_finisher'
  | 'full_squad'
  | 'first_5k_club'
  | 'dawn_patrol'
  | 'anchor_leg'
  | 'back_to_back'
  | 'distance_machine'
  | 'course_explorer'
  | 'basecamp_hero';

export type AutoBadgeScope = 'team' | 'participant';

export interface AutoBadgeDefinition {
  id: AutoBadgeId;
  scope: AutoBadgeScope;
  name: string;
  emoji: string;
  description: string;
}

export const AUTO_BADGE_CATALOG: ReadonlyArray<AutoBadgeDefinition> = [
  // Team Badges (3)
  {
    id: 'halfway_there',
    scope: 'team',
    name: 'Halfway There',
    emoji: '🏔️',
    description: 'Team completed at least 5 Legs (25K).',
  },
  {
    id: '50k_finisher',
    scope: 'team',
    name: '50K Finisher',
    emoji: '🏁',
    description: 'Team completed all 10 of 10 Legs (50K).',
  },
  {
    id: 'full_squad',
    scope: 'team',
    name: 'Full Squad',
    emoji: '🤝',
    description: 'Every Runner currently on the Team has completed at least 1 Leg.',
  },
  // Participant Badges (7)
  {
    id: 'first_5k_club',
    scope: 'participant',
    name: 'First 5K Club',
    emoji: '🌟',
    description: 'First-time 5K Runner who completed at least 1 Leg.',
  },
  {
    id: 'dawn_patrol',
    scope: 'participant',
    name: 'Dawn Patrol',
    emoji: '🌅',
    description: 'Completed a Round 1 Leg.',
  },
  {
    id: 'anchor_leg',
    scope: 'participant',
    name: 'Anchor Leg',
    emoji: '⚓',
    description: 'Completed a Round 10 Leg.',
  },
  {
    id: 'back_to_back',
    scope: 'participant',
    name: 'Back-to-Back',
    emoji: '🔁',
    description: 'Completed Legs in 2 consecutive Rounds.',
  },
  {
    id: 'distance_machine',
    scope: 'participant',
    name: 'Distance Machine',
    emoji: '⚡',
    description: 'Completed 3 or more 5K Legs.',
  },
  {
    id: 'course_explorer',
    scope: 'participant',
    name: 'Course Explorer',
    emoji: '🧭',
    description: 'Completed Legs across 2 or more distinct Courses.',
  },
  {
    id: 'basecamp_hero',
    scope: 'participant',
    name: 'Basecamp Hero',
    emoji: '🧤',
    description: 'Claimed or volunteered a Basecamp Supply.',
  },
];

const BADGE_BY_ID: Record<AutoBadgeId, AutoBadgeDefinition> = AUTO_BADGE_CATALOG.reduce(
  (acc, badge) => {
    acc[badge.id] = badge;
    return acc;
  },
  {} as Record<AutoBadgeId, AutoBadgeDefinition>,
);

export interface AutoBadgeInput {
  teams: ReadonlyArray<Team>;
  participants: ReadonlyArray<Participant>;
  legs: ReadonlyArray<Leg>;
  supplyItems: ReadonlyArray<SupplyItem>;
  supplyClaims: ReadonlyArray<SupplyClaim>;
}

export interface EarnedTeamBadge {
  badge: AutoBadgeDefinition;
  teamId: string;
  teamName: string;
  teamEmoji: string | null;
}

export interface EarnedParticipantBadge {
  badge: AutoBadgeDefinition;
  participantId: string;
  participantName: string;
}

export interface AutoBadgeEvaluation {
  teamBadges: EarnedTeamBadge[];
  participantBadges: EarnedParticipantBadge[];
  byTeamId: Record<string, AutoBadgeDefinition[]>;
  byParticipantId: Record<string, AutoBadgeDefinition[]>;
}

export interface ResolvedOrganizerBadgeAward {
  award: BadgeAward;
  definition: BadgeDefinition;
  recipientType: 'participant' | 'team';
  recipientId: string;
  recipientName: string;
  recipientEmoji: string | null;
}

export function evaluateAutoBadges(input: AutoBadgeInput): AutoBadgeEvaluation {
  const teamBadges: EarnedTeamBadge[] = [];
  const participantBadges: EarnedParticipantBadge[] = [];
  const byTeamId: Record<string, AutoBadgeDefinition[]> = {};
  const byParticipantId: Record<string, AutoBadgeDefinition[]> = {};

  const completedLegs = input.legs.filter((leg) => leg.status === 'completed');

  const completedLegsByTeam = new Map<string, Leg[]>();
  for (const leg of completedLegs) {
    const list = completedLegsByTeam.get(leg.teamId) ?? [];
    list.push(leg);
    completedLegsByTeam.set(leg.teamId, list);
  }

  const membersByTeam = new Map<string, Participant[]>();
  for (const participant of input.participants) {
    if (!participant.teamId) continue;
    const list = membersByTeam.get(participant.teamId) ?? [];
    list.push(participant);
    membersByTeam.set(participant.teamId, list);
  }

  const sortedTeams = [...input.teams].sort((a, b) => a.name.localeCompare(b.name));
  for (const team of sortedTeams) {
    const earned: AutoBadgeDefinition[] = [];
    const teamCompleted = completedLegsByTeam.get(team.id) ?? [];
    const completedCount = teamCompleted.length;
    const distinctCompletedRounds = new Set(teamCompleted.map((leg) => leg.roundNumber));

    if (completedCount >= 5) {
      earned.push(BADGE_BY_ID.halfway_there);
    }

    if (distinctCompletedRounds.size >= 10) {
      earned.push(BADGE_BY_ID['50k_finisher']);
    }

    const currentRunners = membersByTeam.get(team.id) ?? [];
    if (currentRunners.length >= 1) {
      const completedRunnerIds = new Set(
        teamCompleted.map((leg) => leg.runnerId).filter((id): id is string => id !== null),
      );
      if (currentRunners.every((runner) => completedRunnerIds.has(runner.id))) {
        earned.push(BADGE_BY_ID.full_squad);
      }
    }

    byTeamId[team.id] = earned;
    for (const badge of earned) {
      teamBadges.push({
        badge,
        teamId: team.id,
        teamName: team.name,
        teamEmoji: team.emoji,
      });
    }
  }

  const completedLegsByRunner = new Map<string, Leg[]>();
  for (const leg of completedLegs) {
    if (!leg.runnerId) continue;
    const list = completedLegsByRunner.get(leg.runnerId) ?? [];
    list.push(leg);
    completedLegsByRunner.set(leg.runnerId, list);
  }

  const basecampHeroIds = new Set<string>();
  for (const claim of input.supplyClaims) {
    basecampHeroIds.add(claim.participantId);
  }
  for (const item of input.supplyItems) {
    if (!item.isWishlist && item.createdByParticipantId) {
      basecampHeroIds.add(item.createdByParticipantId);
    }
  }

  const sortedParticipants = [...input.participants].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  for (const participant of sortedParticipants) {
    const earned: AutoBadgeDefinition[] = [];
    const runnerCompleted = completedLegsByRunner.get(participant.id) ?? [];
    const completedCount = runnerCompleted.length;

    const completedRounds = new Set(runnerCompleted.map((leg) => leg.roundNumber));
    const distinctCourses = new Set(
      runnerCompleted
        .map((leg) => leg.courseId)
        .filter((courseId): courseId is string => courseId !== null && courseId.trim() !== ''),
    );

    // 4. First 5K Club: isFirst5k = true AND >=1 completed Leg
    if (participant.isFirst5k && completedCount >= 1) {
      earned.push(BADGE_BY_ID.first_5k_club);
    }

    // 5. Dawn Patrol: completed a Round 1 Leg
    if (completedRounds.has(1)) {
      earned.push(BADGE_BY_ID.dawn_patrol);
    }

    // 6. Anchor Leg: completed a Round 10 Leg
    if (completedRounds.has(10)) {
      earned.push(BADGE_BY_ID.anchor_leg);
    }

    // 7. Back-to-Back: completed Legs in 2 consecutive Rounds (N and N+1)
    let hasBackToBack = false;
    for (const roundNum of completedRounds) {
      if (completedRounds.has(roundNum + 1)) {
        hasBackToBack = true;
        break;
      }
    }
    if (hasBackToBack) {
      earned.push(BADGE_BY_ID.back_to_back);
    }

    // 8. Distance Machine: completed >=3 Legs
    if (completedCount >= 3) {
      earned.push(BADGE_BY_ID.distance_machine);
    }

    // 9. Course Explorer: completed Legs across >=2 distinct non-null courseIds
    if (distinctCourses.size >= 2) {
      earned.push(BADGE_BY_ID.course_explorer);
    }

    // 10. Basecamp Hero: >=1 active supply_claims row OR created a volunteered supply_items entry (isWishlist = false)
    if (basecampHeroIds.has(participant.id)) {
      earned.push(BADGE_BY_ID.basecamp_hero);
    }

    byParticipantId[participant.id] = earned;
    for (const badge of earned) {
      participantBadges.push({
        badge,
        participantId: participant.id,
        participantName: participant.displayName,
      });
    }
  }

  return {
    teamBadges,
    participantBadges,
    byTeamId,
    byParticipantId,
  };
}

export function resolveOrganizerBadgeAwards(
  snapshot: Pick<EventSnapshot, 'badgeAwards' | 'badgeDefinitions' | 'participants' | 'teams'>,
): ResolvedOrganizerBadgeAward[] {
  const defById = new Map(snapshot.badgeDefinitions.map((d) => [d.id, d]));
  const participantById = new Map(snapshot.participants.map((p) => [p.id, p]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));

  const resolved: ResolvedOrganizerBadgeAward[] = [];
  for (const award of snapshot.badgeAwards) {
    const definition = defById.get(award.badgeDefinitionId);
    if (!definition) continue;

    if (award.participantId && !award.teamId) {
      const participant = participantById.get(award.participantId);
      if (!participant) continue;
      resolved.push({
        award,
        definition,
        recipientType: 'participant',
        recipientId: participant.id,
        recipientName: participant.displayName,
        recipientEmoji: null,
      });
    } else if (award.teamId && !award.participantId) {
      const team = teamById.get(award.teamId);
      if (!team) continue;
      resolved.push({
        award,
        definition,
        recipientType: 'team',
        recipientId: team.id,
        recipientName: team.name,
        recipientEmoji: team.emoji,
      });
    }
  }

  return resolved.sort((a, b) => b.award.awardedAt.localeCompare(a.award.awardedAt));
}

export interface EarnedBadgeGroup<T extends { badge: AutoBadgeDefinition }> {
  badge: AutoBadgeDefinition;
  earners: T[];
}

export function groupEarnedBadges<T extends { badge: AutoBadgeDefinition }>(
  scope: AutoBadgeScope,
  items: ReadonlyArray<T>,
): EarnedBadgeGroup<T>[] {
  const byBadgeId = new Map<string, T[]>();
  for (const item of items) {
    const list = byBadgeId.get(item.badge.id) ?? [];
    list.push(item);
    byBadgeId.set(item.badge.id, list);
  }
  return AUTO_BADGE_CATALOG.filter((b) => b.scope === scope)
    .map((badge) => ({
      badge,
      earners: byBadgeId.get(badge.id) ?? [],
    }))
    .filter((group) => group.earners.length > 0);
}
