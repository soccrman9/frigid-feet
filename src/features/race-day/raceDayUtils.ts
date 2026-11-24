import type { Course, Leg, Participant, Round } from '../../types/domain';

export type RoundPillState = 'completed' | 'active' | 'upcoming';

export interface LegEtaMetrics {
  elapsedSeconds: number;
  etaMs: number | null;
  progressPercent: number;
  isOver60Min: boolean;
}

export type ThumbDockState =
  | { kind: 'hidden' }
  | {
      kind: 'upcoming';
      leg: Leg;
      round: Round | null;
      course: Course | null;
      countdownSeconds: number;
    }
  | {
      kind: 'out_on_course';
      leg: Leg;
      round: Round | null;
      course: Course | null;
      elapsedSeconds: number;
    }
  | {
      kind: 'all_done';
      completedCount: number;
      totalKm: number;
    };

export function getPrimaryCourse(courses: Course[]): Course | null {
  if (courses.length === 0) return null;
  const sorted = [...courses].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );
  return sorted[0] ?? null;
}

export function getActiveRoundNumber(rounds: Round[], legs: Leg[], nowMs: number): number {
  let latestActive = 1;

  for (const round of rounds) {
    const scheduledMs = Date.parse(round.scheduledStartAt);
    if (round.startedAt !== null || (!Number.isNaN(scheduledMs) && scheduledMs <= nowMs)) {
      if (round.roundNumber > latestActive) {
        latestActive = round.roundNumber;
      }
    }
  }

  for (const leg of legs) {
    if (leg.status !== 'scheduled' && leg.roundNumber > latestActive) {
      latestActive = leg.roundNumber;
    }
  }

  return Math.max(1, Math.min(10, latestActive));
}

export function getRoundPillState(
  roundNumber: number,
  activeRoundNumber: number,
  _rounds: Round[],
  legs: Leg[],
): RoundPillState {
  if (roundNumber === activeRoundNumber) {
    return 'active';
  }

  const assignedLegs = legs.filter(
    (leg) => leg.roundNumber === roundNumber && leg.runnerId !== null,
  );
  if (assignedLegs.length > 0 && assignedLegs.every((leg) => leg.status === 'completed')) {
    return 'completed';
  }

  return 'upcoming';
}

export function formatElapsedSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return 'READY NOW';

  const days = Math.floor(safe / 86_400);
  if (days >= 1) {
    const hours = Math.floor((safe % 86_400) / 3600);
    return hours > 0 ? `IN ${days}d ${hours}h` : `IN ${days}d`;
  }

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours >= 1) {
    return `IN ${hours}h ${minutes}m`;
  }

  const seconds = safe % 60;
  return `IN ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatClockTime(isoOrMs: string | number, timezone?: string | null): string {
  const date = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }
}

export function parseDurationInput(raw: string): { valid: boolean; seconds: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, seconds: null };
  }

  // Plain positive minutes (e.g. "28")
  if (/^\d+$/.test(trimmed)) {
    const minutes = Number(trimmed);
    if (minutes <= 0 || minutes > 600) {
      return { valid: false, seconds: null };
    }
    return { valid: true, seconds: minutes * 60 };
  }

  const parts = trimmed.split(':');
  if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (seconds >= 60) {
      return { valid: false, seconds: null };
    }
    const total = minutes * 60 + seconds;
    return total > 0 ? { valid: true, seconds: total } : { valid: false, seconds: null };
  }

  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    if (minutes >= 60 || seconds >= 60) {
      return { valid: false, seconds: null };
    }
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? { valid: true, seconds: total } : { valid: false, seconds: null };
  }

  return { valid: false, seconds: null };
}

export function computeLegEta(
  leg: Leg,
  runner: Participant | null,
  nowMs: number,
): LegEtaMetrics | null {
  if (leg.status !== 'out_on_course' || !leg.startedAt) {
    return null;
  }

  const startedMs = Date.parse(leg.startedAt);
  if (Number.isNaN(startedMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const isOver60Min = elapsedSeconds >= 3600;

  if (runner?.rough5kMinutes && runner.rough5kMinutes > 0) {
    const estimatedSeconds = runner.rough5kMinutes * 60;
    const etaMs = startedMs + estimatedSeconds * 1000;
    const progressPercent = Math.min(
      100,
      Math.max(4, Math.round((elapsedSeconds / estimatedSeconds) * 100)),
    );
    return { elapsedSeconds, etaMs, progressPercent, isOver60Min };
  }

  // Calm visual progress bar reference when Runner has not entered a rough 5K pace
  const referenceSeconds = 35 * 60;
  const progressPercent = Math.min(
    100,
    Math.max(4, Math.round((elapsedSeconds / referenceSeconds) * 100)),
  );
  return { elapsedSeconds, etaMs: null, progressPercent, isOver60Min };
}

export function canViewLegDuration(
  leg: Leg,
  runner: Participant | null,
  activeParticipantId: string | null,
): boolean {
  if (leg.durationSeconds === null) {
    return false;
  }
  if (activeParticipantId !== null && leg.runnerId === activeParticipantId) {
    return true;
  }
  return Boolean(runner?.showTimesOnLeaderboard);
}

export function canActOnLeg(
  leg: Leg,
  activeParticipant: Participant | null,
  isOrganizer: boolean,
): boolean {
  if (isOrganizer) {
    return true;
  }
  if (!activeParticipant || activeParticipant.rsvpStatus !== 'going_runner') {
    return false;
  }
  if (leg.runnerId !== null && leg.runnerId === activeParticipant.id) {
    return true;
  }
  if (activeParticipant.teamId !== null && activeParticipant.teamId === leg.teamId) {
    return true;
  }
  return false;
}

export function getThumbDockState({
  activeParticipant,
  legs,
  rounds,
  courses,
  nowMs,
}: {
  activeParticipant: Participant | null;
  legs: Leg[];
  rounds: Round[];
  courses: Course[];
  nowMs: number;
}): ThumbDockState {
  if (!activeParticipant || activeParticipant.rsvpStatus !== 'going_runner') {
    return { kind: 'hidden' };
  }

  const myLegs = legs
    .filter((leg) => leg.runnerId === activeParticipant.id)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  if (myLegs.length === 0) {
    return { kind: 'hidden' };
  }

  const primaryCourse = getPrimaryCourse(courses);
  const findCourse = (courseId: string | null) =>
    courses.find((c) => c.id === courseId) ?? primaryCourse;
  const findRound = (roundNumber: number) =>
    rounds.find((r) => r.roundNumber === roundNumber) ?? null;

  const outLeg = myLegs.find((leg) => leg.status === 'out_on_course');
  if (outLeg) {
    const startedMs = outLeg.startedAt ? Date.parse(outLeg.startedAt) : nowMs;
    const elapsedSeconds = Number.isNaN(startedMs)
      ? 0
      : Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    return {
      kind: 'out_on_course',
      leg: outLeg,
      round: findRound(outLeg.roundNumber),
      course: findCourse(outLeg.courseId),
      elapsedSeconds,
    };
  }

  const nextScheduled = myLegs.find((leg) => leg.status === 'scheduled');
  if (nextScheduled) {
    const round = findRound(nextScheduled.roundNumber);
    const scheduledMs = round ? Date.parse(round.scheduledStartAt) : nowMs;
    const countdownSeconds = Number.isNaN(scheduledMs)
      ? 0
      : Math.max(0, Math.floor((scheduledMs - nowMs) / 1000));
    return {
      kind: 'upcoming',
      leg: nextScheduled,
      round,
      course: findCourse(nextScheduled.courseId),
      countdownSeconds,
    };
  }

  return {
    kind: 'all_done',
    completedCount: myLegs.length,
    totalKm: myLegs.length * 5,
  };
}

export function buildMilestoneToastMessage(
  previousCompletedCount: number,
  nextCompletedCount: number,
  runnerName: string | null,
  completedTeamName: string | null,
  teamCompletedLegs: number,
): string | null {
  if (nextCompletedCount <= previousCompletedCount) {
    return null;
  }

  const totalKm = nextCompletedCount * 5;
  if (teamCompletedLegs === 10 && completedTeamName) {
    return `${completedTeamName} reached 50K! Friends hit ${totalKm} km together!`;
  }
  if (totalKm % 50 === 0) {
    return `${totalKm} km reached together!`;
  }
  if (totalKm % 25 === 0) {
    return `Friends hit ${totalKm} km together!`;
  }
  if (runnerName) {
    return `${runnerName} finished 5K — Friends hit ${totalKm} km together!`;
  }
  return `Friends hit ${totalKm} km together!`;
}

export function generateMutationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
