import type { Course, Leg, Participant, Team } from '../../types/domain';

export type SpeedLeaderboardSort = 'fastest' | 'average';

export interface SpeedLeaderboardInput {
  participants: ReadonlyArray<Participant>;
  legs: ReadonlyArray<Leg>;
  teams: ReadonlyArray<Team>;
  courses: ReadonlyArray<Course>;
  sortBy?: SpeedLeaderboardSort;
}

export interface SpeedLeaderboardEntry {
  rank: number;
  participantId: string;
  displayName: string;
  teamId: string | null;
  teamName: string | null;
  teamEmoji: string | null;
  fastestLegSeconds: number;
  fastestLegRoundNumber: number;
  fastestLegCourseName: string | null;
  averageSeconds: number;
  timedLegsCount: number;
  totalCompletedLegsCount: number;
}

/**
 * Pure individual-only opt-in Speed Leaderboard computation.
 *
 * Privacy & product guarantees:
 * - Includes ONLY Participants with `showTimesOnLeaderboard === true` who have >= 1 completed timed Leg
 *   (`status === 'completed' && durationSeconds != null && durationSeconds > 0`).
 * - Strictly excludes opted-out Participants, non-completed Legs, and timed-blank Legs.
 * - Strictly zero Team speed rankings (Team name/emoji is carried only as individual context).
 */
export function computeSpeedLeaderboard({
  participants,
  legs,
  teams,
  courses,
  sortBy = 'fastest',
}: SpeedLeaderboardInput): SpeedLeaderboardEntry[] {
  const optedInParticipants = new Map<string, Participant>();
  for (const participant of participants) {
    if (participant.showTimesOnLeaderboard) {
      optedInParticipants.set(participant.id, participant);
    }
  }

  if (optedInParticipants.size === 0) {
    return [];
  }

  const teamById = new Map<string, Team>(teams.map((team) => [team.id, team]));
  const courseById = new Map<string, Course>(courses.map((course) => [course.id, course]));

  const completedLegsByRunner = new Map<string, Leg[]>();
  for (const leg of legs) {
    if (leg.status !== 'completed' || !leg.runnerId) continue;
    if (!optedInParticipants.has(leg.runnerId)) continue;
    const list = completedLegsByRunner.get(leg.runnerId) ?? [];
    list.push(leg);
    completedLegsByRunner.set(leg.runnerId, list);
  }

  const rawEntries: Omit<SpeedLeaderboardEntry, 'rank'>[] = [];

  for (const [participantId, participant] of optedInParticipants.entries()) {
    const completedLegs = completedLegsByRunner.get(participantId) ?? [];
    const timedLegs = completedLegs.filter(
      (leg): leg is Leg & { durationSeconds: number } =>
        leg.durationSeconds !== null &&
        Number.isFinite(leg.durationSeconds) &&
        leg.durationSeconds > 0,
    );

    if (timedLegs.length === 0) {
      continue;
    }

    let fastestLeg = timedLegs[0]!;
    let durationSum = 0;
    for (const leg of timedLegs) {
      durationSum += leg.durationSeconds;
      if (
        leg.durationSeconds < fastestLeg.durationSeconds ||
        (leg.durationSeconds === fastestLeg.durationSeconds &&
          leg.roundNumber < fastestLeg.roundNumber)
      ) {
        fastestLeg = leg;
      }
    }

    const averageSeconds = Math.round(durationSum / timedLegs.length);
    const team = participant.teamId ? (teamById.get(participant.teamId) ?? null) : null;
    const fastestCourse = fastestLeg.courseId
      ? (courseById.get(fastestLeg.courseId) ?? null)
      : null;

    rawEntries.push({
      participantId: participant.id,
      displayName: participant.displayName,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      teamEmoji: team?.emoji ?? null,
      fastestLegSeconds: fastestLeg.durationSeconds,
      fastestLegRoundNumber: fastestLeg.roundNumber,
      fastestLegCourseName: fastestCourse?.name ?? null,
      averageSeconds,
      timedLegsCount: timedLegs.length,
      totalCompletedLegsCount: completedLegs.length,
    });
  }

  rawEntries.sort((a, b) => {
    if (sortBy === 'average') {
      return (
        a.averageSeconds - b.averageSeconds ||
        a.fastestLegSeconds - b.fastestLegSeconds ||
        a.displayName.localeCompare(b.displayName)
      );
    }
    return (
      a.fastestLegSeconds - b.fastestLegSeconds ||
      a.averageSeconds - b.averageSeconds ||
      a.displayName.localeCompare(b.displayName)
    );
  });

  // Standard competition ranking (1, 1, 3 on exact tie of the active metric)
  let previousMetric: number | null = null;
  let currentRank = 0;
  return rawEntries.map((entry, idx) => {
    const metric = sortBy === 'average' ? entry.averageSeconds : entry.fastestLegSeconds;
    if (previousMetric === null || metric !== previousMetric) {
      currentRank = idx + 1;
      previousMetric = metric;
    }
    return {
      rank: currentRank,
      ...entry,
    };
  });
}
