import type { EventSnapshot, Leg, LegStatus, Team } from '../../types/domain';
import { evaluateAutoBadges, resolveOrganizerBadgeAwards } from '../badges/autoBadges';
import {
  computeLegEta,
  formatClockTime,
  formatElapsedSeconds,
  getPrimaryCourse,
} from '../race-day/raceDayUtils';

const ROUND_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface OutOnCourseCardItem {
  legId: string;
  roundNumber: number;
  runnerName: string;
  teamName: string;
  teamEmoji: string | null;
  teamColorHex: string | null;
  courseName: string;
  elapsedSeconds: number;
  elapsedLabel: string;
  etaLabel: string;
  progressPercent: number;
  isOver60Min: boolean;
}

export interface OnDeckRunnerItem {
  legId: string;
  runnerName: string;
  teamName: string;
  teamEmoji: string | null;
  courseName: string;
}

export interface OnDeckSummary {
  roundNumber: number;
  scheduledStartAt: string;
  scheduledStartLabel: string;
  countdownSeconds: number;
  countdownLabel: string;
  isReadyNow: boolean;
  runners: OnDeckRunnerItem[];
}

export interface DashboardTeamSegment {
  roundNumber: number;
  status: LegStatus;
}

export interface DashboardTeamMilestone {
  kind: 'halfway' | '50k_finisher';
  emoji: string;
  label: string;
}

export interface DashboardTeamRow {
  team: Team;
  completedLegsCount: number;
  outOnCourseCount: number;
  openCount: number;
  completedKm: number;
  segments: DashboardTeamSegment[];
  milestone: DashboardTeamMilestone | null;
}

export interface DashboardBadgeTickerItem {
  id: string;
  emoji: string;
  title: string;
  recipientName: string;
  recipientType: 'team' | 'participant';
  source: 'organizer' | 'auto';
  note: string | null;
}

export function selectCollectiveKm(snapshot: Pick<EventSnapshot, 'legs'>): number {
  const completedCount = snapshot.legs.filter((leg) => leg.status === 'completed').length;
  return completedCount * 5;
}

/**
 * Resolves the live active Round (1..10) for the Basecamp Dashboard header pill
 * from started/elapsed scheduled Rounds and active `out_on_course` Legs.
 */
export function selectActiveRoundNumber(
  snapshot: Pick<EventSnapshot, 'rounds' | 'legs'>,
  nowMs: number,
): number {
  let latestActive = 1;

  for (const round of snapshot.rounds) {
    const scheduledMs = Date.parse(round.scheduledStartAt);
    if (round.startedAt !== null || (!Number.isNaN(scheduledMs) && scheduledMs <= nowMs)) {
      if (round.roundNumber > latestActive) {
        latestActive = round.roundNumber;
      }
    }
  }

  for (const leg of snapshot.legs) {
    if (leg.status === 'out_on_course' && leg.roundNumber > latestActive) {
      latestActive = leg.roundNumber;
    }
  }

  return Math.max(1, Math.min(10, latestActive));
}

export function formatDashboardCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safe / 86_400);
  if (days >= 1) {
    const hours = Math.floor((safe % 86_400) / 3600);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours >= 1) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function selectOutOnCourseRunners(
  snapshot: EventSnapshot,
  nowMs: number,
): OutOnCourseCardItem[] {
  const participantById = new Map(snapshot.participants.map((p) => [p.id, p]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const courseById = new Map(snapshot.courses.map((c) => [c.id, c]));
  const primaryCourse = getPrimaryCourse(snapshot.courses);
  const timezone = snapshot.event.timezone;

  const outLegs = snapshot.legs.filter((leg) => leg.status === 'out_on_course');

  const items: Array<OutOnCourseCardItem & { startedMs: number }> = outLegs.map((leg) => {
    const runner = leg.runnerId ? (participantById.get(leg.runnerId) ?? null) : null;
    const team = teamById.get(leg.teamId) ?? null;
    const course = (leg.courseId ? courseById.get(leg.courseId) : null) ?? primaryCourse;
    const metrics = computeLegEta(leg, runner, nowMs);

    const elapsedSeconds = metrics?.elapsedSeconds ?? 0;
    const isOver60Min = metrics?.isOver60Min ?? false;
    const progressPercent = metrics?.progressPercent ?? 4;
    const startedMs = leg.startedAt ? Date.parse(leg.startedAt) : nowMs;

    let etaLabel: string;
    if (isOver60Min) {
      etaLabel = 'Taking their time · cheer when back';
    } else if (metrics?.etaMs != null) {
      const remainingMin = Math.round((metrics.etaMs - nowMs) / 60_000);
      const etaClock = formatClockTime(metrics.etaMs, timezone);
      if (remainingMin > 1) {
        etaLabel = etaClock ? `ETA ~${etaClock} (~${remainingMin}m)` : `ETA ~${remainingMin}m`;
      } else if (remainingMin >= -5) {
        etaLabel = 'Due back any minute';
      } else {
        etaLabel = 'Cruising in · due back soon';
      }
    } else {
      etaLabel = 'Steady pace on Course';
    }

    return {
      legId: leg.id,
      roundNumber: leg.roundNumber,
      runnerName: runner?.displayName ?? 'Runner',
      teamName: team?.name ?? 'Team',
      teamEmoji: team?.emoji ?? null,
      teamColorHex: team?.colorHex ?? null,
      courseName: course?.name ?? '5K Course',
      elapsedSeconds,
      elapsedLabel: formatElapsedSeconds(elapsedSeconds),
      etaLabel,
      progressPercent,
      isOver60Min,
      startedMs: Number.isNaN(startedMs) ? nowMs : startedMs,
    };
  });

  // Sort longest out on Course first (deterministic tie-break by Runner name)
  items.sort(
    (a, b) =>
      a.startedMs - b.startedMs ||
      a.roundNumber - b.roundNumber ||
      a.runnerName.localeCompare(b.runnerName),
  );

  return items.map(({ startedMs: _startedMs, ...item }) => item);
}

export function selectOnDeckSummary(
  snapshot: EventSnapshot,
  nowMs: number,
): OnDeckSummary | null {
  const sortedRounds = [...snapshot.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const unstartedRounds = sortedRounds.filter((r) => r.startedAt === null);

  if (unstartedRounds.length === 0) {
    return null;
  }

  // Prefer the earliest unstarted Round still in the future; otherwise the earliest unstarted Round ready now.
  const nextRound =
    unstartedRounds.find((r) => {
      const ms = Date.parse(r.scheduledStartAt);
      return !Number.isNaN(ms) && ms > nowMs;
    }) ?? unstartedRounds[0];

  const scheduledMs = Date.parse(nextRound.scheduledStartAt);
  const countdownSeconds = Number.isNaN(scheduledMs)
    ? 0
    : Math.max(0, Math.floor((scheduledMs - nowMs) / 1000));

  const participantById = new Map(snapshot.participants.map((p) => [p.id, p]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const courseById = new Map(snapshot.courses.map((c) => [c.id, c]));
  const primaryCourse = getPrimaryCourse(snapshot.courses);

  const runners: OnDeckRunnerItem[] = snapshot.legs
    .filter(
      (leg) =>
        leg.roundNumber === nextRound.roundNumber &&
        leg.status === 'scheduled' &&
        leg.runnerId !== null,
    )
    .map((leg) => {
      const runner = leg.runnerId ? participantById.get(leg.runnerId) : null;
      const team = teamById.get(leg.teamId);
      const course = (leg.courseId ? courseById.get(leg.courseId) : null) ?? primaryCourse;
      return {
        legId: leg.id,
        runnerName: runner?.displayName ?? 'Runner',
        teamName: team?.name ?? 'Team',
        teamEmoji: team?.emoji ?? null,
        courseName: course?.name ?? '5K Course',
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.runnerName.localeCompare(b.runnerName));

  return {
    roundNumber: nextRound.roundNumber,
    scheduledStartAt: nextRound.scheduledStartAt,
    scheduledStartLabel: formatClockTime(nextRound.scheduledStartAt, snapshot.event.timezone),
    countdownSeconds,
    countdownLabel: formatDashboardCountdown(countdownSeconds),
    isReadyNow: countdownSeconds === 0,
    runners,
  };
}

export function selectDashboardTeams(snapshot: Pick<EventSnapshot, 'teams' | 'legs'>): DashboardTeamRow[] {
  const sortedTeams = [...snapshot.teams].sort((a, b) => a.name.localeCompare(b.name));
  const legsByTeam = new Map<string, Leg[]>();
  for (const leg of snapshot.legs) {
    const list = legsByTeam.get(leg.teamId) ?? [];
    list.push(leg);
    legsByTeam.set(leg.teamId, list);
  }

  return sortedTeams.map((team) => {
    const teamLegs = legsByTeam.get(team.id) ?? [];
    const legByRound = new Map<number, Leg>();
    for (const leg of teamLegs) {
      legByRound.set(leg.roundNumber, leg);
    }

    const segments: DashboardTeamSegment[] = ROUND_NUMBERS.map((roundNumber) => ({
      roundNumber,
      status: legByRound.get(roundNumber)?.status ?? 'scheduled',
    }));

    const completedLegsCount = segments.filter((s) => s.status === 'completed').length;
    const outOnCourseCount = segments.filter((s) => s.status === 'out_on_course').length;
    const openCount = Math.max(0, 10 - completedLegsCount - outOnCourseCount);
    const completedKm = completedLegsCount * 5;

    let milestone: DashboardTeamMilestone | null = null;
    if (completedLegsCount >= 10) {
      milestone = {
        kind: '50k_finisher',
        emoji: '🏁',
        label: '50K Finisher',
      };
    } else if (completedLegsCount >= 5) {
      milestone = {
        kind: 'halfway',
        emoji: '🏔️',
        label: 'Halfway There · 25K',
      };
    }

    return {
      team,
      completedLegsCount,
      outOnCourseCount,
      openCount,
      completedKm,
      segments,
      milestone,
    };
  });
}

export function selectLiveBadgeTickerItems(snapshot: EventSnapshot): DashboardBadgeTickerItem[] {
  const items: DashboardBadgeTickerItem[] = [];

  // 1. Organizer-awarded superlatives (newest first)
  const organizerAwards = resolveOrganizerBadgeAwards(snapshot);
  for (const resolved of organizerAwards) {
    items.push({
      id: `org:${resolved.award.id}`,
      emoji: resolved.definition.emoji,
      title: resolved.definition.name,
      recipientName: resolved.recipientName,
      recipientType: resolved.recipientType,
      source: 'organizer',
      note: resolved.award.note,
    });
  }

  // 2. Live auto-calculated Badges (Team milestones first, then Participant Badges)
  const auto = evaluateAutoBadges({
    teams: snapshot.teams,
    participants: snapshot.participants,
    legs: snapshot.legs,
    supplyItems: snapshot.supplyItems,
    supplyClaims: snapshot.supplyClaims,
  });

  for (const earned of auto.teamBadges) {
    items.push({
      id: `auto:team:${earned.teamId}:${earned.badge.id}`,
      emoji: earned.badge.emoji,
      title: earned.badge.name,
      recipientName: earned.teamName,
      recipientType: 'team',
      source: 'auto',
      note: null,
    });
  }

  for (const earned of auto.participantBadges) {
    items.push({
      id: `auto:participant:${earned.participantId}:${earned.badge.id}`,
      emoji: earned.badge.emoji,
      title: earned.badge.name,
      recipientName: earned.participantName,
      recipientType: 'participant',
      source: 'auto',
      note: null,
    });
  }

  return items;
}
