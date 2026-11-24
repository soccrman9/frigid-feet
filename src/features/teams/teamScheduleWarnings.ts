import type { Leg, Participant, Team } from '../../types/domain';

export type ScheduleWarningKind = 'outside_availability' | 'back_to_back';

export interface ScheduleWarning {
  kind: ScheduleWarningKind;
  message: string;
}

export interface TeamCoverageSummary {
  coveredCount: number;
  completedCount: number;
  outOnCourseCount: number;
  coveredRounds: number[];
  uncoveredRounds: number[];
  uncoveredSummary: string;
}

export const ALL_ROUND_NUMBERS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function formatRoundWindow(fromRound: number, toRound: number): string {
  return fromRound === toRound ? `Round ${fromRound}` : `Rounds ${fromRound}–${toRound}`;
}

export function formatUncoveredRounds(uncoveredRounds: readonly number[]): string {
  if (uncoveredRounds.length === 0) {
    return 'All 10 Rounds covered';
  }
  if (uncoveredRounds.length === 10) {
    return 'Rounds 1–10 open';
  }
  if (uncoveredRounds.length === 1) {
    return `Round ${uncoveredRounds[0]} open`;
  }
  if (uncoveredRounds.length === 2) {
    return `Rounds ${uncoveredRounds[0]} & ${uncoveredRounds[1]} open`;
  }
  const leading = uncoveredRounds.slice(0, -1).join(', ');
  const last = uncoveredRounds[uncoveredRounds.length - 1];
  return `Rounds ${leading} & ${last} open`;
}

export function getLegScheduleWarnings(
  leg: Leg,
  teamLegs: readonly Leg[],
  participantsById: ReadonlyMap<string, Participant>,
): ScheduleWarning[] {
  if (!leg.runnerId) {
    return [];
  }

  const warnings: ScheduleWarning[] = [];
  const runner = participantsById.get(leg.runnerId);

  if (
    runner &&
    (leg.roundNumber < runner.availableFromRound || leg.roundNumber > runner.availableToRound)
  ) {
    warnings.push({
      kind: 'outside_availability',
      message: `${runner.displayName}'s RSVP window is ${formatRoundWindow(
        runner.availableFromRound,
        runner.availableToRound,
      )} (still allowed).`,
    });
  }

  const adjacentRounds = teamLegs
    .filter(
      (other) =>
        other.id !== leg.id &&
        other.runnerId === leg.runnerId &&
        Math.abs(other.roundNumber - leg.roundNumber) === 1,
    )
    .map((other) => other.roundNumber)
    .sort((a, b) => a - b);

  if (adjacentRounds.length === 1) {
    warnings.push({
      kind: 'back_to_back',
      message: `Back-to-back with Round ${adjacentRounds[0]} (allowed — double-check rest time).`,
    });
  } else if (adjacentRounds.length >= 2) {
    warnings.push({
      kind: 'back_to_back',
      message: `Back-to-back with Rounds ${adjacentRounds[0]} & ${adjacentRounds[1]} (allowed — double-check rest time).`,
    });
  }

  return warnings;
}

export function getTeamCoverage(teamId: string, legs: readonly Leg[]): TeamCoverageSummary {
  const byRound = new Map<number, Leg>();
  for (const leg of legs) {
    if (leg.teamId === teamId) {
      byRound.set(leg.roundNumber, leg);
    }
  }

  const coveredRounds: number[] = [];
  const uncoveredRounds: number[] = [];
  let completedCount = 0;
  let outOnCourseCount = 0;

  for (const roundNumber of ALL_ROUND_NUMBERS) {
    const leg = byRound.get(roundNumber);
    if (!leg) {
      uncoveredRounds.push(roundNumber);
      continue;
    }

    if (leg.status === 'completed') {
      completedCount += 1;
    } else if (leg.status === 'out_on_course') {
      outOnCourseCount += 1;
    }

    const isCovered =
      leg.runnerId !== null || leg.status === 'completed' || leg.status === 'out_on_course';
    if (isCovered) {
      coveredRounds.push(roundNumber);
    } else {
      uncoveredRounds.push(roundNumber);
    }
  }

  return {
    coveredCount: coveredRounds.length,
    completedCount,
    outOnCourseCount,
    coveredRounds,
    uncoveredRounds,
    uncoveredSummary: formatUncoveredRounds(uncoveredRounds),
  };
}

export function sortTeamsAlphabetically(teams: readonly Team[]): Team[] {
  return [...teams].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export function getFreeAgents(participants: readonly Participant[]): Participant[] {
  return participants
    .filter((p) => p.rsvpStatus === 'going_runner' && p.teamId === null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

export function formatRoundStartTime(
  scheduledStartAt: string | undefined,
  timezone: string | null,
): string {
  if (!scheduledStartAt) return '';
  const date = new Date(scheduledStartAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone ?? undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}

export const TEAM_COLOR_PRESETS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#163A59', label: 'Polar Navy' },
  { hex: '#157A4B', label: 'Deep Spruce' },
  { hex: '#C86D09', label: 'Signal Amber' },
  { hex: '#1D6FA5', label: 'Glacier Blue' },
  { hex: '#6B3FA0', label: 'Alpine Plum' },
  { hex: '#9A3412', label: 'Trail Rust' },
];

export const TEAM_EMOJI_PRESETS: ReadonlyArray<string> = ['❄️', '🧊', '🦊', '🏔️', '🥾', '🔥', '🐻‍❄️', '⚡'];

export function sanitizeColorHex(colorHex: string | null | undefined): string | null {
  if (!colorHex) return null;
  const trimmed = colorHex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}
